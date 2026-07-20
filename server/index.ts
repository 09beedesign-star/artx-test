import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./env";
import { AIOrchestrator, inferAiCapability } from "./ai-orchestrator";
import { resolveBackgroundImageTaskCapability } from "./background-image-capability";
import { createBrandKit, deleteBrandKit, getBrandKit, listBrandKits, parseBrandKitFromImage } from "./brand-kit";
import { createProductBackground, editImageWithPrompt, enhanceImage, eraseImageObjects, expandImageWithPicWish, extractImageText, generateImages, listImageModelCatalog, removeImageBackground, removeImageWatermark } from "./image-generation";
import { DEFAULT_IMAGE_MODEL_ID, getDefaultImageModelPriorityLabel } from "../shared/image-models";
import { getInspirationReferences } from "./inspiration-references";
import { cleanupExpiredUploads, getUploadRetentionDays, getUploadsRoot, storeGeneratedImagesForUser } from "./local-image-storage";
import { searchReferenceImages } from "./reference-search";
import { generateText } from "./text-generation";
import { recordCrossBorderCommerceGeneration } from "./cross-border-commerce-records";
import { createApiKeyForAuthorization, getAdminSessionFromAuthorization, getApiKeyUserFromAuthorization, getSessionUserFromAuthorization, handleAuthAction, listApiKeysForAuthorization } from "./auth-store";
import { acknowledgeCreditGiftNotification, createBillingOrder, createCreditRechargeOrder, getBillingOrderForPayment, getBillingSnapshotForUser, getCreditGiftNotificationsForUser, handleAdminApiRequest, markBillingOrderPaid, quoteAdminAiUsage, recordAiUsage, recordBillingPaymentCreated, recordBillingPaymentFailure, recordExternalAgentUsage, recordRiskEvent, releaseTestAccountAiUsage, reserveTestAccountAiUsage, submitUserFeedback } from "./admin-store";
import { getAllowedCorsOrigin } from "./cors";
import { sendOpsNotification } from "./notifications";
import { classifyApplicationSecuritySignal, createSecurityEventDetector, validateSecurityEventIngest } from "./security-events";
import { assertUserCanUseSelectableModel } from "./user-model-access";
import { listSelectableModelIds } from "./model-router";
import type { AiBillingCapability } from "../shared/ai-credit-policy";
import {
  CROSS_BORDER_CATEGORIES,
  CROSS_BORDER_COMMERCE_VERSION,
  CROSS_BORDER_MARKETS,
  CROSS_BORDER_TEMPLATES,
  composeCrossBorderCommerceContext,
  evaluateCrossBorderCommerceRisk,
  getAvailableCrossBorderPlatforms,
  type CrossBorderComposeInput,
} from "../shared/cross-border-commerce-agent";
import {
  createWallytPayment,
  getClientIp,
  getWallytConfig,
  getWallytConfigStatus,
  isWallytPaymentSuccess,
  parseWallytXml,
  queryWallytOrder,
  verifyWallytSignature,
} from "./wallyt-payment";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BackgroundImageTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  input: Record<string, unknown>;
  ownerUserId: string;
  images?: Array<{ src: string; width: number; height: number }>;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type SessionUser = {
  id: string;
  username: string;
  allowedAiModels: string[];
};

type AuthAction = "register" | "login" | "me" | "logout" | "social" | "forgot-password" | "reset-password" | "change-password" | "sms-send-code" | "sms-login" | "email-send-code" | "email-login";

type AiRouteTracking = {
  capabilityKey: AiBillingCapability;
  capability: string;
  provider: string;
  model?: string;
  failureMessage: string;
  outputUnits?: (result: unknown) => number;
  providerTaskIds?: (result: unknown) => string[] | undefined;
};

type AiUsageReservation = {
  taskId: string;
  active: boolean;
};

type McpJsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const backgroundImageTasks = new Map<string, BackgroundImageTask>();
const BACKGROUND_IMAGE_TASK_TIMEOUT_MS = 5 * 60 * 1000;
const UPLOAD_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const IMAGE_PROXY_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 ArtX/1.0";

function isImageContentType(contentType: string) {
  return contentType.startsWith("image/") || contentType === "application/octet-stream";
}

