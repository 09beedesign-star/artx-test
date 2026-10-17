/**
 * 首页顶部导航 · 电商画布入口（源码断言）
 *
 * 位置约定（ericbi 2026-10-17）：「电商画布」必须紧跟在「工作台」右侧，
 * 跳 /ecommerce-canvas（与侧栏入口同一路由），且不需要登录。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "HomePage.tsx"), "utf8");

describe("首页顶部导航：电商画布入口", () => {
  it("紧跟在工作台右侧", () => {
    const labels = [...source.matchAll(/\{ key: "(\w+)" as const, label: "([^"]+)"/g)].map(m => m[2]);
    const workspace = labels.indexOf("工作台");
    expect(workspace).toBeGreaterThanOrEqual(0);
    expect(labels[workspace + 1]).toBe("电商画布");
  });

  it("点击跳到 /ecommerce-canvas，不走登录拦截", () => {
    const handler = source.match(/onEcommerce=\{\(\) => \{([\s\S]*?)\}\}/);
    expect(handler?.[1]).toContain('navigate("/ecommerce-canvas")');
    expect(handler?.[1]).not.toContain("showLoginRequiredBubble");
  });
});
