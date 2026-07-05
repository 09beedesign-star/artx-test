import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { storeGeneratedImagesForUser } from "./local-image-storage";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let uploadsDir = "";

afterEach(async () => {
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
    uploadsDir = "";
  }
  delete process.env.ARTX_UPLOADS_DIR;
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
