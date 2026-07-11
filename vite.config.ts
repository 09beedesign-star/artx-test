import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { createApiKeyForAuthorization, getAdminSessionFromAuthorization, getApiKeyUserFromAuthorization, handleAuthAction, listApiKeysForAuthorization } from "./server/auth-store";
import { editImageWithPrompt, eraseImageObjects, generateImages, removeImageBackground } from "./server/image-generation";
import { searchReferenceImages } from "./server/reference-search";
import { generateText } from "./server/text-generation";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

function loadLocalEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
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

function vitePluginAiOrchestratorApi(): Plugin {
  const backendUrl = (process.env.VITE_TEST_BACKEND_URL || process.env.VITE_API_BASE_URL || "https://backstage.artxsd.com").replace(/\/+$/, "");

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
      server.middlewares.use("/api/ai/orchestrate", async (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        await proxyJson(req, res, "/api/ai/orchestrate");
      });

      server.middlewares.use("/api/images/tasks", async (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        await proxyJson(req, res, "/api/images/tasks");
      });

      server.middlewares.use("/api/images/tasks/", (req, res, next) => {
        if (req.method !== "GET") {
          return next();
        }
        void proxyJson(req, res, `/api/images/tasks${req.url || ""}`);
      });
    },
  };
}

function vitePluginAuthApi(): Plugin {
  return {
    name: "artx-auth-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/auth", (req, res, next) => {
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
      const loaderSrc = entrySrc.replace(/assets\/index-[^/]+\.js$/, "entry-loader.js");
      const loaderScript = `<script src="${loaderSrc}" data-entry="${entrySrc}" defer></script>`;
      if (html.includes(loaderScript)) return html;
      return html.replace(entryScriptPattern, "").replace("</body>", `    ${loaderScript}\n  </body>`);
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
