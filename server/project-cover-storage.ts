import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getUploadsRoot } from "./local-image-storage";

/**
 * 工作台项目封面的云端存储（让同一账号在任何设备上都能看到封面）。
 *
 * 📌 为什么单独放在 <uploadsRoot>/covers/ 下：
 *    cleanupExpiredUploads 只清理 images/ 与 feedback/（15 天），
 *    封面属于项目元数据，必须跟项目同寿命，不能 15 天后变成破图。
 *
 * ⚠️ 每个项目只保留最新一张：写入新封面后删掉同项目的旧文件，
 *    避免用户反复「设为封面」把磁盘堆满。
 */

export const PUBLIC_COVER_BASE_PATH = "/uploads/covers";
/** 客户端缩略图最长边 520、JPEG 0.72，正常 < 100KB；给 1MB 余量足够。 */
export const MAX_COVER_BYTES = 1024 * 1024;

const DATA_URL_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

function sanitizeSegment(value: string, maxLength = 80) {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, maxLength);
  return cleaned || "_";
}

export class ProjectCoverError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function decodeCoverDataUrl(dataUrl: unknown) {
  if (typeof dataUrl !== "string") throw new ProjectCoverError("封面数据缺失");
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new ProjectCoverError("封面必须是 JPEG / PNG / WebP 图片");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new ProjectCoverError("封面数据为空");
  if (buffer.length > MAX_COVER_BYTES) throw new ProjectCoverError("封面图片过大", 413);
  const ext = match[1] === "png" ? "png" : match[1] === "webp" ? "webp" : "jpg";
  return { buffer, ext };
}

export async function storeProjectCover(input: {
  userId: string | number;
  projectId: unknown;
  dataUrl: unknown;
  uploadsRoot?: string;
}) {
  if (typeof input.projectId !== "string" || !input.projectId.trim()) {
    throw new ProjectCoverError("缺少项目 ID");
  }
  const { buffer, ext } = decodeCoverDataUrl(input.dataUrl);
  const userSegment = sanitizeSegment(String(input.userId));
  const projectSegment = sanitizeSegment(input.projectId.trim());
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const fileName = `${hash}.${ext}`;
  // 每个项目一个子目录：按目录清旧文件，不会误删 id 前缀相同的其它项目。
  const directory = path.join(input.uploadsRoot || getUploadsRoot(), "covers", userSegment, projectSegment);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  try {
    await fs.access(filePath);
  } catch {
    // 同内容同名：已存在就不重复写（内容寻址，天然幂等）。
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, filePath);
  }

  // 清掉同项目的旧封面文件。
  try {
    const entries = await fs.readdir(directory);
    await Promise.all(
      entries
        .filter(name => name !== fileName && !name.endsWith(".tmp"))
        .map(name => fs.unlink(path.join(directory, name)).catch(() => undefined))
    );
  } catch {
    /* 清理失败不影响本次上传 */
  }

  return { url: `${PUBLIC_COVER_BASE_PATH}/${userSegment}/${projectSegment}/${fileName}` };
}
