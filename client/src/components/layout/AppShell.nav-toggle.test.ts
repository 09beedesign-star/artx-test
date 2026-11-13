/**
 * 侧栏收起/展开按钮位置（2026-11-13）
 *
 * 需求：按钮放在侧栏面板右上角、「开始创作」上方。
 * ⚠️ 面板收起后宽度为 0，面板里的按钮看不见 → 收起态必须在 icon 栏（Logo 下）再给一个展开入口，
 *    否则收起后再也打不开。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AppShell.tsx"), "utf8");

describe("侧栏收起/展开按钮", () => {
  it("展开态：在面板右上角、位于「开始创作」按钮之前", () => {
    const toggle = source.indexOf('{!navCollapsed && renderNavToggle("panel")}');
    const create = source.indexOf("onClick={startCreating}");
    expect(toggle).toBeGreaterThan(-1);
    expect(toggle).toBeLessThan(create);
    expect(source.slice(toggle - 120, toggle)).toContain("justify-end");
  });

  it("收起态：icon 栏 Logo 下方有展开入口", () => {
    const logo = source.indexOf(">返回首页</TooltipContent>");
    const rail = source.indexOf('{navCollapsed && renderNavToggle("rail")}');
    expect(rail).toBeGreaterThan(logo);
    expect(rail - logo).toBeLessThan(300);
  });

  it("只有这两处入口，icon 栏底部不再有旧按钮", () => {
    expect(source.match(/renderNavToggle\("/g)?.length).toBe(2);
    expect(source.match(/onClick=\{\(\) => setNavCollapsed\(v => !v\)\}/g)?.length).toBe(1);
    expect(source).not.toContain("{/* Panel toggle */}");
  });
});
