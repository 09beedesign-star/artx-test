import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppShell sidebar navigation", () => {
  it("does not expose the cross-border ecommerce entry in the left sidebar", () => {
    const source = readFileSync(resolve(__dirname, "AppShell.tsx"), "utf-8");

    const topNavBlock = source.match(/\{\/\* Top nav \*\/\}[\s\S]*?\{\/\* ── Bottom: Help/)?.[0];
    expect(topNavBlock).toBeTruthy();
    expect(topNavBlock).not.toContain("跨境电商");
    expect(topNavBlock).not.toContain("/cross-border-commerce");
    expect(topNavBlock).not.toContain("Globe2");
  });
});