function getWechatGroupQrPath() {
  const configuredPath = process.env.WECHAT_GROUP_QR_PATH || "";
  if (configuredPath.trim()) return path.resolve(configuredPath);
  return path.join(process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data"), "community", "wechat-group-qr.jpg");
}

function scheduleUploadCleanup() {
  const runCleanup = () => {
    cleanupExpiredUploads()
      .then(result => {
        if (result.deletedFiles > 0 || result.removedDirectories > 0) {
          console.log(
            `[uploads] cleanup deleted ${result.deletedFiles} expired files and ${result.removedDirectories} empty directories; retention=${result.retentionDays}d root=${result.uploadsRoot}`
          );
        }
      })
      .catch(error => {
        console.warn("[uploads] cleanup failed", error instanceof Error ? error.message : error);
      });
  };

  console.log(`[uploads] temporary image retention is ${getUploadRetentionDays()} natural days`);
  runCleanup();
  const timer = setInterval(runCleanup, UPLOAD_CLEANUP_INTERVAL_MS);
  timer.unref?.();
}

function isLoopbackAddress(value?: string) {
  const address = value?.trim().toLowerCase() || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function getSecurityEventSource(req: express.Request) {
  const directPeer = req.socket.remoteAddress || "";
  if (!isLoopbackAddress(directPeer)) return directPeer;
  const forwarded = req.headers["x-forwarded-for"];
  const chain = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  return chain[chain.length - 1] || directPeer;
}

function decodeHtmlAttribute(value: string) {
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
  try {
    return decodeURIComponent(decoded);
  } catch {
    return decoded;
  }
}

function normalizeExternalImageCandidate(value: string, baseUrl: string) {
  const source = decodeHtmlAttribute(value)
    .trim()
    .replace(/^url\((['"]?)(.*?)\1\)$/i, "$2")
    .replace(/[),.;\]}]+$/g, "");
  if (!source || /^(javascript|mailto|tel):/i.test(source)) return "";
  if (/^\/\//.test(source)) return `https:${source}`;
  if (/^https?:\/\//i.test(source)) return source;
  if (/^data:image\//i.test(source)) return source;
  try {
    return new URL(source, baseUrl).toString();
  } catch {
    return "";
  }
}

function firstSrcsetCandidate(value: string) {
  const candidates = value
    .split(",")
    .map(candidate => {
      const [url = "", descriptor = ""] = candidate.trim().split(/\s+/);
      const width = Number(descriptor.match(/^(\d+)w$/)?.[1] || 0);
      const density = Number(descriptor.match(/^(\d+(?:\.\d+)?)x$/)?.[1] || 0);
      return { url, score: width || density * 1000 || 1 };
    })
    .filter(candidate => candidate.url);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || "";
}

function looksLikeImageCandidate(value: string) {
  return (
    /\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(value) ||
    /(?:image|img|pic|photo|thumb|cover|poster|media|original|large|mmbiz|qpic|hbimg|gtimg|qq\.com|shiply-cdn\.qq|alicdn|bdimg|sinaimg|byteimg|douyinpic|xiaohongshu|xhscdn|pinimg|twimg|fbcdn|cdninstagram|ggpht|googleusercontent|ytimg|wp\.com|cloudfront|akamaihd|unsplash|pexels|shopifycdn)/i.test(value)
  );
}

function imageCandidateScore(value: string) {
  let score = 0;
  if (/\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(value)) score += 20;
  if (/(?:original|orig|large|full|raw|master|media|image|photo|pic)/i.test(value)) score += 16;
  if (/(?:thumb|thumbnail|avatar|logo|icon|sprite|favicon|placeholder|blank|loading)/i.test(value)) score -= 18;
  const width = Number(value.match(/(?:^|[?&/_-])(?:w|width)[=/_-]?(\d{3,5})/i)?.[1] || 0);
  const height = Number(value.match(/(?:^|[?&/_-])(?:h|height)[=/_-]?(\d{3,5})/i)?.[1] || 0);
  score += Math.min(30, Math.round((width + height) / 120));
  return score;
}

function extractImageCandidatesFromHtml(html: string, baseUrl: string) {
  const candidates: Array<{ url: string; score: number }> = [];
  const add = (value: string, priority = 0) => {
    const normalized = normalizeExternalImageCandidate(value, baseUrl);
    if (normalized) candidates.push({ url: normalized, score: priority + imageCandidateScore(normalized) });
  };
  const metaPatterns = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src|image|thumbnail|thumbnailUrl)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src|image|thumbnail|thumbnailUrl)["'][^>]*>/gi,
    /<link[^>]+rel=["'][^"']*(?:image_src|preload|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:image_src|preload|apple-touch-icon)[^"']*["'][^>]*>/gi,
  ];
  metaPatterns.forEach(pattern => {
    Array.from(html.matchAll(pattern)).forEach(match => add(match[1] || "", 40));
  });
  Array.from(html.matchAll(/<(?:img|source|video|picture)[^>]+(?:src|srcset|data-src|data-srcset|data-url|data-thumb|data-thumb-url|data-original|data-original-src|data-image|data-image-url|data-full-src|data-large-src|data-lazy-src|data-actualsrc|data-zoom-src|data-backup|data-orig-file|data-media|data-pin-media|data-hi-res-src|poster|data-poster)=["']([^"']+)["'][^>]*>/gi)).forEach(match =>
    add(match[1] || "", 18)
  );
  Array.from(html.matchAll(/<(?:img|source)[^>]+(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi)).forEach(match =>
    add(firstSrcsetCandidate(match[1] || ""), 24)
  );
  Array.from(html.matchAll(/url\((['"]?)(.*?)\1\)/gi)).forEach(match =>
    add(match[2] || "", 8)
  );
  Array.from(
    html.matchAll(
      /["'](?:url|src|image|images|imageUrl|image_url|imageURL|original|originalUrl|original_url|originalURL|originUrl|raw|rawUrl|large|largeUrl|media|mediaUrl|contentUrl|thumbnail|thumbnailUrl|thumbnail_url|cover|coverUrl|cover_url|poster|posterUrl|poster_url|pic|picUrl|pic_url|img|imgUrl|img_url|displayUrl|display_url|downloadUrl|download_url)["']\s*:\s*["']([^"']+)["']/gi
    )
  ).forEach(match => add(match[1] || "", 28));
  Array.from(
    html.matchAll(
      /(?:url|src|image|imageUrl|originalUrl|mediaUrl|contentUrl|thumbnailUrl|coverUrl|posterUrl|picUrl|imgUrl|displayUrl|downloadUrl)\s*[:=]\s*["']([^"']+)["']/gi
    )
  ).forEach(match => add(match[1] || "", 22));
  Array.from(
    html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ).forEach(match => {
    const jsonText = match[1] || "";
    Array.from(jsonText.matchAll(/["'](?:url|contentUrl|image|thumbnailUrl)["']\s*:\s*["']([^"']+)["']/gi)).forEach(jsonMatch =>
      add(jsonMatch[1] || "", 36)
    );
  });
  Array.from(
    html.matchAll(/(?:https?:)?\\?\/\\?\/[^"'<>\\\s]+/gi)
  ).forEach(match => {
    const value = match[0] || "";
    if (looksLikeImageCandidate(value)) add(value, 6);
  });
  return Array.from(
    new Map(
      candidates
        .filter(candidate => looksLikeImageCandidate(candidate.url))
        .sort((a, b) => b.score - a.score)
        .map(candidate => [candidate.url, candidate.url])
    ).values()
  );
}

async function resolveHuabanPinImageUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (!/(^|\.)huaban\.com$/i.test(parsed.hostname)) return "";
  const pinId = parsed.pathname.match(/\/pins\/(\d+)/)?.[1];
  if (!pinId) return "";
  const headers = {
    "User-Agent": IMAGE_PROXY_USER_AGENT,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": url,
    "Origin": "https://huaban.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };
  const endpoints = [
    `https://api.huaban.com/pins/${pinId}/`,
    `https://api.huaban.com/pins/${pinId}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        redirect: "follow",
        headers,
      });
      if (!response.ok) continue;
      const payload = await response.json() as {
        pin?: { file?: { url?: string; key?: string } };
        file?: { url?: string; key?: string };
      };
      const file = payload.pin?.file || payload.file;
      if (file?.url) return file.url;
      if (file?.key) return `https://gd-hbimg-edge.huaban.com/${file.key}`;
    } catch {
      // Try the next Huaban endpoint shape.
    }
  }
  return "";
}

function getImageProxyHeaders(targetUrl: string, referer?: string) {
  const headers: Record<string, string> = {
    "User-Agent": IMAGE_PROXY_USER_AGENT,
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,text/html;q=0.6,*/*;q=0.5",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
  if (referer) headers.Referer = referer;
  try {
    const parsed = new URL(targetUrl);
    headers.Origin = `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Ignore malformed origin candidates; URL validity is checked by callers.
  }
  return headers;
}

function getImageProxyDocumentHeaders(targetUrl: string, referer?: string) {
  return {
    ...getImageProxyHeaders(targetUrl, referer),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Upgrade-Insecure-Requests": "1",
  };
}

function pruneBackgroundImageTasks() {
  const now = Date.now();
  Array.from(backgroundImageTasks.entries()).forEach(([taskId, task]) => {
    if (now - task.updatedAt > 24 * 60 * 60 * 1000) {
      backgroundImageTasks.delete(taskId);
    }
  });
}

function resolveBackgroundImageTask(task: BackgroundImageTask) {
  if (task.status !== "pending") return task;
  if (Date.now() - task.createdAt <= BACKGROUND_IMAGE_TASK_TIMEOUT_MS) return task;
  return {
    ...task,
    status: "failed" as const,
    error: "图片生成任务超时，请稍后重试",
    updatedAt: Date.now(),
  };
}

async function requireSessionUser(req: express.Request, res: express.Response): Promise<SessionUser | null> {
  const result = await getSessionUserFromAuthorization(req.headers.authorization);
  if (result.status !== 200 || !("user" in result.body)) {
    res.status(result.status).json(result.body);
    return null;
  }
  return {
    id: result.body.user.id,
    username: result.body.user.username,
    allowedAiModels: result.body.user.allowedAiModels,
  };
}

function getPublicAppUrl() {
  return (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || process.env.SITE_URL || "https://admin.artxsd.com").replace(/\/+$/, "");
}

function getRouteModel(body: unknown, fallback: string) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return typeof record.model === "string" && record.model.trim()
    ? record.model.trim()
    : fallback;
}

function getDefaultRouteImageModel(body: unknown) {
  return getRouteModel(body, process.env.AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL_ID);
}

function getImageOutputUnits(result: unknown) {
  const record = result && typeof result === "object" ? result as { images?: unknown[] } : {};
  return Math.max(1, Array.isArray(record.images) ? record.images.length : 1);
}

function getProviderTaskIds(result: unknown) {
  const record = result && typeof result === "object"
    ? result as { providerTaskId?: unknown; providerTaskIds?: unknown[] }
    : {};
  const ids = Array.isArray(record.providerTaskIds)
    ? record.providerTaskIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (typeof record.providerTaskId === "string" && record.providerTaskId.trim()) {
    ids.unshift(record.providerTaskId.trim());
  }
  return ids.length ? Array.from(new Set(ids)) : undefined;
}

function mcpResult(id: McpJsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function mcpError(id: McpJsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function mcpAgentSource(params: Record<string, unknown>) {
  const meta = params.meta && typeof params.meta === "object" ? params.meta as Record<string, unknown> : {};
  return typeof meta.agentSource === "string" && meta.agentSource.trim()
    ? meta.agentSource.trim().slice(0, 80)
    : "未标识 Agent";
}

function getMcpTools() {
  return [
    {
      name: "artx_health",
      description: "验证 ArtX API key 和 MCP 服务是否可用，不消耗积分。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "artx_generate_image",
      description: "使用 ArtX 图片生成能力根据提示词生成图片。该工具会消耗账号积分。",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "图片生成提示词" },
          model: { type: "string", description: "可选模型，例如 Image Two 或 Nano Banana" },
          ratio: { type: "string", description: "可选画幅比例，例如 1:1、4:5、16:9" },
          count: { type: "number", description: "生成数量，默认 1，最多 9" },
          skillId: { type: "string", description: "可选 ArtX Skill ID" },
        },
        required: ["prompt"],
        additionalProperties: true,
      },
    },
  ];
}

function capabilityFromOrchestrator(capability: string): AiBillingCapability {
  if (capability === "chat" || capability === "brand_kit_parse") return "text_generation";
  if (capability === "element_erasure") return "image_erase";
  if (capability === "text_to_image") return "text_to_image";
  if (capability === "background_removal" || capability === "remove-background") return "background_removal";
  if (capability === "image_enhance" || capability === "enhance") return "image_enhance";
  if (capability === "watermark_removal" || capability === "remove-watermark") return "watermark_removal";
  if (capability === "smart_background" || capability === "create-background") return "smart_background";
  if (capability === "image_expansion" || capability === "expand") return "image_expansion";
  if (capability === "image_edit" || capability === "edit") return "image_edit";
  if (capability === "image_erase" || capability === "erase") return "image_erase";
  if (capability === "image_ocr") return "image_ocr";
  return "text_generation";
}

function requestedAiOutputCount(input: unknown) {
  if (!input || typeof input !== "object") return 1;
  const body = input as Record<string, unknown>;
  const raw = body.count ?? body.imageCount ?? body.outputCount;
  const count = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(count) ? Math.max(1, Math.min(9, Math.round(count))) : 1;
}

function requestedOrchestratorCapability(input: unknown) {
  const body = input && typeof input === "object" ? input : {};
  return capabilityFromOrchestrator(inferAiCapability(body));
}

function createAiReservationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function reserveAiRouteUsage(input: {
  user: SessionUser;
  tracking: AiRouteTracking;
  request: unknown;
  taskId?: string;
}): Promise<AiUsageReservation> {
  const quote = await quoteAdminAiUsage({
    capability: input.tracking.capabilityKey,
    outputCount: requestedAiOutputCount(input.request),
  });
  const taskId = input.taskId || createAiReservationId("ai-request");
  const reservation = await reserveTestAccountAiUsage({
    userId: input.user.id,
    taskId,
    estimatedCredits: quote.chargedCredits,
  });
  return { taskId, active: reservation.status === "reserved" };
}

async function releaseAiRouteUsage(user: SessionUser, reservation?: AiUsageReservation) {
  if (!reservation?.active) return;
  await releaseTestAccountAiUsage({ userId: user.id, taskId: reservation.taskId });
}

function providerTokenUsage(result: unknown) {
  const usage = result && typeof result === "object"
    ? (result as { usage?: { promptTokens?: unknown; completionTokens?: unknown } }).usage
    : undefined;
  const promptTokens = typeof usage?.promptTokens === "number" ? usage.promptTokens : undefined;
  const completionTokens = typeof usage?.completionTokens === "number" ? usage.completionTokens : undefined;
  return { promptTokens, completionTokens };
}

function aiRequestErrorStatus(message: string) {
  if (message.includes("无权使用该模型")) return 403;
  if (message.includes("今日 AI 限额")) return 429;
  if (message.includes("测试账号")) return 403;
  return 500;
}

async function recordAiRouteUsage(input: {
  user: SessionUser;
  tracking: AiRouteTracking;
  startedAt: number;
  status: "success" | "failed";
  result?: unknown;
  error?: string;
}) {
  const outputUnits = input.status === "success"
    ? input.tracking.outputUnits?.(input.result) || getImageOutputUnits(input.result)
    : 0;
  const providerTaskIds = input.tracking.providerTaskIds?.(input.result) || getProviderTaskIds(input.result);
  const tokenUsage = providerTokenUsage(input.result);
  const record = await recordAiUsage({
    userId: input.user.id,
    username: input.user.username,
    capability: input.tracking.capability,
    capabilityKey: input.tracking.capabilityKey,
    provider: input.tracking.provider,
    model: input.tracking.model || "auto",
    status: input.status,
    latencyMs: Date.now() - input.startedAt,
    failureReason: input.error,
    outputUnits,
    providerTaskId: providerTaskIds?.[0],
    providerTaskIds,
    inputTokens: tokenUsage.promptTokens,
    outputTokens: tokenUsage.completionTokens,
  });

  if (input.status !== "success") {
    await sendOpsNotification({
      title: `AI 任务失败 · ${input.tracking.capability}`,
      message: `${input.user.username} 调用 ${input.tracking.model || "auto"} 失败：${input.error || input.tracking.failureMessage}`,
      severity: "warning",
      category: "ai",
      metadata: {
        userId: input.user.id,
        provider: input.tracking.provider,
        model: input.tracking.model,
        capability: input.tracking.capabilityKey,
      },
    });
  }

  return record;
}

async function handleTrackedAiRequest<T>(
  req: express.Request,
  res: express.Response,
  tracking: AiRouteTracking,
  handler: (user: SessionUser) => Promise<T>,
) {
  const startedAt = Date.now();
  let user: SessionUser | null = null;
  let reservation: AiUsageReservation | undefined;
  let successRecorded = false;
  try {
    user = await requireSessionUser(req, res);
    if (!user) return;
    assertUserCanUseSelectableModel(user, tracking.model, tracking.capabilityKey);
    reservation = await reserveAiRouteUsage({ user, tracking, request: req.body });
    const result = await handler(user);
    await recordAiRouteUsage({ user, tracking, startedAt, status: "success", result });
    successRecorded = true;
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : tracking.failureMessage;
    if (user && !successRecorded) {
      await recordAiRouteUsage({ user, tracking, startedAt, status: "failed", error: message });
    }
    if (!res.headersSent) res.status(aiRequestErrorStatus(message)).json({ error: message });
  } finally {
    if (user) await releaseAiRouteUsage(user, reservation);
  }
}

async function recordBillingPaymentFailureAndNotify(params: Parameters<typeof recordBillingPaymentFailure>[0]) {
  const result = await recordBillingPaymentFailure(params);
  await sendOpsNotification({
    title: "威富通支付异常",
    message: params.message,
    severity: "critical",
    category: "payment",
    metadata: {
      orderId: params.orderId,
      eventType: params.eventType,
      signatureValid: params.signatureValid,
      expectedAmountCents: params.expectedAmountCents,
    },
  });
  return result;
}

async function confirmWallytOrderPayment(orderId: string, actorName: string) {
  const order = await getBillingOrderForPayment(orderId);
  if (!order || order.status === "paid") return order;

  const raw = await queryWallytOrder(order.id);
  if (raw.status === "0" && raw.result_code === "0" && raw.trade_state === "SUCCESS") {
    await markBillingOrderPaid({
      orderId: order.id,
      actorName,
      expectedAmountCents: Number(raw.total_fee || order.amountCents),
      providerTransactionId: raw.transaction_id,
      eventType: actorName === "wallyt-auto-query" ? "wallyt_auto_query" : "wallyt_query",
    });
    return getBillingOrderForPayment(order.id);
  }

  if (raw.status === "0" && raw.result_code === "0" && (raw.trade_state === "CLOSED" || raw.trade_state === "PAYERROR")) {
    await recordBillingPaymentFailureAndNotify({
      orderId: order.id,
      actorName,
      expectedAmountCents: Number(raw.total_fee || order.amountCents),
      providerTransactionId: raw.transaction_id,
      signatureValid: true,
      eventType: "wallyt_query_failed",
      message: `威富通查询返回交易异常：${raw.trade_state}`,
    });
    return getBillingOrderForPayment(order.id);
  }

  return order;
}

function scheduleWallytPaymentConfirmation(orderId: string) {
  const attempts = [5_000, 15_000, 30_000, 60_000, 120_000];
  for (const delayMs of attempts) {
    setTimeout(() => {
      void confirmWallytOrderPayment(orderId, "wallyt-auto-query").catch((error) => {
        console.warn("[wallyt] auto payment confirmation failed", orderId, error instanceof Error ? error.message : error);
      });
    }, delayMs).unref?.();
  }
}

async function notifyAuthAction(action: AuthAction, body: Record<string, unknown>, result: { status: number; body: unknown }) {
  const responseBody = result.body && typeof result.body === "object" ? result.body as Record<string, unknown> : {};
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/[^\d]/g, "") : "";

  if ((action === "login" || action === "sms-login" || action === "sms-send-code") && result.status >= 400) {
    const target = action === "login"
      ? username || "unknown-login"
      : phone ? `phone:${phone.slice(0, 3)}****${phone.slice(-4)}` : "unknown-phone";
    const highRisk = result.status === 429;
    await recordRiskEvent({
      title: action === "login"
        ? highRisk ? "账号登录触发锁定" : "账号密码登录失败"
        : action === "sms-send-code"
          ? "短信验证码发送异常"
          : highRisk ? "短信验证码错误次数过多" : "短信验证码登录失败",
      detail: typeof responseBody.error === "string" ? responseBody.error : `auth ${action} failed with ${result.status}`,
      target,
      severity: highRisk ? "high" : "medium",
      actorName: "auth-risk",
      linkedSection: "risk",
    });
    return;
  }

  if (result.status < 200 || result.status >= 300) return;
  const user = responseBody.user && typeof responseBody.user === "object"
    ? responseBody.user as { username?: string; id?: string }
    : null;

  if ((action === "register" || action === "social" || action === "sms-login") && user?.username) {
    await sendOpsNotification({
      title: action === "sms-login" ? "短信验证码登录" : "新用户注册",
      message: `${user.username} 已完成${action === "sms-login" ? "短信验证码登录" : "注册"}`,
      severity: "info",
      category: "auth",
      metadata: { userId: user.id, action },
    });
  }

  if (action === "reset-password") {
    await sendOpsNotification({
      title: "用户密码已重置",
      message: "有用户完成了密码重置流程。",
      severity: "info",
      category: "auth",
    });
  }
}

async function storeImageResultForUser<T extends {
  images?: Array<{ src: string; width: number; height: number }>;
  providerTaskId?: string;
  providerTaskIds?: string[];
}>(result: T, username: string): Promise<T> {
  if (!result.images?.length) return result;
  const images = await storeGeneratedImagesForUser(result.images, username, {
    providerTaskId: result.providerTaskId,
    providerTaskIds: result.providerTaskIds,
  });
  return { ...result, images };
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const orchestrator = new AIOrchestrator();
  const securityEventDetector = createSecurityEventDetector({
    secret: process.env.ADMIN_SESSION_SECRET || "",
    record: async (event) => {
      await recordRiskEvent({
        title: event.title,
        detail: event.detail,
        target: event.target,
        severity: event.severity,
        actorName: "security-detector",
        linkedSection: "risk",
      });
      if (event.severity === "high") {
        void sendOpsNotification({
          title: event.title,
          message: event.detail,
          severity: "critical",
          category: "security",
          metadata: { rule: event.rule, count: event.count, target: event.target },
        });
      }
    },
  });

  async function runBackgroundImageTask(input: Record<string, unknown>, user: SessionUser) {
    const capability = resolveBackgroundImageTaskCapability(input);
    const operation = typeof input.operation === "string" && input.operation.trim()
      ? input.operation.trim()
      : capability;
    switch (capability) {
      case "smart_background":
      case "create-background": {
        const result = await createProductBackground(input as Parameters<typeof createProductBackground>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "smart_background" as const,
            capability: "智能产品图 / 海报一键生成",
            provider: "PicWish 主体保护 + Image2/Gemini 背景",
            model: getDefaultImageModelPriorityLabel(),
            failureMessage: "Create background failed",
          },
        };
      }
      case "image_edit":
      case "edit": {
        const result = await editImageWithPrompt(input as Parameters<typeof editImageWithPrompt>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "image_edit" as const,
            capability: "图片编辑",
            provider: "AI_IMAGE",
            model: getDefaultRouteImageModel(input),
            failureMessage: "Image edit failed",
          },
        };
      }
      case "background_removal":
      case "remove-background": {
        const result = await removeImageBackground(input as Parameters<typeof removeImageBackground>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "background_removal" as const,
            capability: "抠图 / 去背景",
            provider: "PicWish/佐糖",
            model: getRouteModel(input, "picwish-segmentation"),
            failureMessage: "Background removal failed",
          },
        };
      }
      case "image_enhance":
      case "enhance": {
        const result = await enhanceImage(input as Parameters<typeof enhanceImage>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "image_enhance" as const,
            capability: "高清图片生成",
            provider: "PicWish/佐糖",
            model: getRouteModel(input, "picwish-scale"),
            failureMessage: "Image enhancement failed",
          },
        };
      }
      case "watermark_removal":
      case "remove-watermark": {
        const result = await removeImageWatermark(input as Parameters<typeof removeImageWatermark>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "watermark_removal" as const,
            capability: "去水印",
            provider: "PicWish/佐糖",
            model: getRouteModel(input, "picwish-watermark"),
            failureMessage: "Image watermark removal failed",
          },
        };
      }
      case "image_erase":
      case "erase": {
        const result = await eraseImageObjects(input as Parameters<typeof eraseImageObjects>[0]);
        const stored = await storeImageResultForUser(result, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "image_erase" as const,
            capability: "图片擦除",
            provider: "PicWish/佐糖",
            model: getRouteModel(input, "picwish-inpaint"),
            failureMessage: "Image erase failed",
          },
        };
      }
      case "image_expansion":
      case "expand": {
        const imageSrc = typeof input.imageSrc === "string"
          ? input.imageSrc
          : typeof input.image_url === "string"
            ? input.image_url
            : typeof input.image_base64 === "string"
              ? input.image_base64
              : undefined;
        const maskSrc = typeof input.maskSrc === "string"
          ? input.maskSrc
          : typeof input.mask_url === "string"
            ? input.mask_url
            : typeof input.mask_base64 === "string"
              ? input.mask_base64
              : undefined;
        const result = await expandImageWithPicWish({
          ...input,
          imageSrc,
          maskSrc,
          prompt: typeof input.prompt === "string" && input.prompt.trim()
            ? input.prompt
            : "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
        });
        const stored = await storeImageResultForUser({
          images: result.images || [],
          image_base64: result.images?.[0]?.src?.split(";base64,")[1],
          model: "picwish-advanced-image-expand",
          providerTaskId: result.providerTaskId,
          providerTaskIds: result.providerTaskIds,
        }, user.username);
        return {
          result: stored,
          tracking: {
            capabilityKey: "image_expansion" as const,
            capability: "扩图 / 外延生成",
            provider: "PicWish/佐糖",
            model: getRouteModel(input, "picwish-advanced-image-expand"),
            failureMessage: "Image expansion failed",
          },
        };
      }
      case "text_to_image":
      default: {
        if (operation !== "generate" && capability !== "text_to_image") {
          throw new Error(`Unsupported background image task capability: ${capability}`);
        }
        const result = await orchestrator.run({
          ...input,
          capability: "text_to_image",
          intent: "text_to_image",
          operation: "generate",
        });
        const images = await storeGeneratedImagesForUser(result.images || [], user.username, {
          providerTaskId: result.providerTaskId,
          providerTaskIds: result.providerTaskIds,
        });
        const stored = { ...result, images };
        return {
          result: stored,
          tracking: {
            capabilityKey: capabilityFromOrchestrator(result.capability),
            capability: result.capability,
            provider: result.route,
            model: result.model,
            failureMessage: "Image generation failed",
          },
        };
      }
    }
  }

  app.use((req, res, next) => {
    const allowedOrigin = getAllowedCorsOrigin(req.headers.origin);
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.post("/api/billing/wallyt/callback", express.text({ type: ["text/xml", "application/xml", "*/xml", "*/*"], limit: "1mb" }), async (req, res) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : "";
      const payload = parseWallytXml(rawBody);
      const config = getWallytConfig();
      const orderId = payload.out_trade_no || "";
      const totalFee = Number(payload.total_fee || 0);
      const signatureValid = verifyWallytSignature(payload);

      if (!rawBody || !orderId || !signatureValid || payload.mch_id !== config.mchId || !isWallytPaymentSuccess(payload)) {
        await recordBillingPaymentFailureAndNotify({
          orderId,
          actorName: "wallyt",
          expectedAmountCents: Number.isFinite(totalFee) ? totalFee : undefined,
          providerTransactionId: payload.transaction_id,
          signatureValid,
          eventType: "wallyt_callback_failed",
          message: !rawBody
            ? "威富通回调为空"
            : !orderId
              ? "威富通回调缺少本地订单号"
              : !signatureValid
                ? "威富通回调验签失败"
                : payload.mch_id !== config.mchId
                  ? "威富通回调商户号不匹配"
                  : `威富通回调支付状态非成功：status=${payload.status || "-"} result_code=${payload.result_code || "-"} pay_result=${payload.pay_result || "-"}`,
        });
        res.type("text/plain").status(400).send("fail");
        return;
      }

      const order = await getBillingOrderForPayment(orderId);
      if (!order || order.amountCents !== totalFee) {
        await recordBillingPaymentFailureAndNotify({
          orderId,
          actorName: "wallyt",
          expectedAmountCents: totalFee,
          providerTransactionId: payload.transaction_id,
          signatureValid,
          eventType: "wallyt_callback_amount_mismatch",
          message: !order ? "威富通回调对应本地订单不存在" : "威富通回调金额与本地订单不一致",
        });
        res.type("text/plain").status(409).send("fail");
        return;
      }

      const result = await markBillingOrderPaid({
        orderId,
        actorName: "wallyt",
        expectedAmountCents: totalFee,
        providerTransactionId: payload.transaction_id,
        eventType: "wallyt_callback",
      });

      res.type("text/plain").status(result.status === 200 ? 200 : 409).send(result.status === 200 ? "success" : "fail");
    } catch (error) {
      console.error("[wallyt] callback failed", error instanceof Error ? error.message : error);
      res.type("text/plain").status(500).send("fail");
    }
  });

  app.use(express.json({ limit: "25mb" }));

  app.post("/internal/security-events", (req, res) => {
    const result = validateSecurityEventIngest({
      peerAddress: req.socket.remoteAddress,
      providedSecret: typeof req.headers["x-artx-security-ingest"] === "string"
        ? req.headers["x-artx-security-ingest"]
        : "",
      expectedSecret: process.env.SECURITY_EVENT_INGEST_SECRET,
      payload: req.body,
    });
    if (!result.accepted) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    void securityEventDetector.observe(result.signal);
    res.status(202).json({ accepted: true });
  });

  app.use((req, res, next) => {
    res.once("finish", () => {
      const rule = classifyApplicationSecuritySignal({ path: req.path, status: res.statusCode });
      const source = getSecurityEventSource(req);
      if (!rule || !source) return;
      void securityEventDetector.observe({ rule, source });
    });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/community/wechat-group-qr/image", (_req, res) => {
    const externalUrl = (process.env.WECHAT_GROUP_QR_URL || process.env.COMMUNITY_WECHAT_GROUP_QR_URL || "").trim();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (/^https?:\/\//i.test(externalUrl)) {
      res.redirect(302, externalUrl);
      return;
    }

    const qrPath = getWechatGroupQrPath();
    if (!fs.existsSync(qrPath)) {
      res.status(404).json({ error: "Wechat group QR is not configured" });
      return;
    }
    res.sendFile(qrPath);
  });

  app.get("/api/ai/models", async (_req, res) => {
    try {
      res.json(await listImageModelCatalog());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model catalog failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/images/proxy", async (req, res) => {
    try {
      const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: "Invalid image url" });
        return;
      }

      const resolvedHuabanUrl = await resolveHuabanPinImageUrl(url).catch(() => "");
      const firstUrl = resolvedHuabanUrl || url;
      let response = await fetch(firstUrl, {
        redirect: "follow",
        headers: getImageProxyHeaders(firstUrl, firstUrl === url ? undefined : url),
      });
      if (!response.ok && firstUrl === url) {
        response = await fetch(firstUrl, {
          redirect: "follow",
          headers: getImageProxyDocumentHeaders(firstUrl),
        });
      }
      if (!response.ok) {
        res.status(response.status).json({ error: `Image fetch failed: ${response.status}` });
        return;
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (isImageContentType(contentType)) {
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(Buffer.from(arrayBuffer));
        return;
      }

      if (!contentType.includes("text/html")) {
        res.status(415).json({ error: "URL did not return an image" });
        return;
      }

      const html = await response.text();
      const candidates = extractImageCandidatesFromHtml(html, response.url || url);
      for (const candidate of candidates) {
        try {
          const imageResponse = await fetch(candidate, {
            redirect: "follow",
            headers: getImageProxyHeaders(candidate, url),
          });
          if (!imageResponse.ok) continue;
          const imageContentType = imageResponse.headers.get("content-type") || "application/octet-stream";
          if (!isImageContentType(imageContentType)) continue;
          const arrayBuffer = await imageResponse.arrayBuffer();
          res.setHeader("Content-Type", imageContentType);
          res.setHeader("Cache-Control", "public, max-age=300");
          res.send(Buffer.from(arrayBuffer));
          return;
        } catch {
          // Try the next page image candidate.
        }
      }

      res.status(415).json({ error: "URL did not return an image" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image proxy failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/generate", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "text_to_image",
      capability: "图片生成",
      provider: "AI_IMAGE",
      model: getDefaultRouteImageModel(req.body),
      failureMessage: "Image generation failed",
    }, async (user) => {
      const result = await generateImages(req.body);
      const images = await storeGeneratedImagesForUser(result.images, user.username);
      return { ...result, images };
    });
  });

  app.post("/api/images/tasks", async (req, res) => {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const taskId = typeof req.body?.taskId === "string" && req.body.taskId.trim()
      ? req.body.taskId.trim()
      : `image-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pruneBackgroundImageTasks();
    const existing = backgroundImageTasks.get(taskId);
    if (existing) {
      if (existing.ownerUserId !== user.id) {
        res.status(404).json({ error: "Image task not found", taskId, status: "failed" });
        return;
      }
      res.json(existing);
      return;
    }

    let taskCapability;
    try {
      taskCapability = resolveBackgroundImageTaskCapability(req.body || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed";
      res.status(400).json({ error: message, taskId, status: "failed" });
      return;
    }
    const preflightTracking: AiRouteTracking = {
      capabilityKey: capabilityFromOrchestrator(taskCapability),
      capability: taskCapability,
      provider: "AI_IMAGE",
      model: getDefaultRouteImageModel(req.body),
      failureMessage: "Image generation failed",
    };
    let reservation: AiUsageReservation;
    try {
      assertUserCanUseSelectableModel(user, preflightTracking.model, preflightTracking.capabilityKey);
      reservation = await reserveAiRouteUsage({ user, tracking: preflightTracking, request: req.body, taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed";
      res.status(aiRequestErrorStatus(message)).json({ error: message, taskId, status: "failed" });
      return;
    }

    const task: BackgroundImageTask = {
      taskId,
      status: "pending",
      input: req.body,
      ownerUserId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    backgroundImageTasks.set(taskId, task);
    res.json(task);

    void (async () => {
      try {
        const { result, tracking } = await runBackgroundImageTask(req.body, user);
        await recordAiRouteUsage({
          user,
          tracking,
          startedAt: task.createdAt,
          status: "success",
          result,
        });
        backgroundImageTasks.set(taskId, {
          ...task,
          status: "completed",
          images: result.images || [],
          updatedAt: Date.now(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image generation failed";
        try {
          await recordAiRouteUsage({
          user,
          tracking: preflightTracking,
          startedAt: task.createdAt,
          status: "failed",
          error: message,
          });
        } catch (recordError) {
          console.warn("[ai-usage] failed to record background task", recordError instanceof Error ? recordError.message : "unknown error");
        }
        backgroundImageTasks.set(taskId, {
          ...task,
          status: "failed",
          error: message,
          updatedAt: Date.now(),
        });
      } finally {
        await releaseAiRouteUsage(user, reservation);
      }
    })();
  });

  app.get("/api/images/tasks/:taskId", async (req, res) => {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    pruneBackgroundImageTasks();
    const rawTask = backgroundImageTasks.get(req.params.taskId);
    const task = rawTask ? resolveBackgroundImageTask(rawTask) : undefined;
    if (!task || task.ownerUserId !== user.id) {
      res.status(404).json({ error: "Image task not found", taskId: req.params.taskId, status: "failed" });
      return;
    }
    if (rawTask && task !== rawTask) {
      backgroundImageTasks.set(req.params.taskId, task);
    }
    res.json(task);
  });

  app.post("/api/images/remove-background", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "background_removal",
      capability: "抠图 / 去背景",
      provider: "PicWish/佐糖",
      model: getRouteModel(req.body, "picwish-segmentation"),
      failureMessage: "Background removal failed",
    }, async (user) => {
      const result = await removeImageBackground(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/enhance", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "image_enhance",
      capability: "高清图片生成",
      provider: "PicWish/佐糖",
      model: getRouteModel(req.body, "picwish-scale"),
      failureMessage: "Image enhancement failed",
    }, async (user) => {
      const result = await enhanceImage(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/remove-watermark", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "watermark_removal",
      capability: "去水印",
      provider: "PicWish/佐糖",
      model: getRouteModel(req.body, "picwish-watermark"),
      failureMessage: "Image watermark removal failed",
    }, async (user) => {
      const result = await removeImageWatermark(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/create-background", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "smart_background",
      capability: "智能产品图 / 海报一键生成",
      provider: "PicWish 主体保护 + Image2/Gemini 背景",
      model: getDefaultImageModelPriorityLabel(),
      failureMessage: "Create background failed",
    }, async (user) => {
      const result = await createProductBackground(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/ocr", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "image_ocr",
      capability: "图片 OCR / 文案提取",
      provider: "AI_IMAGE",
      model: getRouteModel(req.body, process.env.AI_IMAGE_MODEL || "vision-chat-ocr"),
      failureMessage: "Image OCR failed",
      outputUnits: () => 1,
    }, async () => {
      const result = await extractImageText(req.body);
      return result;
    });
  });

  app.post("/api/images/edit", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "image_edit",
      capability: "图片编辑",
      provider: "AI_IMAGE",
      model: getDefaultRouteImageModel(req.body),
      failureMessage: "Image edit failed",
    }, async (user) => {
      const result = await editImageWithPrompt(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/erase", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "image_erase",
      capability: "图片擦除",
      provider: "PicWish/佐糖",
      model: getRouteModel(req.body, "picwish-inpaint"),
      failureMessage: "Image erase failed",
    }, async (user) => {
      const result = await eraseImageObjects(req.body);
      return storeImageResultForUser(result, user.username);
    });
  });

  app.post("/api/images/expand", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "image_expansion",
      capability: "扩图 / 外延生成",
      provider: "PicWish/佐糖",
      model: getRouteModel(req.body, "picwish-advanced-image-expand"),
      failureMessage: "Image expansion failed",
    }, async (user) => {
      const imageSrc = req.body?.imageSrc || req.body?.image_url || req.body?.image_base64;
      const maskSrc = req.body?.maskSrc || req.body?.mask_url || req.body?.mask_base64;
      const result = await expandImageWithPicWish({
        ...req.body,
        imageSrc,
        maskSrc,
        prompt: req.body?.prompt || "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
      });
      const stored = await storeImageResultForUser({
        images: result.images || [],
        image_base64: result.images?.[0]?.src?.split(";base64,")[1],
        model: "picwish-advanced-image-expand",
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
      }, user.username);
      return stored;
    });
  });

  app.post("/api/llm", async (req, res) => {
    await handleTrackedAiRequest(req, res, {
      capabilityKey: "text_generation",
      capability: "提示词优化 / 文案生成",
      provider: "AI_TEXT",
      model: getRouteModel(req.body, process.env.AI_TEXT_MODEL || "gpt-5.4-mini"),
      failureMessage: "AI request failed",
      outputUnits: () => 1,
    }, async () => {
      const result = await generateText(req.body);
      return result;
    });
  });

  app.post("/api/references/search", async (req, res) => {
    try {
      const query = typeof req.body?.query === "string" ? req.body.query : "";
      const limit = typeof req.body?.limit === "number" ? req.body.limit : 10;
      const result = await searchReferenceImages(query, limit);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reference search failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/inspiration/references", (req, res) => {
    const group = typeof req.query.group === "string" ? req.query.group : undefined;
    const subcategory = typeof req.query.subcategory === "string" ? req.query.subcategory : undefined;
    const sourceSite = typeof req.query.sourceSite === "string" ? req.query.sourceSite : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;
    const verifiedPromptOnly = req.query.verifiedPromptOnly === "1" || req.query.verifiedPromptOnly === "true";
    res.json(getInspirationReferences({ group, subcategory, sourceSite, limit, offset, verifiedPromptOnly }));
  });

  app.get("/api/cross-border-commerce/markets", (req, res) => {
    const includeReview = req.query.includeReview === "true";
    res.json({
      version: CROSS_BORDER_COMMERCE_VERSION,
      markets: CROSS_BORDER_MARKETS.map(market => ({
        ...market,
        platforms: getAvailableCrossBorderPlatforms(market.id, includeReview),
      })),
      categories: CROSS_BORDER_CATEGORIES,
      templates: CROSS_BORDER_TEMPLATES,
      governance: {
        reviewCadence: "平台规格与政策每月复核；紧急变更立即标记运营复核。",
        disclaimer:
          "ArtX 仅提供创意风险提示，不构成法律、税务、商标或平台审核意见。",
      },
    });
  });

  app.post("/api/cross-border-commerce/risk-check", (req, res) => {
    try {
      res.json(
        evaluateCrossBorderCommerceRisk(req.body as CrossBorderComposeInput)
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "电商创意风险检查失败",
      });
    }
  });

  app.post("/api/cross-border-commerce/compose", async (req, res) => {
    try {
      const request = req.body as CrossBorderComposeInput;
      const context = composeCrossBorderCommerceContext(request);
      const session = await getSessionUserFromAuthorization(
        req.headers.authorization
      );
      const sessionUser =
        session.status === 200 && session.body && "user" in session.body
          ? (session.body.user as { id?: string; username?: string })
          : null;
      const record = await recordCrossBorderCommerceGeneration({
        request,
        context,
        user:
          sessionUser?.id && sessionUser.username
            ? { id: sessionUser.id, username: sessionUser.username }
            : undefined,
      });
      res.json({ context, auditRecordId: record.id });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "电商生成上下文组合失败",
      });
    }
  });

  app.post("/api/ai/orchestrate", async (req, res) => {
    const startedAt = Date.now();
    let user: SessionUser | null = null;
    let reservation: AiUsageReservation | undefined;
    let successRecorded = false;
    try {
      user = await requireSessionUser(req, res);
      if (!user) return;
      const preflightTracking: AiRouteTracking = {
        capabilityKey: requestedOrchestratorCapability(req.body),
        capability: typeof req.body?.capability === "string" ? req.body.capability : "AI 编排",
        provider: "AI",
        model: getRouteModel(req.body, "auto"),
        failureMessage: "AI orchestration failed",
      };
      assertUserCanUseSelectableModel(user, preflightTracking.model, preflightTracking.capabilityKey);
      reservation = await reserveAiRouteUsage({ user, tracking: preflightTracking, request: req.body });
      const result = await orchestrator.run(req.body);
      if (result.images?.length) {
        const images = await storeGeneratedImagesForUser(result.images, user.username, {
          providerTaskId: result.providerTaskId,
          providerTaskIds: result.providerTaskIds,
        });
        const storedResult = { ...result, images };
        await recordAiRouteUsage({
          user,
          tracking: {
            capabilityKey: capabilityFromOrchestrator(result.capability),
            capability: result.capability,
            provider: result.route,
            model: result.model,
            failureMessage: "AI orchestration failed",
          },
          startedAt,
          status: "success",
          result: storedResult,
        });
        successRecorded = true;
        res.json(storedResult);
        return;
      }
      await recordAiRouteUsage({
        user,
        tracking: {
          capabilityKey: capabilityFromOrchestrator(result.capability),
          capability: result.capability,
          provider: result.route,
          model: result.model,
          failureMessage: "AI orchestration failed",
          outputUnits: () => 1,
        },
        startedAt,
        status: "success",
        result,
      });
      successRecorded = true;
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI orchestration failed";
      if (user && !successRecorded) {
        await recordAiRouteUsage({
          user,
          tracking: {
            capabilityKey: "text_generation",
            capability: typeof req.body?.capability === "string" ? req.body.capability : "ai_orchestration",
            provider: "AI",
            model: getRouteModel(req.body, "auto"),
            failureMessage: "AI orchestration failed",
          },
          startedAt,
          status: "failed",
          error: message,
        });
      }
      if (!res.headersSent) res.status(aiRequestErrorStatus(message)).json({ error: message });
    } finally {
      if (user) await releaseAiRouteUsage(user, reservation);
    }
  });

  app.get("/api/brand-kits", async (_req, res) => {
    try {
      const kits = await listBrandKits();
      res.json({ kits });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit list failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/brand-kits", async (req, res) => {
    try {
      const kit = await createBrandKit(req.body);
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit save failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/brand-kits/:id", async (req, res) => {
    try {
      const kit = await getBrandKit(req.params.id);
      if (!kit) {
        res.status(404).json({ error: "Brand kit not found" });
        return;
      }
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit read failed";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/brand-kits/:id", async (req, res) => {
    try {
      const deleted = await deleteBrandKit(req.params.id);
      res.json({ deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit delete failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/brand-kits/parse", async (req, res) => {
    try {
      const imageSrc = req.body?.imageSrc || req.body?.image_url || (
        req.body?.image_base64 ? `data:image/png;base64,${req.body.image_base64}` : ""
      );
      if (!imageSrc) {
        res.status(400).json({ error: "Missing image" });
        return;
      }
      const kit = await parseBrandKitFromImage(imageSrc, generateText);
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit parse failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/auth/:action", async (req, res) => {
    try {
      const action = req.params.action as AuthAction;
      const result = await handleAuthAction(action, req.body);
      await notifyAuthAction(action, req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {}, result);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth request failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/developer/api-keys", async (req, res) => {
    try {
      const result = await listApiKeysForAuthorization(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API key list failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/developer/api-keys", async (req, res) => {
    try {
      const result = await createApiKeyForAuthorization(req.headers.authorization, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API key create failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/v1/models", async (req, res) => {
    const auth = await getApiKeyUserFromAuthorization(req.headers.authorization);
    if (auth.status !== 200 || !("user" in auth.body)) {
      res.status(auth.status).json({ error: { message: "Invalid ArtX API key", type: "authentication_error" } });
      return;
    }
    res.json({ object: "list", data: listSelectableModelIds().map(id => ({ id, object: "model", owned_by: "artx" })) });
  });

  app.post("/v1/chat/completions", async (req, res) => {
    const auth = await getApiKeyUserFromAuthorization(req.headers.authorization);
    if (auth.status !== 200 || !("user" in auth.body)) {
      res.status(auth.status).json({ error: { message: "Invalid ArtX API key", type: "authentication_error" } });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    if (body.stream === true) {
      res.status(400).json({ error: { message: "streaming is not supported", type: "invalid_request_error" } });
      return;
    }
    const model = typeof body.model === "string" ? body.model.trim() : "og-image2-medium";
    if (!listSelectableModelIds().includes(model)) {
      res.status(400).json({ error: { message: "Unsupported ArtX model", type: "invalid_request_error" } });
      return;
    }
    const messages = Array.isArray(body.messages) ? body.messages as Array<{ role?: unknown; content?: unknown }> : [];
    const prompt = messages.map(message => typeof message.content === "string" ? message.content : "").filter(Boolean).join("\n").trim();
    if (!prompt) {
      res.status(400).json({ error: { message: "messages must include text content", type: "invalid_request_error" } });
      return;
    }
    const capabilityKey: AiBillingCapability = model === "gpt-5.4-mini" ? "text_generation" : "text_to_image";
    const user = { id: auth.body.user.id, username: auth.body.user.username, allowedAiModels: auth.body.user.allowedAiModels };
    const startedAt = Date.now();
    let reservation: AiUsageReservation | undefined;
    try {
      assertUserCanUseSelectableModel(user, model, capabilityKey);
      reservation = await reserveAiRouteUsage({ user, tracking: { capabilityKey, capability: "OpenAI 兼容调用", provider: "OPENAI_COMPAT", model, failureMessage: "OpenAI-compatible request failed" }, request: { count: body.n } });
      const result = await orchestrator.run({ capability: capabilityKey === "text_generation" ? "chat" : "text_to_image", prompt, model, count: Number(body.n || 1) });
      const usage = await recordAiRouteUsage({ user, tracking: { capabilityKey, capability: "OpenAI 兼容调用", provider: result.route, model: result.model, failureMessage: "OpenAI-compatible request failed" }, startedAt, status: "success", result });
      await recordExternalAgentUsage({ apiKeyId: auth.body.apiKey.id, apiKeyPrefix: auth.body.apiKey.prefix, agentSource: "OpenAI Compatible", toolName: "chat.completions", capability: usage.capability, model: usage.model, status: "success", latencyMs: usage.latencyMs, outputUnits: usage.outputUnits, inputTokens: usage.usage?.promptTokens, outputTokens: usage.usage?.completionTokens, chargedCredits: usage.chargedCredits, estimatedCostUsd: usage.estimatedCost }).catch(() => undefined);
      const content = result.type === "image" ? (result.images || []).map(image => `![image](${image.src})`).join("\n") : result.text || "";
      res.json({ id: `chatcmpl_${Date.now().toString(36)}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: result.model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI-compatible request failed";
      res.status(aiRequestErrorStatus(message)).json({ error: { message, type: "api_error" } });
    } finally {
      await releaseAiRouteUsage(user, reservation);
    }
  });

  app.post("/api/mcp", async (req, res) => {
    const request = req.body && typeof req.body === "object" ? req.body as McpJsonRpcRequest : {};
    const id = request.id ?? null;
    try {
      const auth = await getApiKeyUserFromAuthorization(req.headers.authorization);
      if (auth.status !== 200 || !("user" in auth.body)) {
        res.status(auth.status).json(mcpError(id, -32001, typeof auth.body.error === "string" ? auth.body.error : "Unauthorized"));
        return;
      }

      if (!request.method) {
        res.status(400).json(mcpError(id, -32600, "Invalid MCP request"));
        return;
      }

      if (request.method === "initialize") {
        res.json(mcpResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "artx-image", version: "1.0.0" },
        }));
        return;
      }

      if (request.method === "notifications/initialized") {
        res.status(202).json({ ok: true });
        return;
      }

      if (request.method === "tools/list") {
        res.json(mcpResult(id, { tools: getMcpTools() }));
        return;
      }

      if (request.method === "tools/call") {
        const params = request.params || {};
        const toolName = typeof params.name === "string" ? params.name : "";
        const agentSource = mcpAgentSource(params);
        const args = params.arguments && typeof params.arguments === "object"
          ? params.arguments as Record<string, unknown>
          : {};
        const user = {
          id: auth.body.user.id,
          username: auth.body.user.username,
          allowedAiModels: auth.body.user.allowedAiModels,
        };

        if (toolName === "artx_health") {
          res.json(mcpResult(id, {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                user: user.username,
                apiKey: auth.body.apiKey,
                tools: getMcpTools().map(tool => tool.name),
              }, null, 2),
            }],
          }));
          return;
        }

        if (toolName === "artx_generate_image") {
          const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
          if (!prompt) {
            res.status(400).json(mcpError(id, -32602, "prompt is required"));
            return;
          }
          const startedAt = Date.now();
          let reservation: AiUsageReservation | undefined;
          let successRecorded = false;
          try {
            const tracking: AiRouteTracking = {
              capabilityKey: "text_to_image",
              capability: "MCP 图片生成",
              provider: "AI_IMAGE",
              model: typeof args.model === "string" ? args.model : "auto",
              failureMessage: "MCP image generation failed",
            };
            assertUserCanUseSelectableModel(user, tracking.model, tracking.capabilityKey);
            reservation = await reserveAiRouteUsage({
              user,
              tracking,
              request: { count: Math.max(1, Math.min(9, Number(args.count || 1))) },
            });
            const result = await orchestrator.run({
              capability: "text_to_image",
              intent: "text_to_image",
              operation: "generate",
              prompt,
              model: typeof args.model === "string" ? args.model : undefined,
              ratio: typeof args.ratio === "string" ? args.ratio : undefined,
              count: Math.max(1, Math.min(9, Number(args.count || 1))),
              skillId: typeof args.skillId === "string" ? args.skillId : undefined,
            });
            const storedResult = await storeImageResultForUser(result, user.username);
            const usageRecord = await recordAiRouteUsage({
              user,
              tracking: {
                capabilityKey: capabilityFromOrchestrator(storedResult.capability),
                capability: storedResult.capability,
                provider: storedResult.route,
                model: storedResult.model,
                failureMessage: "MCP image generation failed",
              },
              startedAt,
              status: "success",
              result: storedResult,
            });
            await recordExternalAgentUsage({
              apiKeyId: auth.body.apiKey.id,
              apiKeyPrefix: auth.body.apiKey.prefix,
              agentSource,
              toolName,
              capability: usageRecord.capability,
              model: usageRecord.model,
              status: "success",
              latencyMs: usageRecord.latencyMs,
              outputUnits: usageRecord.outputUnits,
              inputTokens: usageRecord.usage?.promptTokens,
              outputTokens: usageRecord.usage?.completionTokens,
              chargedCredits: usageRecord.chargedCredits,
              estimatedCostUsd: usageRecord.estimatedCost,
            }).catch(recordError => console.warn("[mcp] failed to record external usage", recordError));
            successRecorded = true;
            res.json(mcpResult(id, {
              content: [{
                type: "text",
                text: JSON.stringify({
                  type: storedResult.type,
                  capability: storedResult.capability,
                  model: storedResult.model,
                  route: storedResult.route,
                  images: storedResult.images || [],
                  providerTaskId: storedResult.providerTaskId,
                  providerTaskIds: storedResult.providerTaskIds,
                }, null, 2),
              }],
            }));
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : "MCP image generation failed";
            if (!successRecorded) {
              const usageRecord = await recordAiRouteUsage({
                user,
                tracking: {
                  capabilityKey: "text_to_image",
                  capability: "MCP 图片生成",
                  provider: "AI_IMAGE",
                  model: typeof args.model === "string" ? args.model : "auto",
                  failureMessage: "MCP image generation failed",
                },
                startedAt,
                status: "failed",
                error: message,
              });
              await recordExternalAgentUsage({
                apiKeyId: auth.body.apiKey.id,
                apiKeyPrefix: auth.body.apiKey.prefix,
                agentSource,
                toolName,
                capability: usageRecord.capability,
                model: usageRecord.model,
                status: "failed",
                latencyMs: usageRecord.latencyMs,
                outputUnits: 0,
                chargedCredits: 0,
                estimatedCostUsd: 0,
                failureCategory: message.slice(0, 120),
              }).catch(recordError => console.warn("[mcp] failed to record external usage", recordError));
            }
            res.status(aiRequestErrorStatus(message)).json(mcpError(id, -32000, message));
            return;
          } finally {
            await releaseAiRouteUsage(user, reservation);
          }
        }

        res.status(404).json(mcpError(id, -32601, `Unknown tool: ${toolName || "unknown"}`));
        return;
      }

      res.status(404).json(mcpError(id, -32601, `Unknown MCP method: ${request.method}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP request failed";
      res.status(500).json(mcpError(id, -32000, message));
    }
  });

  app.post("/api/feedback", async (req, res) => {
    try {
      const session = await getSessionUserFromAuthorization(req.headers.authorization);
      if (session.status !== 200 || !("user" in session.body)) {
        res.status(session.status).json(session.body);
        return;
      }
      const body = req.body as {
        content?: unknown;
        module?: unknown;
        attachments?: Array<{ name?: unknown; src?: unknown }>;
      };
      const attachments = Array.isArray(body.attachments)
        ? body.attachments.map((item) => ({
          name: typeof item.name === "string" ? item.name : "feedback-image.png",
          src: typeof item.src === "string" ? item.src : "",
        }))
        : [];
      const result = await submitUserFeedback({
        user: {
          id: session.body.user.id,
          username: session.body.user.username,
        },
        content: typeof body.content === "string" ? body.content : "",
        module: typeof body.module === "string" ? body.module : "帮助与反馈",
        attachments,
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Feedback submit failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/billing/config", (_req, res) => {
    res.json(getWallytConfigStatus());
  });

  app.get("/api/billing/summary", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const snapshot = await getBillingSnapshotForUser(user.id);
      res.json(snapshot || { balance: 0, frozenCredits: 0, expiredCredits: 0, orders: [], ledger: [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing summary failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/billing/credit-notifications", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      res.json(await getCreditGiftNotificationsForUser(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Credit notifications failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/credit-notifications/:notificationId/ack", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const result = await acknowledgeCreditGiftNotification(user.id, req.params.notificationId);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Credit notification acknowledge failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const paymentMethod = req.body?.paymentMethod === "alipay" ? "alipay" : "wechat";
      const result = req.body?.type === "recharge"
        ? await createCreditRechargeOrder({
          userId: user.id,
          username: user.username,
          amount: Number(req.body?.amount || 0),
          paymentMethod,
        })
        : await createBillingOrder({
          userId: user.id,
          username: user.username,
          planId: typeof req.body?.planId === "string" ? req.body.planId : "",
          cycleId: typeof req.body?.cycleId === "string" ? req.body.cycleId : "",
          paymentMethod,
        });
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing order create failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders/:orderId/pay", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const order = await getBillingOrderForPayment(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: "订单不存在" });
        return;
      }
      if (order.userId !== user.id) {
        res.status(403).json({ error: "不能支付其他用户的订单" });
        return;
      }
      if (order.status === "paid") {
        res.json({ order, paid: true });
        return;
      }

      const paymentMethod = req.body?.paymentMethod === "alipay" || order.channel === "支付宝" ? "alipay" : "wechat";
      const mode = req.body?.mode === "wap" ? "wap" : "native";
      const payment = await createWallytPayment({
        orderId: order.id,
        body: order.paymentDisplayName || (order.packageName === "积分充值" ? "ArtX 积分充值" : `ArtX ${order.packageName} 会员服务`),
        amount: order.amount,
        paymentMethod,
        mode,
        callbackUrl: typeof req.body?.callbackUrl === "string" ? req.body.callbackUrl : undefined,
        clientIp: getClientIp(req.headers, req.socket.remoteAddress),
      });

      await recordBillingPaymentCreated({
        orderId: order.id,
        actorName: "wallyt",
        providerTransactionId: payment.transactionId,
        paymentMethod,
        payUrlType: payment.payUrlType,
        service: payment.service,
        paymentDisplayName: order.paymentDisplayName || `${order.packageName} · ${order.userAccount || order.user}`,
      });
      scheduleWallytPaymentConfirmation(order.id);

      res.json({ order, payment });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing payment failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/billing/orders/:orderId/status", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const order = await getBillingOrderForPayment(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: "订单不存在" });
        return;
      }
      if (order.userId !== user.id) {
        res.status(403).json({ error: "不能查询其他用户的订单" });
        return;
      }

      if (order.status !== "paid") {
        await confirmWallytOrderPayment(order.id, "wallyt-query").catch((error) => {
          console.warn("[wallyt] order status query failed", order.id, error instanceof Error ? error.message : error);
          return null;
        });
      }

      const latest = await getBillingOrderForPayment(order.id);
      res.json({ order: latest || order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing status failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/admin/session", async (req, res) => {
    try {
      const result = await getAdminSessionFromAuthorization(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin session check failed";
      res.status(500).json({ error: message });
    }
  });

  app.all("/api/admin/*", async (req, res) => {
    try {
      const result = await handleAdminApiRequest(req.method, req.originalUrl.replace(/^\/api\/admin\/?/, ""), req.headers.authorization, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin API request failed";
      res.status(500).json({ error: message });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use("/uploads", express.static(getUploadsRoot(), {
    etag: true,
    fallthrough: false,
    immutable: true,
    maxAge: "30d",
  }));

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
    scheduleUploadCleanup();
  });
}

startServer().catch(console.error);
