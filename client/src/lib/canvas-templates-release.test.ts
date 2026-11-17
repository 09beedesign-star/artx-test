import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANVAS_TEMPLATES_COMING_SOON_TITLE,
  CANVAS_TEMPLATES_PUBLIC,
  canOpenTemplatePanel,
} from "./canvas-templates-release";

const panel = readFileSync(
  resolve(__dirname, "../components/canvas/CanvasTemplatePanel.tsx"),
  "utf8"
);

describe("版式工作台：线上屏蔽，提示即将上线（2026-11-17）", () => {
  it("正式发布前线上不可打开，本地开发可打开", () => {
    expect(CANVAS_TEMPLATES_PUBLIC).toBe(false);
    expect(canOpenTemplatePanel(false)).toBe(false);
    expect(canOpenTemplatePanel(true)).toBe(true);
  });

  it("文案固定", () => {
    expect(CANVAS_TEMPLATES_COMING_SOON_TITLE).toBe("更多排版模板即将上线，敬请期待");
  });

  it("面板唯一打开口子先过闸门，未开放时弹提示而不是 setOpen", () => {
    const toggle = panel.slice(panel.indexOf("const toggle = () => {"), panel.indexOf("const close"));
    expect(toggle.indexOf("canOpenTemplatePanel()")).toBeGreaterThan(-1);
    expect(toggle.indexOf("CANVAS_TEMPLATES_COMING_SOON_TITLE")).toBeLessThan(toggle.indexOf("setOpen(v => !v)"));
    // 面板内不得有其它直接打开的口子
    expect(panel).not.toMatch(/setOpen\(true\)/);
  });
});
