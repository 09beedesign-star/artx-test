import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(resolve(currentDir, "index.ts"), "utf8");

describe("community QR route", () => {
  it("serves a stable no-cache QR endpoint that can use a file or live URL", () => {
    expect(serverSource).toContain("/api/community/wechat-group-qr/image");
    expect(serverSource).toContain("WECHAT_GROUP_QR_URL");
    expect(serverSource).toContain("COMMUNITY_WECHAT_GROUP_QR_URL");
    expect(serverSource).toContain("WECHAT_GROUP_QR_PATH");
    expect(serverSource).toContain("Cache-Control");
    expect(serverSource).toContain("no-store");
    expect(serverSource).toContain("community\", \"wechat-group-qr.jpg");
  });
});
