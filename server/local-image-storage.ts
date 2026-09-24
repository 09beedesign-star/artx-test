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

// 落盘体积硬上限 20MB。这是产品级约束，不是可以随便抬高的调优项：
// 单张超过 20MB 的图在前端画布加载、CDN 回源、保留期内的磁盘占用上都会出问题。
// 因此 ARTX_LOCAL_IMAGE_MAX_BYTES 只允许「调小」，配大了会被夹回 20MB——
// 否则运维一行环境变量就能把这条底线绕过去，等于没设。
const MAX_IMAGE_BYTES_HARD_CAP = 20 * 1024 * 1024;

function resolveMaxImageBytes() {
  const configured = Number(process.env.ARTX_LOCAL_IMAGE_MAX_BYTES || 0);
  if (!Number.isFinite(configured) || configured <= 0) return MAX_IMAGE_BYTES_HARD_CAP;
  return Math.min(Math.floor(configured), MAX_IMAGE_BYTES_HARD_CAP);
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// 统一的超限文案。用户看到的是这串原文（前端直接把 message 塞进 toast 的
// description），所以必须是中文、说清上限、并给出可执行的下一步动作。
function buildTooLargeMessage(actualBytes: number, limitBytes: number) {
  return `生成的图片体积为 ${formatMegabytes(actualBytes)}，超过 ${formatMegabytes(limitBytes)} 的保存上限，已尝试压缩但仍然过大。建议调小输出分辨率后重新生成。`;
}

const PUBLIC_IMAGE_BASE_PATH = "/uploads/images";
const PUBLIC_FEEDBACK_BASE_PATH = "/uploads/feedback";
const DEFAULT_UPLOAD_RETENTION_DAYS = 15;
const DEFAULT_FEEDBACK_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// 提醒窗口：图片进入「最后 N 天」时前端开始显示倒计时。
// ⚠️ 这里是保留期与提醒期的唯一事实源，前端通过 /api/uploads/expiry 读取，
// 不允许在前端再写一份 15 / 5 的字面量——两处各写一份，改了一处就会出现
// 「后端 15 天删、前端按 10 天倒计时」这种零报错的错位。
const DEFAULT_EXPIRY_WARNING_DAYS = 5;

export function getUploadsRoot() {
  return process.env.ARTX_UPLOADS_DIR || path.join(process.env.ARTX_DATA_DIR || "/var/lib/artx", "uploads");
}

function resolveRetentionDays(rawValue: string | undefined, fallbackDays: number) {
  const value = Number(rawValue || fallbackDays);
  if (!Number.isFinite(value) || value <= 0) return fallbackDays;
  return Math.max(1, Math.floor(value));
}

export function getUploadRetentionDays() {
  return resolveRetentionDays(process.env.ARTX_UPLOAD_RETENTION_DAYS, DEFAULT_UPLOAD_RETENTION_DAYS);
}

// 反馈附件是用户提交的问题证据，运营排查窗口可能需要比生成图更长，
// 因此给它独立的保留期开关；不配置时与生成图一致，同为 15 天。
export function getFeedbackRetentionDays() {
  return resolveRetentionDays(process.env.ARTX_FEEDBACK_RETENTION_DAYS, DEFAULT_FEEDBACK_RETENTION_DAYS);
}

export function getExpiryWarningDays() {
  const retentionDays = getUploadRetentionDays();
  const configured = resolveRetentionDays(
    process.env.ARTX_UPLOAD_WARNING_DAYS,
    DEFAULT_EXPIRY_WARNING_DAYS,
  );
  // 提醒窗口不能大于保留期本身，否则图一落盘就进入倒计时，提醒失去意义。
  return Math.min(configured, retentionDays);
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
  const feedbackRetentionDays = getFeedbackRetentionDays();
  const now = options.now || new Date();
  const cutoffMs = now.getTime() - retentionDays * DAY_MS;
  const uploadsRoot = getUploadsRoot();
  // 生成图与反馈附件各自独立计算 cutoff，便于两者配置不同的保留期。
  const cleanupTargets = [
    { directory: path.join(uploadsRoot, "images"), cutoffMs },
    { directory: path.join(uploadsRoot, "feedback"), cutoffMs: now.getTime() - feedbackRetentionDays * DAY_MS },
  ];
  let scannedFiles = 0;
  let deletedFiles = 0;
  let removedDirectories = 0;

  for (const target of cleanupTargets) {
    const result = await cleanupExpiredFilesInDirectory(target.directory, target.cutoffMs, target.directory);
    scannedFiles += result.scannedFiles;
    deletedFiles += result.deletedFiles;
    removedDirectories += result.removedDirectories;
  }

  return {
    uploadsRoot,
    retentionDays,
    feedbackRetentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    scannedFiles,
    deletedFiles,
    removedDirectories,
  };
}

export type UploadExpiryEntry = {
  src: string;
  daysLeft: number;
  expiresAt: string;
  isWarning: boolean;
};

/**
 * 列出某个用户已进入「即将过期」窗口的图片。
 *
 * 设计要点：
 * 1. **时间源必须与清理逻辑完全一致**——清理用的是 mtime（见
 *    cleanupExpiredFilesInDirectory），这里也必须用 mtime。若这里改用 birthtime，
 *    就会出现「提示还剩 3 天但今晚就被删了」的错位，且两边都不报错。
 * 2. **只返回进入提醒窗口的图**。全量返回在用户图多时是无谓的载荷，
 *    而前端唯一要做的判断就是「要不要提醒」。
 * 3. 用户目录名走与写入侧相同的 sanitizePathSegment，否则含特殊字符的用户名
 *    会查到空目录，表现为「有图但从不提醒」——静默失效。
 */
export async function listExpiringUploadsForUser(
  username: string,
  options: { now?: Date } = {},
): Promise<{
  retentionDays: number;
  warningDays: number;
  entries: UploadExpiryEntry[];
}> {
  const retentionDays = getUploadRetentionDays();
  const warningDays = getExpiryWarningDays();
  const now = options.now || new Date();
  const userDirectoryName = sanitizePathSegment(username, "user");
  const imageDirectory = path.join(getUploadsRoot(), "images", userDirectoryName);

  const entries: UploadExpiryEntry[] = [];
  if (!(await pathExists(imageDirectory))) {
    return { retentionDays, warningDays, entries };
  }

  let dirEntries;
  try {
    dirEntries = await fs.readdir(imageDirectory, { withFileTypes: true });
  } catch {
    // 读不到目录时返回空列表而不是抛错：提醒功能失效应当是「不提醒」，
    // 绝不能让它把整个画布接口拖垮。
    return { retentionDays, warningDays, entries };
  }

  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(imageDirectory, entry.name);
    try {
      const fileStat = await fs.stat(filePath);
      const expiresAtMs = fileStat.mtime.getTime() + retentionDays * DAY_MS;
      const msLeft = expiresAtMs - now.getTime();
      // 向上取整：还剩 0.3 天要显示「1 天」而不是「0 天」，
      // 因为这张图此刻确实还能下载，说 0 会让用户误以为已经没了。
      const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
      if (daysLeft > warningDays) continue;
      entries.push({
        src: `${PUBLIC_IMAGE_BASE_PATH}/${encodeURIComponent(userDirectoryName)}/${encodeURIComponent(entry.name)}`,
        daysLeft,
        expiresAt: new Date(expiresAtMs).toISOString(),
        isWarning: true,
      });
    } catch {
      // 单个文件读不到就跳过，不影响其余图片的提醒。
    }
  }

  // 最紧急的排前面，前端直接取 entries[0] 就是最该提醒的那张。
  entries.sort((a, b) => a.daysLeft - b.daysLeft);
  return { retentionDays, warningDays, entries };
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

// ── 超限图片的压缩降级链 ──────────────────────────────────────────────
// 设计前提：图已经生成成功（算力和积分都花掉了），此时因为体积超限直接丢弃
// 是最亏的做法。所以先尽力压到 20MB 以内，压不动才报错。
//
// 画质保护是硬约束，不能为了压进 20MB 把图压糊：
//   · webp 质量不低于 QUALITY_FLOOR(72)，低于这个值肉眼可见涂抹感；
//   · 缩边不低于原图最短边的 MIN_SCALE(60%)，再小构图细节就没了。
// 两条底线都触到仍然超限 → 判定「该分辨率本身就不适合本地保存」，
// 抛中文错误并建议用户调小分辨率重新生成。
const COMPRESSION_QUALITY_FLOOR = 72;
const COMPRESSION_MIN_SCALE = 0.6;

// 远程图允许下载的体积天花板 = 上限 × 8（即 160MB）。
// 超过这个量级的图即使压到质量/尺寸底线也基本进不了 20MB，
// 与其把带宽和内存耗在下载上，不如在响应头阶段就拒掉。
const COMPRESSIBLE_DOWNLOAD_MULTIPLIER = 8;

// 质量阶梯从高到低，先只降质量不动尺寸（保构图），不够再按 scale 缩边。
const COMPRESSION_QUALITY_STEPS = [92, 86, 80, COMPRESSION_QUALITY_FLOOR];
const COMPRESSION_SCALE_STEPS = [1, 0.85, 0.72, COMPRESSION_MIN_SCALE];

type CompressionOutcome = {
  buffer: Buffer;
  mimeType: string;
  compressed: boolean;
};

// 动图和矢量图不能走 sharp 的有损重编码：
// gif 会被压成单帧（动画丢失），svg 本身是文本矢量、重编码等于栅格化。
function isNonRecompressibleMimeType(mimeType: string) {
  return /gif|svg/i.test(mimeType);
}

/**
 * 把超过上限的图片压缩到上限以内。
 *
 * 关键点：每压一级都要**重新测量实际字节数**再判断，而不是假设「压了就一定够小」。
 * sharp 的输出体积和质量参数并非线性关系，高噪点图在 q=80 时甚至可能比 q=86 更大，
 * 所以必须实测复检——这正是用户要求的「压缩之后体积也要监测」。
 */
async function compressImageToLimit(
  buffer: Buffer,
  mimeType: string,
  limitBytes: number,
): Promise<CompressionOutcome> {
  if (buffer.byteLength <= limitBytes) {
    return { buffer, mimeType, compressed: false };
  }

  if (isNonRecompressibleMimeType(mimeType)) {
    throw new Error(buildTooLargeMessage(buffer.byteLength, limitBytes));
  }

  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    // sharp 不可用时没有任何压缩手段，只能如实报超限。
    throw new Error(buildTooLargeMessage(buffer.byteLength, limitBytes));
  }

  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // 记录压得最小的一版：即便全部档位都没压进上限，
  // 报错时也能用真实的「最小可达体积」告诉用户差多少。
  let smallest: { buffer: Buffer; mimeType: string } | null = null;

  for (const scale of COMPRESSION_SCALE_STEPS) {
    for (const quality of COMPRESSION_QUALITY_STEPS) {
      let pipeline = sharp(buffer, { limitInputPixels: false }).rotate();

      if (scale < 1 && originalWidth > 0 && originalHeight > 0) {
        pipeline = pipeline.resize({
          width: Math.max(1, Math.round(originalWidth * scale)),
          height: Math.max(1, Math.round(originalHeight * scale)),
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      // 统一转 webp：同画质下比 png/jpeg 小得多，且支持透明通道，
      // 不会像转 jpeg 那样把抠图类结果的透明背景压成黑底。
      let candidate: Buffer;
      try {
        candidate = await pipeline.webp({ quality, effort: 4 }).toBuffer();
      } catch {
        continue;
      }

      if (!smallest || candidate.byteLength < smallest.buffer.byteLength) {
        smallest = { buffer: candidate, mimeType: "image/webp" };
      }

      // 复检：实测通过才算数。
      if (candidate.byteLength <= limitBytes) {
        return { buffer: candidate, mimeType: "image/webp", compressed: true };
      }
    }
  }

  // 画质底线之内压不进上限，如实告知并引导调小分辨率。
  const bestBytes = smallest ? smallest.buffer.byteLength : buffer.byteLength;
  throw new Error(buildTooLargeMessage(bestBytes, limitBytes));
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

async function imageSrcToBuffer(src: string): Promise<CompressionOutcome> {
  const limitBytes = resolveMaxImageBytes();

  if (isLikelyBase64ImagePayload(src)) {
    const buffer = Buffer.from(src.trim().replace(/\s+/g, ""), "base64");
    return compressImageToLimit(buffer, "image/png", limitBytes);
  }

  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid generated image data URL");
    const mimeType = (match[1] || "image/png").split(";")[0];
    const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    return compressImageToLimit(buffer, mimeType, limitBytes);
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

  // Content-Length 预检只用来挡「离谱到压缩也救不回来」的情况，避免白下几百 MB。
  // 注意不能再按 limitBytes 直接拒绝：超过 20MB 的图现在是可以靠压缩救回来的，
  // 沿用旧阈值会把本来能压进来的图误杀在下载前。
  const contentLength = Number(response.headers.get("content-length") || 0);
  const downloadCeiling = limitBytes * COMPRESSIBLE_DOWNLOAD_MULTIPLIER;
  if (contentLength > downloadCeiling) {
    throw new Error(buildTooLargeMessage(contentLength, limitBytes));
  }

  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/") && mimeType !== "application/octet-stream") {
    throw new Error("Generated image URL did not return an image");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const normalizedMimeType = mimeType === "application/octet-stream" ? "image/png" : mimeType;
  return compressImageToLimit(buffer, normalizedMimeType, limitBytes);
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
    const { buffer, mimeType, compressed } = await imageSrcToBuffer(image.src);
    // 压缩后必须用压缩产物的真实尺寸回填：降档时可能缩过边，
    // 继续沿用 provider 报的原始宽高会让前端画布按错误比例渲染。
    const dimensions = await getImageBufferDimensions(buffer, {
      width: image.width,
      height: image.height,
    });
    const extension = extensionForMimeType(mimeType);
    const fallbackFilename = `${taskId}-${index + 1}${extension}`;
    const providerFilename = filenameFromImageSrc(image.src, fallbackFilename);
    const safeFilename = sanitizePathSegment(providerFilename, fallbackFilename);
    // 走过压缩的图已经重编码为 webp，此时若沿用上游 URL 带来的 .png/.jpg 后缀，
    // 会写出「扩展名与实际编码不符」的文件，静态服务按后缀猜 Content-Type 就会发错，
    // 部分浏览器会直接拒绝渲染。因此压缩过的一律以真实 mime 的后缀为准。
    const baseFilename = compressed
      ? `${safeFilename.replace(/\.[^.]+$/, "")}${extension}`
      : safeFilename;
    const filename = path.extname(baseFilename)
      ? baseFilename
      : `${baseFilename}${extension}`;
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
    const { buffer, mimeType, compressed } = await imageSrcToBuffer(image.src);
    if (!mimeType.startsWith("image/")) throw new Error("反馈附件必须是图片");
    const dimensions = await getImageBufferDimensions(buffer, { width: 0, height: 0 });
    const extension = extensionForMimeType(mimeType);
    const fallbackFilename = `feedback-${index + 1}${extension}`;
    const safeName = sanitizePathSegment(image.name || fallbackFilename, fallbackFilename);
    // 同 storeGeneratedImagesForUser：压缩重编码过就必须换成真实后缀，
    // 否则用户上传的 big.png 会以 png 后缀存下 webp 内容。
    const baseName = compressed ? `${safeName.replace(/\.[^.]+$/, "")}${extension}` : safeName;
    const filename = path.extname(baseName) ? baseName : `${baseName}${extension}`;
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
