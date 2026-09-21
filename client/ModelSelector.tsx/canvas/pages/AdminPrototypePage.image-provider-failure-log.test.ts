import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage image provider failure log download", () => {
  const source = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf8");

  it("downloads the protected image provider failure log with the current admin token", () => {
    expect(source).toContain('fetch("/api/admin/image-provider-failures/download"');
    expect(source).toContain("Authorization: `Bearer ${token}`");
    expect(source).toContain("response.blob()");
    expect(source).toContain("artx-image-provider-failures-");
    expect(source).toContain("下载失败日志");
  });
});
