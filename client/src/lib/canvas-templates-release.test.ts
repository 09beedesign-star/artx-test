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

describe("版式工作台：正式上架且保留入口防护", () => {
  it("正式生产环境与本地开发均可打开", () => {
    expect(CANVAS_TEMPLATES_PUBLIC).toBe(true);
    expect(canOpenTemplatePanel(false)).toBe(true);
    expect(canOpenTemplatePanel(true)).toBe(true);
  });

  it("文案固定", () => {
    expect(CANVAS_TEMPLATES_COMING_SOON_TITLE).toBe("更多排版模板即将上线，敬请期待");
  });

  it("面板唯一打开口子先过闸门，未开放时弹提示而不是 setOpen", () => {
    const start = panel.indexOf("const toggle = () => {");
    const end = panel.indexOf("const close", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const toggle = panel.slice(start, end);
    expect(toggle).toMatch(/if\s*\(!canOpenTemplatePanel\(\)\)\s*\{\s*toast\(CANVAS_TEMPLATES_COMING_SOON_TITLE,\s*\{\s*description:\s*CANVAS_TEMPLATES_COMING_SOON_DESC\s*\}\);\s*return;\s*\}\s*setOpen\(v => !v\);/);
    // 面板内不得有其它直接打开的口子。
    const openCalls = panel.match(/setOpen\((?!false\))[^;]+;/g) || [];
    expect(openCalls).toEqual(["setOpen(v => !v);"]);
    expect(panel).not.toMatch(/setOpen\(\s*true\s*\)/);
  });
});
