import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppShell sidebar navigation", () => {
  it("does not expose the cross-border ecommerce entry in the left sidebar", () => {
    const source = readFileSync(resolve(__dirname, "AppShell.tsx"), "utf-8");

    // 三段式布局后导航分散在 icon 栏与中间面板两处，
    // 只截某一段会漏掉另一段 —— 直接断言整个 AppShell 不出现该入口。
    expect(source).not.toContain("跨境电商");
    expect(source).not.toContain("/cross-border-commerce");
    expect(source).not.toContain("Globe2");
  });
});
