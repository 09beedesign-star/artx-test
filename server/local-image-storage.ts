import { promises as fs } from "fs";
import path from "path";

export type StoredImage = {
  src: string;
  width: number;
  height: number;
};

export type FeedbackImageInput = {
  name: string;
  src: string;
};

export type StoredFeedbackImage = {
  name: string;
  src: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
};

type StoreImagesOptions = {
  providerTaskId?: string;
  providerTaskIds?: string[];
};

const MAX_IMAGE_BYTES = Number(process.env.ARTX_LOCAL_IMAGE_MAX_BYTES || 50 * 1024 * 1024);
const PUBLIC_IMAGE_BASE_PATH = "/uploads/images";
const PUBLIC_FEEDBACK_BASE_PATH = "/uploads/feedback";
const DEFAULT_UPLOAD_RETENTION_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getUploadsRoot() {
  return process.env.ARTX_UPLOADS_DIR || path.join(process.env.ARTX_DATA_DIR || "/var/lib/artx", "uploads");
}

export function getUploadRetentionDays() {
  const value = Number(process.env.ARTX_UPLOAD_RETENTION_DAYS || DEFAULT_UPLOAD_RETENTION_DAYS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_UPLOAD_RETENTION_DAYS;
  return Math.max(1, Math.floor(value));
}

async function pathExists(directory: string) {
  try {
    await fs.access(directory);
    return true;
  } catch {
    return false;
  }
}

async function cleanupEmptyDirectories(directory: string, stopAt: string) {
  if (directory === stopAt || !directory.startsWith(stopAt)) return 0;
  let removedDirectories = 0;
  try {
    const entries = await fs.readdir(directory);
    if (entries.length === 0) {
      await fs.rmdir(directory);
      removedDirectories += 1;
      removedDirectories += await cleanupEmptyDirectories(path.dirname(directory), stopAt);
    }
  } catch {
    // Cleanup should never block the app from serving requests.
  }
  return removedDirectories;
}

async function cleanupExpiredFilesInDirectory(directory: string, cutoffMs: number, stopAt: string) {
  let scannedFiles = 0;
  let deletedFiles = 0;
  let removedDirectories = 0;
  if (!(await pathExists(directory))) {
    return { scannedFiles, deletedFiles, removedDirectories };
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const result = await cleanupExpiredFilesInDirectory(entryPath, cutoffMs, stopAt);
      scannedFiles += result.scannedFiles;
      deletedFiles += result.deletedFiles;
      removedDirectories += result.removedDirectories;
      removedDirectories += await cleanupEmptyDirectories(entryPath, stopAt);
      continue;
    }
    if (!entry.isFile()) continue;

    scannedFiles += 1;
    try {
      const fileStat = await fs.stat(entryPath);
      if (fileStat.mtime.getTime() < cutoffMs) {
        await fs.unlink(entryPath);
        deletedFiles += 1;
      }
    } catch {
      // Ignore files that disappear or become unreadable during cleanup.
    }
  }

  return { scannedFiles, deletedFiles, removedDirectories };
}

export async function cleanupExpiredUploads(options: { now?: Date } = {}) {
  const retentionDays = getUploadRetentionDays();
  const now = options.now || new Date();
  const cutoffMs = now.getTime() - retentionDays * DAY_MS;
  const uploadsRoot = getUploadsRoot();
  const cleanupRoots = [path.join(uploadsRoot, "images")];
  let scannedFiles = 0;
  let deletedFiles = 0;
  let removedDirectories = 0;

  for (const cleanupRoot of cleanupRoots) {
    const result = await cleanupExpiredFilesInDirectory(cleanupRoot, cutoffMs, cleanupRoot);
    scannedFiles += result.scannedFiles;
    deletedFiles += result.deletedFiles;
    removedDirectories += result.removedDirectories;
  }

  return {
    uploadsRoot,
    retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    scannedFiles,
    deletedFiles,
    removedDirectories,
  };
}

function sanitizePathSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+$/, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

function extensionForMimeType(mimeType: string) {
  if (/svg/i.test(mimeType)) return ".svg";
  if (/jpe?g/i.test(mimeType)) return ".jpg";
  if (/webp/i.test(mimeType)) return ".webp";
  if (/gif/i.test(mimeType)) return ".gif";
  return ".png";
}

function isLikelyBase64ImagePayload(value: string) {
  const compact = value.trim().replace(/\s+/g, "");
  return compact.length >= 80 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function filenameFromImageSrc(src: string, fallbackName: string) {
  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      const basename = path.posix.basename(url.pathname);
      if (basename && basename !== "/" && basename !== ".") return decodeURIComponent(basename);
    } catch {
      return fallbackName;
    }
  }
  return fallbackName;
}

