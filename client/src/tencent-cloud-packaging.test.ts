import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tencent Cloud release packaging", () => {
  it("derives the admin host from the gray public URL before building the frontend", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/package-tencent-cloud-release.sh"), "utf-8");

    expect(script).toContain('GRAY_ADMIN_HOST="${VITE_ADMIN_HOST:-${GRAY_PUBLIC_URL#*://}}"');
    expect(script).toContain('VITE_ADMIN_HOST="${GRAY_ADMIN_HOST}"');
  });
});
