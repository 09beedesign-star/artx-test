import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupExpiredUploads, getFeedbackRetentionDays, getUploadRetentionDays, storeGeneratedImagesForUser } from "./local-image-storage";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let uploadsDir = "";

afterEach(async () => {
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
    uploadsDir = "";
  }
  delete process.env.ARTX_UPLOADS_DIR;
  delete process.env.ARTX_UPLOAD_RETENTION_DAYS;
  delete process.env.ARTX_FEEDBACK_RETENTION_DAYS;
  delete process.env.ARTX_LOCAL_IMAGE_MAX_BYTES;
});

const TWENTY_MB = 20 * 1024 * 1024;

// 造一张「原图必然超过 20MB、但画质底线内可压进 20MB」的测试图。
// 用随机噪点保证 png 无损编码压不动（真实高分辨率出图就是这个特性），
// 避免造出一张纯色图——纯色图 png 本身才几 KB，根本触发不到压缩分支。
async function createOversizedPngBuffer() {
  const sharp = (await import("sharp")).default;
  const width = 4000;
  const height = 4000;
  const channels = 3 as const;
  const raw = Buffer.allocUnsafe(width * height * channels);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = Math.floor(Math.random() * 256);
  }
  return sharp(raw, { raw: { width, height, channels } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

describe("storeGeneratedImagesForUser", () => {
  it("stores provider images returned as bare base64 instead of treating them as remote URLs", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-test-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;

    const [stored] = await storeGeneratedImagesForUser([{
      src: ONE_PIXEL_PNG_BASE64,
      width: 1,
      height: 1,
    }], "test@example.com", { providerTaskId: "provider-image" });

    expect(stored.src).toMatch(/^\/uploads\/images\/test%40example\.com\/provider-image-1\.png$/);
    const localPath = path.join(uploadsDir, decodeURIComponent(stored.src.replace("/uploads/", "")));
    const buffer = await readFile(localPath);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  // 核心回归：超过 20MB 的图不再直接报错丢弃，而是压缩后落盘，
  // 且落盘文件必须实测 ≤ 20MB（「压缩之后体积也要监测」）。
  it("压缩超过 20MB 的生成图并保证落盘体积不超过上限", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-oversize-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;

    const oversized = await createOversizedPngBuffer();
    expect(oversized.byteLength).toBeGreaterThan(TWENTY_MB);

    const [stored] = await storeGeneratedImagesForUser([{
      src: `data:image/png;base64,${oversized.toString("base64")}`,
      width: 4000,
      height: 4000,
    }], "test@example.com", { providerTaskId: "oversize" });

    const localPath = path.join(uploadsDir, decodeURIComponent(stored.src.replace("/uploads/", "")));
    const written = await stat(localPath);
    expect(written.size).toBeLessThanOrEqual(TWENTY_MB);
    // 重编码为 webp 后，扩展名必须跟着变，不能留下 .png 壳子装 webp 内容。
    expect(stored.src.endsWith(".webp")).toBe(true);
  }, 120_000);

  // 画质底线：压缩不能无限降档，最终产物仍要保有足够分辨率，不能压成糊图。
  it("压缩后仍保留可接受的画面尺寸，不会压成糊图", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-quality-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;

    const oversized = await createOversizedPngBuffer();
    const [stored] = await storeGeneratedImagesForUser([{
      src: `data:image/png;base64,${oversized.toString("base64")}`,
      width: 4000,
      height: 4000,
    }], "test@example.com", { providerTaskId: "quality" });

    // 缩边下限是原图的 60%，低于这个值说明降档逻辑失控。
    expect(stored.width).toBeGreaterThanOrEqual(Math.floor(4000 * 0.6));
    expect(stored.height).toBeGreaterThanOrEqual(Math.floor(4000 * 0.6));
  }, 120_000);

  // 复检有效性：把上限调到 400KB，逼压缩链走完整个降档阶梯。
  // 这个用例专门守护「每压一级都要实测字节数」——如果实现改成
  // 「压一次就当作成功返回」，首档 q=92 的产物远大于 400KB，落盘必然超限而失败。
  it("逐级降档时每一级都复检体积，不会压一次就当作成功", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-recheck-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const tightLimit = 400 * 1024;
    process.env.ARTX_LOCAL_IMAGE_MAX_BYTES = String(tightLimit);

    const oversized = await createOversizedPngBuffer();

    // 噪点图在画质底线内未必能压到 400KB，两种结局都算实现正确：
    // 要么落盘且实测 ≤ 400KB，要么如实抛出中文超限文案。绝不允许「超限还落盘」。
    try {
      const [stored] = await storeGeneratedImagesForUser([{
        src: `data:image/png;base64,${oversized.toString("base64")}`,
        width: 4000,
        height: 4000,
      }], "test@example.com", { providerTaskId: "recheck" });

      const localPath = path.join(uploadsDir, decodeURIComponent(stored.src.replace("/uploads/", "")));
      const written = await stat(localPath);
      expect(written.size).toBeLessThanOrEqual(tightLimit);
    } catch (error) {
      expect((error as Error).message).toContain("建议调小输出分辨率后重新生成");
    }
  }, 180_000);

  // 文案：超限时必须给中文提示并明确引导用户调小分辨率，不能再抛裸英文串。
  it("彻底压不进上限时抛出中文文案并建议调小分辨率", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-message-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    // 1KB 上限，任何真实图片都不可能压进去，必定走到最终抛错分支。
    process.env.ARTX_LOCAL_IMAGE_MAX_BYTES = "1024";

    const oversized = await createOversizedPngBuffer();

    await expect(storeGeneratedImagesForUser([{
      src: `data:image/png;base64,${oversized.toString("base64")}`,
      width: 4000,
      height: 4000,
    }], "test@example.com", { providerTaskId: "message" })).rejects.toThrow(/建议调小输出分辨率后重新生成/);
  }, 180_000);

  // 上限夹取：环境变量只能调小，配大必须被夹回 20MB，否则这条底线形同虚设。
  it("ARTX_LOCAL_IMAGE_MAX_BYTES 配置超过 20MB 时会被夹回硬上限", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-cap-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    process.env.ARTX_LOCAL_IMAGE_MAX_BYTES = String(500 * 1024 * 1024);

    const oversized = await createOversizedPngBuffer();
    const [stored] = await storeGeneratedImagesForUser([{
      src: `data:image/png;base64,${oversized.toString("base64")}`,
      width: 4000,
      height: 4000,
    }], "test@example.com", { providerTaskId: "capped" });

    const localPath = path.join(uploadsDir, decodeURIComponent(stored.src.replace("/uploads/", "")));
    const written = await stat(localPath);
    // 若夹取失效，500MB 上限会让这张图原样落盘，体积必然 > 20MB。
    expect(written.size).toBeLessThanOrEqual(TWENTY_MB);
  }, 120_000);
});

