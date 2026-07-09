import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupExpiredUploads, getUploadRetentionDays, storeGeneratedImagesForUser } from "./local-image-storage";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let uploadsDir = "";

afterEach(async () => {
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
    uploadsDir = "";
  }
  delete process.env.ARTX_UPLOADS_DIR;
  delete process.env.ARTX_UPLOAD_RETENTION_DAYS;
});

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
});

describe("cleanupExpiredUploads", () => {
  it("deletes generated and feedback images older than the 10 day retention window", async () => {
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

    const now = new Date("2026-07-09T00:00:00.000Z");
    const olderThanTenDays = new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000);
    const withinTenDays = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);
    await utimes(oldGenerated, olderThanTenDays, olderThanTenDays);
    await utimes(oldFeedback, olderThanTenDays, olderThanTenDays);
    await utimes(freshGenerated, withinTenDays, withinTenDays);
    await utimes(freshFeedback, withinTenDays, withinTenDays);

    const result = await cleanupExpiredUploads({ now });

    expect(result.retentionDays).toBe(10);
    expect(result.deletedFiles).toBe(2);
    await expect(stat(oldGenerated)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(oldFeedback)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(freshGenerated)).resolves.toMatchObject({ size: 5 });
    await expect(stat(freshFeedback)).resolves.toMatchObject({ size: 14 });
  });

  it("allows the retention window to be configured by environment", () => {
    process.env.ARTX_UPLOAD_RETENTION_DAYS = "3";
    expect(getUploadRetentionDays()).toBe(3);
  });
});
