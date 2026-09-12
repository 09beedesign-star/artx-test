import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { createApiKeyForAuthorization, getAdminSessionFromAuthorization, getApiKeyUserFromAuthorization, getDevAutoLoginSession, handleAuthAction, listApiKeysForAuthorization } from "./server/auth-store";
import { resolveBackgroundImageTaskCapability } from "./server/background-image-capability";
import { editImageWithPrompt, eraseImageObjects, extractImageText, generateImages, listImageModelCatalog, removeImageBackground } from "./server/image-generation";
import { searchReferenceImages } from "./server/reference-search";
import { DEFAULT_IMAGE_EXPANSION_PROMPT } from "./shared/image-expansion";
import { generateText } from "./server/text-generation";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  // 与 server/env.ts 的加载顺序保持一致：.env.local 优先于 .env
  //（先读者胜出，因为已存在的 key 不会被覆盖）。
  // 此前这里只读 .env，导致 dev 模式下 .env.local 里的 ARTX_DEV_AUTO_LOGIN
  // 等本地开关完全不生效。
  loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
  loadEnvFile(path.join(PROJECT_ROOT, ".env"));
}

loadLocalEnv();

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

function vitePluginGithubPagesSpaFallback(): Plugin {
  return {
    name: "github-pages-spa-fallback",
    closeBundle() {
      if (process.env.GITHUB_PAGES !== "true") return;
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      const indexPath = path.join(outDir, "index.html");
      const notFoundPath = path.join(outDir, "404.html");
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
      }
    },
  };
}

