/**
 * 3D 画布模型文件的 HTTP 处理器。
 *
 * 只依赖 Node 原生 IncomingMessage / ServerResponse，生产 express（server/index.ts）
 * 与本地 dev（vite.config.ts 中间件）共用同一份实现，避免两边口径漂移。
 * 用户身份由调用方从会话中解析后传入 —— 绝不接受请求里自带的用户名。
 *
 * 路由约定：
 *   POST   /api/models3d             body=模型二进制，header X-Model-Filename=encodeURIComponent(原文件名)
 *   GET    /api/models3d/:modelId    仅上传者本人可读，Cache-Control: no-store
 *   DELETE /api/models3d/:modelId    立即物理删除
 */

import { createReadStream } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import { MODEL3D_MAX_BYTES, MODEL3D_RETENTION_HOURS } from "../shared/model3d";
import {
  deleteModel3DForUser,
  Model3DUploadError,
  MODEL3D_CONTENT_TYPES,
  resolveModel3DForUser,
  storeModel3DFromStream,
} from "./model3d-storage";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readHeader(req: IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export async function handleModel3DUpload(req: IncomingMessage, res: ServerResponse, username: string) {
  let originalName = "model.glb";
  try {
    originalName = decodeURIComponent(readHeader(req, "x-model-filename")) || originalName;
  } catch {
    sendJson(res, 400, { error: "文件名编码无效" });
    return;
  }
  const declaredLength = Number(readHeader(req, "content-length") || NaN);
  try {
    const stored = await storeModel3DFromStream({
      username,
      originalName,
      stream: req,
      declaredLength: Number.isFinite(declaredLength) ? declaredLength : undefined,
    });
    sendJson(res, 200, {
      ...stored,
      retentionHours: MODEL3D_RETENTION_HOURS,
      maxBytes: MODEL3D_MAX_BYTES,
    });
  } catch (error) {
    if (error instanceof Model3DUploadError) {
      // 413 时请求体可能还没读完，主动关闭连接，避免继续接收超限数据。
      if (error.status === 413) res.setHeader("Connection", "close");
      sendJson(res, error.status, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: error instanceof Error ? error.message : "模型上传失败" });
  }
}

export async function handleModel3DGet(req: IncomingMessage, res: ServerResponse, username: string, modelId: string) {
  const resolved = await resolveModel3DForUser(username, modelId);
  if (!resolved) {
    sendJson(res, 404, { error: `模型文件不存在或已超过 ${MODEL3D_RETENTION_HOURS} 小时被自动清除`, expired: true });
    return;
  }
  const extension = modelId.split(".").pop() || "";
  res.writeHead(200, {
    "Content-Type": MODEL3D_CONTENT_TYPES[extension] || "application/octet-stream",
    "Content-Length": String(resolved.size),
    // 不留底：浏览器、代理、CDN 一律不缓存。
    "Cache-Control": "no-store, private",
    "X-Model-Expires-At": resolved.expiresAt,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(resolved.filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

export async function handleModel3DDelete(_req: IncomingMessage, res: ServerResponse, username: string, modelId: string) {
  const deleted = await deleteModel3DForUser(username, modelId);
  sendJson(res, 200, { deleted });
}