async function imageSrcToBuffer(src: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (isLikelyBase64ImagePayload(src)) {
    const buffer = Buffer.from(src.trim().replace(/\s+/g, ""), "base64");
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Generated image is too large to store locally");
    return { buffer, mimeType: "image/png" };
  }

  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid generated image data URL");
    const mimeType = (match[1] || "image/png").split(";")[0];
    const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Generated image is too large to store locally");
    return { buffer, mimeType };
  }

  if (!/^https?:\/\//i.test(src)) {
    throw new Error("Generated image src is not downloadable");
  }

  const response = await fetch(src, {
    redirect: "follow",
    headers: {
      "User-Agent": "ArtX/1.0 local-image-storage",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error("Generated image is too large to store locally");

  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/") && mimeType !== "application/octet-stream") {
    throw new Error("Generated image URL did not return an image");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Generated image is too large to store locally");
  return { buffer, mimeType: mimeType === "application/octet-stream" ? "image/png" : mimeType };
}

async function getImageBufferDimensions(buffer: Buffer, fallback: { width: number; height: number }) {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
    return {
      width: metadata.width || fallback.width,
      height: metadata.height || fallback.height,
    };
  } catch {
    return fallback;
  }
}

async function writeUniqueFile(directory: string, requestedFilename: string, buffer: Buffer) {
  const extension = path.extname(requestedFilename);
  const basename = extension ? requestedFilename.slice(0, -extension.length) : requestedFilename;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const filename = attempt === 0 ? requestedFilename : `${basename}-${attempt + 1}${extension}`;
    const filePath = path.join(directory, filename);
    try {
      await fs.writeFile(filePath, buffer, { flag: "wx", mode: 0o640 });
      return filename;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  throw new Error("Failed to find an available local image filename");
}

export async function storeGeneratedImagesForUser(
  images: StoredImage[],
  username: string,
  options: StoreImagesOptions = {},
): Promise<StoredImage[]> {
  const userDirectoryName = sanitizePathSegment(username, "user");
  const imageDirectory = path.join(getUploadsRoot(), "images", userDirectoryName);
  await fs.mkdir(imageDirectory, { recursive: true, mode: 0o750 });

  const taskId = options.providerTaskId || options.providerTaskIds?.[0] || `generated-${Date.now()}`;

  return Promise.all(images.map(async (image, index) => {
    const { buffer, mimeType } = await imageSrcToBuffer(image.src);
    const dimensions = await getImageBufferDimensions(buffer, {
      width: image.width,
      height: image.height,
    });
    const fallbackFilename = `${taskId}-${index + 1}${extensionForMimeType(mimeType)}`;
    const providerFilename = filenameFromImageSrc(image.src, fallbackFilename);
    const safeFilename = sanitizePathSegment(providerFilename, fallbackFilename);
    const filename = path.extname(safeFilename)
      ? safeFilename
      : `${safeFilename}${extensionForMimeType(mimeType)}`;
    const storedFilename = await writeUniqueFile(imageDirectory, filename, buffer);

    return {
      ...image,
      width: dimensions.width,
      height: dimensions.height,
      src: `${PUBLIC_IMAGE_BASE_PATH}/${encodeURIComponent(userDirectoryName)}/${encodeURIComponent(storedFilename)}`,
    };
  }));
}

export async function storeFeedbackImagesForUser(
  images: FeedbackImageInput[],
  username: string,
  feedbackId: string,
): Promise<StoredFeedbackImage[]> {
  const userDirectoryName = sanitizePathSegment(username, "user");
  const feedbackDirectoryName = sanitizePathSegment(feedbackId, `feedback-${Date.now()}`);
  const imageDirectory = path.join(getUploadsRoot(), "feedback", userDirectoryName, feedbackDirectoryName);
  await fs.mkdir(imageDirectory, { recursive: true, mode: 0o750 });

  return Promise.all(images.map(async (image, index) => {
    const { buffer, mimeType } = await imageSrcToBuffer(image.src);
    if (!mimeType.startsWith("image/")) throw new Error("反馈附件必须是图片");
    const dimensions = await getImageBufferDimensions(buffer, { width: 0, height: 0 });
    const fallbackFilename = `feedback-${index + 1}${extensionForMimeType(mimeType)}`;
    const safeName = sanitizePathSegment(image.name || fallbackFilename, fallbackFilename);
    const filename = path.extname(safeName) ? safeName : `${safeName}${extensionForMimeType(mimeType)}`;
    const storedFilename = await writeUniqueFile(imageDirectory, filename, buffer);

    return {
      name: image.name || storedFilename,
      src: `${PUBLIC_FEEDBACK_BASE_PATH}/${encodeURIComponent(userDirectoryName)}/${encodeURIComponent(feedbackDirectoryName)}/${encodeURIComponent(storedFilename)}`,
      width: dimensions.width,
      height: dimensions.height,
      mimeType,
      size: buffer.byteLength,
    };
  }));
}