function gitValue(command: string, fallback = "") {
  try {
    return execSync(command, { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function normalizeBackendUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://backstage.artxsd.com";
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "artx-test.onrender.com") return "https://backstage.artxsd.com";
  } catch {
    return trimmed;
  }
  return trimmed;
}

function getBuildMetadata() {
  const commitSha = process.env.VITE_COMMIT_SHA || process.env.GITHUB_SHA || gitValue("git rev-parse HEAD", "local");
  const branch =
    process.env.VITE_DEPLOY_BRANCH ||
    process.env.GITHUB_REF_NAME ||
    gitValue("git branch --show-current", "local");
  const buildTime = process.env.VITE_BUILD_TIME || new Date().toISOString();
  const testFrontendUrl = process.env.VITE_TEST_FRONTEND_URL || "https://backstage.artxsd.com";
  const testBackendUrl = normalizeBackendUrl(process.env.VITE_TEST_BACKEND_URL || process.env.VITE_API_BASE_URL || "https://backstage.artxsd.com");

  return {
    app: "artx",
    environment: process.env.GITHUB_PAGES === "true" ? "github-pages-test" : "local",
    commitSha,
    shortCommit: commitSha.slice(0, 7),
    branch,
    buildTime,
    repository: process.env.GITHUB_REPOSITORY || gitValue("git config --get remote.test.url", ""),
    githubRunId: process.env.GITHUB_RUN_ID || "",
    frontendUrl: testFrontendUrl,
    backendUrl: testBackendUrl,
    pagesBasePath:
      process.env.GITHUB_PAGES === "true"
        ? `/${process.env.GITHUB_PAGES_REPO || "artx"}/`
        : "/",
  };
}

function vitePluginDeploymentMetadata(): Plugin {
  return {
    name: "artx-deployment-metadata",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      if (!fs.existsSync(outDir)) {
        return;
      }

      const metadata = getBuildMetadata();
      fs.writeFileSync(path.join(outDir, "deployment.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
    },
  };
}

type JsonApiHandler = (payload: unknown) => Promise<unknown>;

function vitePluginJsonApi(name: string, route: string, handler: JsonApiHandler, fallbackError: string): Plugin {
  return {
    name,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(route, (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const payload = body ? JSON.parse(body) : {};
            const result = await handler(payload);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (error) {
            const message = error instanceof Error ? error.message : fallbackError;
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: message }));
          }
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// dev 环境的后台图像任务存储
//
// 生产在 server/index.ts 用模块级 backgroundImageTasks Map 存任务，但那个 Map
// 和 runBackgroundImageTask 都封在 startServer() 闭包里、未导出，无法直接复用，
// 因此这里按同样口径复刻一份 dev 专用的。
// ---------------------------------------------------------------------------

type DevBackgroundImageTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  input: Record<string, unknown>;
  images?: Array<{ src: string; width: number; height: number }>;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const devBackgroundImageTasks = new Map<string, DevBackgroundImageTask>();
const DEV_BACKGROUND_IMAGE_TASK_TIMEOUT_MS = 5 * 60 * 1000;

function pruneDevBackgroundImageTasks() {
  const now = Date.now();
  Array.from(devBackgroundImageTasks.entries()).forEach(([taskId, task]) => {
    if (now - task.updatedAt > 24 * 60 * 60 * 1000) {
      devBackgroundImageTasks.delete(taskId);
    }
  });
}

// 兜底超时：任务进程若中途异常退出（例如上游 SDK 抛在 Promise 之外），
// pending 会永远挂着，前端要轮询满 100 次才放弃。与生产 :352 逻辑一致。
function resolveDevBackgroundImageTask(task: DevBackgroundImageTask): DevBackgroundImageTask {
  if (task.status !== "pending") return task;
  if (Date.now() - task.createdAt <= DEV_BACKGROUND_IMAGE_TASK_TIMEOUT_MS) return task;
  return {
    ...task,
    status: "failed",
    error: "图片生成任务超时，请稍后重试",
    updatedAt: Date.now(),
  };
}

async function getDevUploadUsername() {
  const session = await getDevAutoLoginSession();
  return (session.body as { user?: { username?: string } })?.user?.username || "dev-tester";
}

// 复刻 server/index.ts:871 runBackgroundImageTask 的 capability 分发。
// 差异：不返回 tracking（dev 不做用量埋点），只返回落盘后的图片数组。
async function runDevBackgroundImageTask(
  input: Record<string, unknown>,
): Promise<Array<{ src: string; width: number; height: number }>> {
  const capability = resolveBackgroundImageTaskCapability(input);
  const operation = typeof input.operation === "string" && input.operation.trim()
    ? input.operation.trim()
    : capability;

  const [imageGeneration, storage] = await Promise.all([
    import("./server/image-generation"),
    import("./server/local-image-storage"),
  ]);
  const username = await getDevUploadUsername();

  const store = async (result: {
    images?: Array<{ src: string; width: number; height: number }>;
    providerTaskId?: string;
    providerTaskIds?: string[];
  }) => {
    if (!result.images?.length) return [];
    return storage.storeGeneratedImagesForUser(result.images, username, {
      providerTaskId: result.providerTaskId,
      providerTaskIds: result.providerTaskIds,
    });
  };

  switch (capability) {
    case "smart_background":
    case "create-background":
      return store(await imageGeneration.createProductBackground(input as never));
    case "image_edit":
    case "edit":
      return store(await imageGeneration.editImageWithPrompt(input as never));
    case "background_removal":
    case "remove-background":
      return store(await imageGeneration.removeImageBackground(input as never));
    case "image_enhance":
    case "enhance":
      return store(await imageGeneration.enhanceImage(input as never));
    case "watermark_removal":
    case "remove-watermark":
      return store(await imageGeneration.removeImageWatermark(input as never));
    case "image_erase":
    case "erase":
      return store(await imageGeneration.eraseImageObjects(input as never));
    case "element_background":
    case "element-background":
      return store(await imageGeneration.createElementBackgroundLayer(input as never));
    case "image_expansion":
    case "expand": {
      // 扩图入参在前端有三种写法（imageSrc / image_url / image_base64），
      // 生产在 :986 做了同样的归一，缺了会直接抛「缺少图片」。
      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = input[key];
          if (typeof value === "string" && value) return value;
        }
        return undefined;
      };
      const result = await imageGeneration.expandImageWithPicWish({
        ...input,
        imageSrc: pick("imageSrc", "image_url", "image_base64"),
        maskSrc: pick("maskSrc", "mask_url", "mask_base64"),
        prompt: typeof input.prompt === "string" && input.prompt.trim()
          ? input.prompt
          : DEFAULT_IMAGE_EXPANSION_PROMPT,
      } as never);
      return store(result);
    }
    case "text_to_image":
    default: {
      if (operation !== "generate" && capability !== "text_to_image") {
        throw new Error(`Unsupported background image task capability: ${capability}`);
      }
      const { AIOrchestrator } = await import("./server/ai-orchestrator");
      const result = await new AIOrchestrator().run({
        ...input,
        capability: "text_to_image",
        intent: "text_to_image",
        operation: "generate",
      });
      return store(result);
    }
  }
}

function vitePluginAiOrchestratorApi(): Plugin {
  // 注意用 trim() 过滤空串：`.env.local` 里常把 VITE_API_BASE_URL 置空来走同源请求，
  // 而空串对 `||` 来说是 falsy 但对解构默认值不是 —— 早前写法会让 backendUrl 变成 ""，
  // 代理 fetch("" + path) 直接失败并返回 502 fetch failed。
  const backendUrl = (
    process.env.VITE_TEST_BACKEND_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    "https://backstage.artxsd.com"
  ).replace(/\/+$/, "");

  async function proxyJson(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, targetPath: string) {
    try {
      const body = req.method === "GET" ? undefined : await readRequestJson(req);
      const response = await fetch(`${backendUrl}${targetPath}`, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          ...(typeof req.headers.authorization === "string" ? { Authorization: req.headers.authorization } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const contentType = response.headers.get("content-type") || "application/json";
      const text = await response.text();
      res.writeHead(response.status, { "Content-Type": contentType });
      res.end(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI proxy failed";
      sendJson(res, 502, { error: message });
    }
  }

  return {
    name: "artx-ai-test-backend-proxy",
    configureServer(server: ViteDevServer) {
      // 静态提供已落盘的图片。生产 express 在 server/index.ts:2228 用
      // express.static 挂了 /uploads，dev 此前没有等价实现 —— 出图落盘后
      // /uploads/... 会穿透到 SPA 兜底页返回 HTML，前端拿到的图直接是坏的。
      server.middlewares.use("/uploads", async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return next();
        }
        try {
          const { getUploadsRoot } = await import("./server/local-image-storage");
          const uploadsRoot = path.resolve(getUploadsRoot());
          const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
          const resolved = path.resolve(uploadsRoot, `.${requestPath}`);
          // 目录穿越防护：解析后的绝对路径必须仍在 uploads 根目录内。
          if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
            return next();
          }
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            return next();
          }
          const contentTypes: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
          };
          const contentType = contentTypes[path.extname(resolved).toLowerCase()] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=2592000" });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          fs.createReadStream(resolved).pipe(res);
        } catch {
          return next();
        }
      });

      // AI 助手编排：原先走 proxyJson 转发到远程后端，而 proxyJson 会原样透传
      // Authorization 头 —— 本地 dev token（artx-dev-auto-login-token）远程 sessions
      // 表里并不存在，于是恒定返回 401「登录已失效」，本地根本用不了 AI 助手。
      // 与 /api/ai/models 同样的思路：直接复用本地实现。AIOrchestrator 只依赖
      // .env 里的模型配置，不需要登录态，因此本地能跑通且用的是本地模型配置。
      //
      // 与生产 express（server/index.ts:1634）的差异，均为 dev 环境有意简化：
      //   - 不做 requireSessionUser / assertUserCanUseSelectableModel 权限校验
      //   - 不做 reserveAiRouteUsage / recordAiRouteUsage 用量计费与埋点
      // 出图仍按生产口径落盘到本地 uploads，避免前端拿到临时 URL 过期失效。
      server.middlewares.use("/api/ai/orchestrate", async (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        try {
          const payload = await readRequestJson(req);
          const { AIOrchestrator } = await import("./server/ai-orchestrator");
          const result = await new AIOrchestrator().run(payload);
          if (result.images?.length) {
            const { storeGeneratedImagesForUser } = await import("./server/local-image-storage");
            const session = await getDevAutoLoginSession();
            const username =
              (session.body as { user?: { username?: string } })?.user?.username || "dev-tester";
            const images = await storeGeneratedImagesForUser(result.images, username, {
              providerTaskId: result.providerTaskId,
              providerTaskIds: result.providerTaskIds,
            });
            sendJson(res, 200, { ...result, images });
            return;
          }
          sendJson(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI orchestration failed";
          sendJson(res, 500, { error: message });
        }
      });

      // 模型目录：dev 环境此前未注册这两条路由，请求会穿透到 SPA 兜底页拿到 HTML，
      // 前端 JSON.parse 失败后提示「AI 模型列表加载失败」（client/src/lib/ai.ts:345）。
      // server/index.ts:1181 已有本地实现且不依赖登录态，直接复用即可，
      // 不走 proxyJson —— 代理到远程后端反而会让本地 .env 里的模型配置失效。
      server.middlewares.use("/api/ai/models", async (req, res, next) => {
        if (req.method !== "GET") {
          return next();
        }
        try {
          sendJson(res, 200, await listImageModelCatalog());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Model catalog failed";
          sendJson(res, 500, { error: message });
        }
      });

      // 模型权益同理缺失。server/index.ts:1190 依赖 requireSessionUser，
      // 而 dev 插件没有等价的会话中间件；这里复用免登录会话拿 userId，
      // 与 /api/auth/dev-session（本文件 :445）取的是同一个测试账号。
      server.middlewares.use("/api/ai/model-entitlements", async (req, res, next) => {
        if (req.method !== "GET") {
          return next();
        }
        try {
          const session = await getDevAutoLoginSession();
          const userId = (session.body as { user?: { id?: string } })?.user?.id;
          if (!userId) {
            sendJson(res, 401, { error: "Dev session unavailable" });
            return;
          }
          const { getAiModelEntitlementsForUser } = await import("./server/admin-store");
          sendJson(res, 200, await getAiModelEntitlementsForUser(userId));
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI model entitlements failed";
          sendJson(res, 500, { error: message });
        }
      });

      // 后台图像任务：与 /api/ai/orchestrate 同因 —— 原先 proxyJson 转发到远程后端，
      // 而 Authorization 透传的是本地 dev token，远程 sessions 表里不存在，
      // 恒定 401「登录已失效」。画布右侧 AI 助手的出图走的正是这条链路
      // （client/src/lib/ai.ts:533 提交、:613 轮询），所以只修 orchestrate 不够。
      //
      // 这里按生产 express（server/index.ts:1281 / :1369 / runBackgroundImageTask :871）
      // 的口径复刻，dev 有意简化掉的部分：
      //   - requireSessionUser / assertUserCanUseSelectableModel 权限校验
      //   - reserveAiRouteUsage / recordAiRouteUsage 用量计费与埋点
      //   - 任务归属校验（dev 只有一个免登录账号，无多用户隔离需求）
      server.middlewares.use("/api/images/tasks", async (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        let taskId = `image-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          const payload = await readRequestJson(req);
          if (typeof payload.taskId === "string" && payload.taskId.trim()) {
            taskId = payload.taskId.trim();
          }
          pruneDevBackgroundImageTasks();

          // 前端 startImageGenerationTask 带重试（ai.ts:529），同一 taskId 可能被重复提交，
          // 此时必须回放已有任务而不是再跑一遍模型，否则一次生成会计两次费、出两张图。
          const existing = devBackgroundImageTasks.get(taskId);
          if (existing) {
            sendJson(res, 200, resolveDevBackgroundImageTask(existing));
            return;
          }

          try {
            resolveBackgroundImageTaskCapability(payload);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Image generation failed";
            sendJson(res, 400, { error: message, taskId, status: "failed" });
            return;
          }

          const task: DevBackgroundImageTask = {
            taskId,
            status: "pending",
            input: payload,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          devBackgroundImageTasks.set(taskId, task);
          // 先应答再跑任务：前端拿到 pending 后才开始轮询（ai.ts:548）。
          sendJson(res, 200, task);

          void (async () => {
            try {
              const images = await runDevBackgroundImageTask(payload);
              devBackgroundImageTasks.set(taskId, {
                ...task,
                status: "completed",
                images,
                updatedAt: Date.now(),
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Image generation failed";
              devBackgroundImageTasks.set(taskId, {
                ...task,
                status: "failed",
                error: message,
                updatedAt: Date.now(),
              });
            }
          })();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Image generation failed";
          sendJson(res, 500, { error: message, taskId, status: "failed" });
        }
      });

      server.middlewares.use("/api/images/tasks/", (req, res, next) => {
        if (req.method !== "GET") {
          return next();
        }
        // connect 会剥掉挂载前缀，此处 req.url 形如 `/image-task-xxx`。
        const rawTaskId = decodeURIComponent((req.url || "").split("?")[0].replace(/^\/+/, ""));
        if (!rawTaskId) {
          return next();
        }
        pruneDevBackgroundImageTasks();
        const rawTask = devBackgroundImageTasks.get(rawTaskId);
        if (!rawTask) {
          sendJson(res, 404, { error: "Image task not found", taskId: rawTaskId, status: "failed" });
          return;
        }
        const task = resolveDevBackgroundImageTask(rawTask);
        if (task !== rawTask) {
          devBackgroundImageTasks.set(rawTaskId, task);
        }
        sendJson(res, 200, task);
      });
    },
  };
}

function vitePluginAuthApi(): Plugin {
  return {
    name: "artx-auth-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/auth", (req, res, next) => {
        // 本地测试免登录入口。
        //
        // 生产 express（server/index.ts）里注册的是 GET /api/auth/dev-session，
        // 但 dev 模式走的是这里的 Vite 中间件；此前只处理 POST，GET 会被 next() 放行
        // 到前端路由并返回 HTML，前端 fetchDevSession() 解析 JSON 失败后静默回退，
        // 表现就是「开了免登录却仍然停在登录页」。这里补齐该路由，与生产行为对齐。
        const pathname = (req.url || "").replace(/^\/+/, "").split("?")[0];
        if (req.method === "GET" && pathname === "dev-session") {
          void (async () => {
            try {
              const result = await getDevAutoLoginSession();
              res.writeHead(result.status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(result.body));
            } catch (error) {
              const message = error instanceof Error ? error.message : "Dev session failed";
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: message }));
            }
          })();
          return;
        }

        if (req.method !== "POST") {
          return next();
        }

        const action = req.url?.replace(/^\/+/, "").split("?")[0];
        if (!action) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unknown auth action" }));
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const payload = body ? JSON.parse(body) : {};
            const result = await handleAuthAction(action as "register" | "login" | "me" | "logout", payload);
            res.writeHead(result.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.body));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Auth request failed";
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: message }));
          }
        });
      });
    },
  };
}

function vitePluginAdminApi(): Plugin {
  return {
    name: "artx-admin-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/admin/session", (req, res, next) => {
        if (req.method !== "GET") {
          return next();
        }

        getAdminSessionFromAuthorization(req.headers.authorization).then((result) => {
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.body));
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Admin session check failed";
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        });
      });
    },
  };
}

function readRequestJson(req: import("node:http").IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res: import("node:http").ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function vitePluginDeveloperApi(): Plugin {
  const tools = [
    {
      name: "artx_generate_image",
      description: "Use ArtX image generation to create images from a text prompt.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          ratio: { type: "string" },
          count: { type: "number" },
        },
        required: ["prompt"],
      },
    },
  ];

  return {
    name: "artx-developer-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/developer/api-keys", async (req, res, next) => {
        try {
          if (req.method === "GET") {
            const result = await listApiKeysForAuthorization(req.headers.authorization);
            sendJson(res, result.status, result.body);
            return;
          }
          if (req.method === "POST") {
            const payload = await readRequestJson(req);
            const result = await createApiKeyForAuthorization(req.headers.authorization, payload);
            sendJson(res, result.status, result.body);
            return;
          }
          next();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Developer API failed";
          sendJson(res, 500, { error: message });
        }
      });

      server.middlewares.use("/api/mcp/manifest", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        sendJson(res, 200, {
          name: "ArtX Image MCP",
          version: "0.1.0",
          transport: "streamable-http",
          endpoint: "/api/mcp",
          tools,
        });
      });

      server.middlewares.use("/api/mcp", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        try {
          const payload = await readRequestJson(req);
          const id = payload.id ?? null;
          const method = typeof payload.method === "string" ? payload.method : "";
          if (method === "initialize") {
            sendJson(res, 200, {
              jsonrpc: "2.0",
              id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "ArtX Image MCP", version: "0.1.0" },
              },
            });
            return;
          }
          const auth = await getApiKeyUserFromAuthorization(req.headers.authorization);
          if (auth.status !== 200) {
            sendJson(res, auth.status, auth.body);
            return;
          }
          if (method === "tools/list") {
            sendJson(res, 200, { jsonrpc: "2.0", id, result: { tools } });
            return;
          }
          sendJson(res, 404, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "MCP request failed";
          sendJson(res, 500, { error: message });
        }
      });
    },
  };
}

function vitePluginMoveBuiltEntryScriptToBody(): Plugin {
  return {
    name: "artx-move-built-entry-script-to-body",
    enforce: "post",
    transformIndexHtml(html) {
      const entryScriptPattern = /\n?\s*<script type="module" crossorigin src="([^"]*\/assets\/index-[^"]+\.js)"><\/script>/;
      const entrySrc = html.match(entryScriptPattern)?.[1];
      if (!entrySrc) return html;
      const moduleScript = `<script type="module" crossorigin src="${entrySrc}"></script>`;
      return html.replace(entryScriptPattern, "").replace("</body>", `    ${moduleScript}\n  </body>`);
    },
  };
}

const enableManusRuntime = process.env.NODE_ENV !== "production" && process.env.DISABLE_MANUS_RUNTIME !== "1";

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  enableManusRuntime ? vitePluginManusRuntime() : null,
  vitePluginMoveBuiltEntryScriptToBody(),
  vitePluginManusDebugCollector(),
  vitePluginStorageProxy(),
  vitePluginAuthApi(),
  vitePluginAdminApi(),
  vitePluginDeveloperApi(),
  vitePluginAiOrchestratorApi(),
  vitePluginJsonApi("artx-ai-image-api", "/api/images/generate", generateImages, "Image generation failed"),
  vitePluginJsonApi("artx-ai-remove-background-api", "/api/images/remove-background", removeImageBackground, "Background removal failed"),
  vitePluginJsonApi("artx-ai-edit-image-api", "/api/images/edit", editImageWithPrompt, "Image edit failed"),
  // 智能文案编辑的第一步（OCR 提取文字区域）。
  // 生产 express 在 server/index.ts:1446 注册了 POST /api/images/ocr，
  // 但 dev 模式走的是这里的 Vite 插件，此前漏注册导致该路由 404，
  // 前端 extractImageText() 直接失败 —— 表现为「智能文案调不动模型」。
  vitePluginJsonApi("artx-ai-image-ocr-api", "/api/images/ocr", extractImageText, "Image OCR failed"),
  vitePluginJsonApi("artx-ai-erase-image-api", "/api/images/erase", eraseImageObjects, "Image erase failed"),
  vitePluginJsonApi("artx-llm-api", "/api/llm", generateText, "AI request failed"),
  vitePluginJsonApi("artx-reference-search-api", "/api/references/search", async (payload) => {
    const query = typeof (payload as { query?: unknown })?.query === "string" ? (payload as { query: string }).query : "";
    const limit = typeof (payload as { limit?: unknown })?.limit === "number" ? (payload as { limit: number }).limit : 10;
    return searchReferenceImages(query, limit);
  }, "Reference search failed"),
  vitePluginGithubPagesSpaFallback(),
  vitePluginDeploymentMetadata(),
];

export default defineConfig({
  base:
    process.env.GITHUB_PAGES === "true"
      ? `/${process.env.GITHUB_PAGES_REPO || "artx"}/`
      : "/",
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true, // Keep the local preview URL stable.
    host: true,
      allowedHosts: [
        ".lhr.life",
        ".loca.lt",
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
