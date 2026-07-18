import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tencent Cloud release packaging", () => {
  it("keeps the gray public host as the website and only uses an explicitly configured admin host", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/package-tencent-cloud-release.sh"), "utf-8");

    expect(script).toContain('GRAY_ADMIN_HOST="${VITE_ADMIN_HOST:-}"');
    expect(script).not.toContain('GRAY_ADMIN_HOST="${VITE_ADMIN_HOST:-${GRAY_PUBLIC_URL#*://}}"');
    expect(script).toContain('VITE_ADMIN_HOST="${GRAY_ADMIN_HOST}"');
  });
});
