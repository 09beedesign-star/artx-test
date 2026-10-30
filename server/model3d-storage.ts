/**
 * 3D 画布模型文件存储。
 *
 * 产品约束（见 shared/model3d.ts，唯一事实源）：
 *   1. 单文件 ≤ 60MB（MODEL3D_MAX_BYTES）；
 *   2. 只在服务器保存 48 小时，到期自动彻底删除；
 *   3. 为保证信息安全「不留底」——
 *        · 存放在独立目录 uploads/models3d/，不走 /uploads 静态托管（那边是 30 天 immutable 缓存）；
 *        · 只允许上传者本人读取，响应头 no-store，CDN / 浏览器都不缓存；
 *        · 生产备份脚本（artx-backup）只打包 /var/lib/artx 与配置，不包含 uploads 根目录，
 *          所以模型文件不会进入备份 tar，也不会被 COS 同步带走。
 *
 * 「48 小时」靠三道闸保证，任何一道失效都不会让过期文件被读到：
 *   A. 读取时校验：mtime 超过 48h → 立即删除并返回 404（访问层的硬保证）；
 *   B. 每次上传顺手清扫整个 models3d 目录（有人用就有人扫）；
 *   C. 进程启动清理 + systemd timer（cleanup-uploads-cli --models3d，每小时）做物理回收。
 * 📌 时间源只认 mtime，与图片保留期口径一致；写入后不再改动文件，mtime 即上传时刻。
 */

import { createWriteStream, promises as fs } from "fs";
import { randomBytes } from "crypto";
import path from "path";
import type { Readable } from "stream";
import {
  getModel3DExtension,
  MODEL3D_FORMAT_NOTICE_ZH,
  MODEL3D_ID_PATTERN,
  MODEL3D_MAX_BYTES,
  MODEL3D_RETENTION_MS,
  MODEL3D_SIZE_LIMIT_NOTICE_ZH,
} from "../shared/model3d";
import { getUploadsRoot } from "./local-image-storage";

const MODEL3D_OVERSIZE_NOTICE_ZH = MODEL3D_SIZE_LIMIT_NOTICE_ZH;

export class Model3DUploadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getModel3DRoot() {
  return path.join(getUploadsRoot(), "models3d");
}

function sanitizeUserSegment(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+$/, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "user";
}

function getUserModelDirectory(username: string) {
  return path.join(getModel3DRoot(), sanitizeUserSegment(username));
}

export type StoredModel3D = {
  modelId: string;
  name: string;
  size: number;
  uploadedAt: string;
  expiresAt: string;
};

/**
 * 以流的方式落盘，边写边计数：超过上限立刻中断并删除半截文件，
 * 不把整个文件读进内存（并发几个上传就能把进程内存打爆）。
 */
export async function storeModel3DFromStream(options: {
  username: string;
  originalName: string;
  stream: Readable;
  declaredLength?: number;
  now?: Date;
}): Promise<StoredModel3D> {
  const extension = getModel3DExtension(options.originalName);
  if (!extension) {
    throw new Model3DUploadError(415, MODEL3D_FORMAT_NOTICE_ZH);
  }
  if (options.declaredLength !== undefined && options.declaredLength > MODEL3D_MAX_BYTES) {
    throw new Model3DUploadError(413, MODEL3D_OVERSIZE_NOTICE_ZH);
  }

  // 顺手清扫：有人上传就把所有人过期的模型物理删除（B 闸）。失败不影响本次上传。
  void cleanupExpiredModels3D({ now: options.now }).catch(() => undefined);

  const directory = getUserModelDirectory(options.username);
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const modelId = `${randomBytes(16).toString("hex")}.${extension}`;
  const filePath = path.join(directory, modelId);

  let received = 0;
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(filePath, { flags: "wx", mode: 0o640 });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      options.stream.unpipe(output);
      output.destroy();
      options.stream.resume();
      fs.unlink(filePath).catch(() => undefined).finally(() => reject(error));
    };
    options.stream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MODEL3D_MAX_BYTES) {
        fail(new Model3DUploadError(413, MODEL3D_OVERSIZE_NOTICE_ZH));
      }
    });
    options.stream.on("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
    options.stream.on("aborted", () => fail(new Model3DUploadError(400, "上传被中断，请重试")));
    output.on("error", (error) => fail(error));
    output.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    options.stream.pipe(output);
  });

  if (received === 0) {
    await fs.unlink(filePath).catch(() => undefined);
    throw new Model3DUploadError(400, "模型文件为空");
  }

  const stat = await fs.stat(filePath);
  const uploadedAtMs = stat.mtime.getTime();
  return {
    modelId,
    name: options.originalName.slice(0, 200),
    size: received,
    uploadedAt: new Date(uploadedAtMs).toISOString(),
    expiresAt: new Date(uploadedAtMs + MODEL3D_RETENTION_MS).toISOString(),
  };
}