describe("cleanupExpiredUploads", () => {
  it("deletes expired generated images and expired feedback attachments", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-cleanup-test-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;

    const oldGenerated = path.join(uploadsDir, "images", "old-user", "old.png");
    const freshGenerated = path.join(uploadsDir, "images", "fresh-user", "fresh.png");
    const oldFeedback = path.join(uploadsDir, "feedback", "old-user", "fb_old", "old-feedback.png");
    const freshFeedback = path.join(uploadsDir, "feedback", "fresh-user", "fb_fresh", "fresh-feedback.png");
    await mkdir(path.dirname(oldGenerated), { recursive: true });
    await mkdir(path.dirname(freshGenerated), { recursive: true });
    await mkdir(path.dirname(oldFeedback), { recursive: true });
    await mkdir(path.dirname(freshFeedback), { recursive: true });
    await writeFile(oldGenerated, "old");
    await writeFile(freshGenerated, "fresh");
    await writeFile(oldFeedback, "old-feedback");
    await writeFile(freshFeedback, "fresh-feedback");

    // ⚠️ 夹具的天数必须跟着保留期一起改（2026-09-24：10 天 → 15 天）。
    //    只改断言里的 retentionDays 而不动 utimes，会让「过期文件」变成
    //    11 天前——在 15 天窗口内根本不该被删，测试会红在 deletedFiles 上，
    //    很容易被误当成清理逻辑回归。
    const now = new Date("2026-07-09T00:00:00.000Z");
    const beyondRetention = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000);
    const withinRetention = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    await utimes(oldGenerated, beyondRetention, beyondRetention);
    await utimes(oldFeedback, beyondRetention, beyondRetention);
    await utimes(freshGenerated, withinRetention, withinRetention);
    await utimes(freshFeedback, withinRetention, withinRetention);

    const result = await cleanupExpiredUploads({ now });

    expect(result.retentionDays).toBe(15);
    expect(result.feedbackRetentionDays).toBe(15);
    // 反馈附件此前不参与清理，会无限增长；现已与生成图一同受保留期约束。
    expect(result.deletedFiles).toBe(2);
    await expect(stat(oldGenerated)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(oldFeedback)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(freshGenerated)).resolves.toMatchObject({ size: 5 });
    await expect(stat(freshFeedback)).resolves.toMatchObject({ size: 14 });
  });

  it("keeps feedback attachments when their retention window is configured longer", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-upload-feedback-retention-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    process.env.ARTX_FEEDBACK_RETENTION_DAYS = "30";

    const generated = path.join(uploadsDir, "images", "user", "old.png");
    const feedback = path.join(uploadsDir, "feedback", "user", "fb_1", "old-feedback.png");
    await mkdir(path.dirname(generated), { recursive: true });
    await mkdir(path.dirname(feedback), { recursive: true });
    await writeFile(generated, "old");
    await writeFile(feedback, "old-feedback");

    const now = new Date("2026-07-09T00:00:00.000Z");
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    await utimes(generated, twentyDaysAgo, twentyDaysAgo);
    await utimes(feedback, twentyDaysAgo, twentyDaysAgo);

    const result = await cleanupExpiredUploads({ now });

    expect(result.feedbackRetentionDays).toBe(30);
    expect(result.deletedFiles).toBe(1);
    await expect(stat(generated)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(feedback)).resolves.toMatchObject({ size: 12 });
  });

  it("allows the retention window to be configured by environment", () => {
    process.env.ARTX_UPLOAD_RETENTION_DAYS = "3";
    expect(getUploadRetentionDays()).toBe(3);
    process.env.ARTX_FEEDBACK_RETENTION_DAYS = "7";
    expect(getFeedbackRetentionDays()).toBe(7);
  });
});
