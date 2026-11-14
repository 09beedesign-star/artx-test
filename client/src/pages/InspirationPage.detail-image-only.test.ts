import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔒 2026-11-14 用户要求：灵感模板提示词全站屏蔽后，详情里右侧的「提示词描述」容器整块删除，
 * 详情只留「图片 + 右上角点赞/收藏 + 一键同款」。
 */
const page = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf8");
const home = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf8");
const dialog = readFileSync(
  resolve(__dirname, "../components/inspiration/InspirationPromptDialog.tsx"),
  "utf8"
);

describe("灵感详情只留图片", () => {
  it("专题页详情：无右侧提示词栏、无两栏布局", () => {
    expect(page).toContain("data-inspiration-detail-image-only");
    expect(page).not.toContain("selectedItem.description");
    expect(page).not.toContain("promptScrollRef");
    expect(page).not.toContain("minmax(320px,0.95fr)");
  });

  it("专题页详情：点赞、收藏、一键同款、关闭仍在", () => {
    expect(page).toContain('kind="like"');
    expect(page).toContain('kind="favorite"');
    expect(page).toContain("data-inspiration-detail-same-style");
    expect(page).toContain('aria-label="关闭弹层"');
  });

  it("首页第二屏详情：与专题页统一为只显示图片（2026-11-14）", () => {
    expect(home).toContain("data-home-inspiration-detail-image-only");
    expect(home).not.toContain("selectedHomeInspiration.description");
    expect(home).not.toContain("homeInspirationPromptRef");
    expect(home).not.toContain("scrollHomeInspirationPrompt");
    expect(home).not.toContain("minmax(320px,0.95fr)");
    expect(home).toContain("data-home-inspiration-detail-same-style");
  });

  it("画布灵感弹窗详情：不再渲染描述行", () => {
    expect(dialog).not.toContain("selectedItem.description");
  });
});