export type ResolvedModel3D = {
  filePath: string;
  size: number;
  expiresAt: string;
};

/**
 * 解析并校验一个模型文件（A 闸）。
 * - modelId 只接受服务端生成的形态，杜绝路径穿越；
 * - 目录取自会话用户名，别人的模型 ID 即使被猜到也读不到；
 * - 已过期 → 当场删除并返回 null（调用方回 404）。
 */
export async function resolveModel3DForUser(
  username: string,
  modelId: string,
  options: { now?: Date } = {},
): Promise<ResolvedModel3D | null> {
  if (!MODEL3D_ID_PATTERN.test(modelId)) return null;
  const filePath = path.join(getUserModelDirectory(username), modelId);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const expiresAtMs = stat.mtime.getTime() + MODEL3D_RETENTION_MS;
  const nowMs = (options.now || new Date()).getTime();
  if (nowMs >= expiresAtMs) {
    await fs.unlink(filePath).catch(() => undefined);
    return null;
  }
  return { filePath, size: stat.size, expiresAt: new Date(expiresAtMs).toISOString() };
}

/** 用户主动删除画布里的 3D 画布时调用：立刻物理删除，不等 48 小时。 */
export async function deleteModel3DForUser(username: string, modelId: string) {
  if (!MODEL3D_ID_PATTERN.test(modelId)) return false;
  const filePath = path.join(getUserModelDirectory(username), modelId);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 物理删除所有超过 48 小时的模型文件（B/C 闸共用）。 */
export async function cleanupExpiredModels3D(options: { now?: Date } = {}) {
  const root = getModel3DRoot();
  const cutoffMs = (options.now || new Date()).getTime() - MODEL3D_RETENTION_MS;
  let scannedFiles = 0;
  let deletedFiles = 0;
  let removedDirectories = 0;

  let userDirs;
  try {
    userDirs = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return { root, scannedFiles, deletedFiles, removedDirectories };
  }

  for (const userDir of userDirs) {
    const userPath = path.join(root, userDir.name);
    if (!userDir.isDirectory()) {
      // 根目录下不应出现散落文件；有就按同样口径判过期。
      scannedFiles += 1;
      try {
        const stat = await fs.stat(userPath);
        if (stat.mtime.getTime() < cutoffMs) {
          await fs.unlink(userPath);
          deletedFiles += 1;
        }
      } catch {
        // ignore
      }
      continue;
    }
    let files;
    try {
      files = await fs.readdir(userPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.isFile()) continue;
      scannedFiles += 1;
      const filePath = path.join(userPath, file.name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtime.getTime() < cutoffMs) {
          await fs.unlink(filePath);
          deletedFiles += 1;
        }
      } catch {
        // 文件可能被并发删除，忽略。
      }
    }
    try {
      if ((await fs.readdir(userPath)).length === 0) {
        await fs.rmdir(userPath);
        removedDirectories += 1;
      }
    } catch {
      // ignore
    }
  }

  return { root, scannedFiles, deletedFiles, removedDirectories };
}

export const MODEL3D_CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  fbx: "application/octet-stream",
  obj: "model/obj",
};
