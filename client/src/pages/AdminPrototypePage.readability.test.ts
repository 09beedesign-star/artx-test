import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage readability", () => {
  it("uses the admin-only high contrast helper text treatment", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf-8");

    expect(page).toContain("admin-readable-copy");
    expect(css).toContain(".admin-readable-copy .text-slate-400");
    expect(css).toContain("font-weight: 600");
  });
});
