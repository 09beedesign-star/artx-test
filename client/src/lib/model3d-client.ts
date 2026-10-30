/**
 * 3D 画布：前端上传客户端。
 *
 * 约定见 server/model3d-routes.ts：
 *   POST /api/models3d
 *   body   = 模型文件原始二进制（application/octet-stream）
 *   header = X-Model-Filename: encodeURIComponent(原文件名)
 *            Authorization: Bearer <token>
 *
 * ⚠️ 体积 / 格式校验在前端先做一遍，只是为了「秒级失败 + 中文提示」，
 *    真正的闸门在服务端（storeModel3DFromStream 边写边计数）。两边读的是
 *    同一份 shared/model3d.ts 常量，不允许在这里再写 100 / 24 的字面量。
 */

import {
  MODEL3D_FORMAT_NOTICE_ZH,
  MODEL3D_RETENTION_MS,
  MODEL3D_SIZE_LIMIT_NOTICE_ZH,
  isModel3DFilename,
  isModel3DOversized,
} from "@shared/model3d";

export type Model3DUploadResult = {
  modelId: string;
  name: string;
  size: number;
  /** 毫秒时间戳 */
  uploadedAt: number;
  /** 毫秒时间戳 */
  expiresAt: number;
};

export class Model3DClientError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "Model3DClientError";
    this.status = status;
  }
}

export function readModel3DAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

/** 拖入 / 选择文件时的同步预检；返回中文错误原因，通过返回 null。 */
export function validateModel3DFile(file: File): string | null {
  if (!isModel3DFilename(file.name)) {
    return MODEL3D_FORMAT_NOTICE_ZH;
  }
  if (file.size <= 0) return "模型文件为空";
  if (isModel3DOversized(file.size)) return MODEL3D_SIZE_LIMIT_NOTICE_ZH;
  return null;
}

function toMs(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function uploadModel3DFile(
  file: File,
  options: { apiBaseUrl: string; fetchImpl?: typeof fetch; signal?: AbortSignal }
): Promise<Model3DUploadResult> {
  const invalid = validateModel3DFile(file);
  if (invalid) throw new Model3DClientError(invalid, 400);

  const token = readModel3DAuthToken();
  if (!token) throw new Model3DClientError("请先登录后再上传 3D 模型", 401);

  const fetchImpl = options.fetchImpl || fetch;
  const base = options.apiBaseUrl.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetchImpl(`${base}/api/models3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-Model-Filename": encodeURIComponent(file.name),
      },
      body: file,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new Model3DClientError("网络异常，模型上传失败", 0);
  }

  // 📌 先判 status 再解析 body：nginx 413 / 502 返回的是 HTML，直接 .json() 会
  //    抛出与真实原因无关的解析错误。
  const text = await response.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const serverMessage = typeof body.error === "string" ? body.error : "";
    if (response.status === 413) {
      throw new Model3DClientError(serverMessage || MODEL3D_SIZE_LIMIT_NOTICE_ZH, 413);
    }
    if (response.status === 401) {
      throw new Model3DClientError(serverMessage || "登录已失效，请重新登录", 401);
    }
    throw new Model3DClientError(
      serverMessage || `模型上传失败（HTTP ${response.status}）`,
      response.status
    );
  }

  const modelId = typeof body.modelId === "string" ? body.modelId : "";
  if (!modelId) throw new Model3DClientError("服务端未返回模型 ID", response.status);
  const now = Date.now();
  const uploadedAt = toMs(body.uploadedAt, now);
  return {
    modelId,
    name: typeof body.name === "string" && body.name ? body.name : file.name,
    size: typeof body.size === "number" ? body.size : file.size,
    uploadedAt,
    expiresAt: toMs(body.expiresAt, uploadedAt + MODEL3D_RETENTION_MS),
  };
}
