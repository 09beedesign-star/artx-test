import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 电商画布：生成状态与结果按模式隔离（2026-10-18）。
 * 事故：带货图文生成中切到产品图，产品图也显示「正在生成」——因为页面级共用一个 generating/results。
 * 判据：生成结束时必须写回「发起生成的那个模式」（startedMode），而不是「当前所在模式」（mode）。
 */
const source = readFileSync(resolve(__dirname, "EcommerceCanvasPage.tsx"), "utf8");
const handleGenerate = source.slice(source.indexOf("const handleGenerate"), source.indexOf("const goWorkspaceWithTemplate"));

describe("电商画布生成状态按模式隔离", () => {
  it("generating / results 按模式各存一份，不再是页面级单值", () => {
    expect(source).toMatch(/useState<Record<EcommerceMode, boolean>>/);
    expect(source).toMatch(/useState<Record<EcommerceMode, string\[\]>>/);
    expect(source).toMatch(/const generating = generatingByMode\[mode\]/);
    expect(source).toMatch(/const results = resultsByMode\[mode\]/);
    expect(source).not.toMatch(/\bsetGenerating\(/);
    expect(source).not.toMatch(/\bsetResults\(/);
  });

  it("开始、出结果、结束三处都写回 startedMode，而不是当前 mode", () => {
    expect(handleGenerate).toMatch(/setModeGenerating\(startedMode, true\)/);
    expect(handleGenerate).toMatch(/setModeResults\(startedMode, urls\)/);
    expect(handleGenerate).toMatch(/setModeGenerating\(startedMode, false\)/);
    // 生成跑完时用户可能已切走，写回当前 mode 会把结果串到另一个模式
    expect(handleGenerate).not.toMatch(/setMode(Generating|Results)\(mode,/);
  });

  it("从生成记录打开时，结果写回该记录自己的模式", () => {
    expect(source).toMatch(/setModeResults\(entry\.mode, entry\.images\)/);
  });
});
