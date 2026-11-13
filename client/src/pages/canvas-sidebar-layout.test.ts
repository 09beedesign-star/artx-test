/**
 * 画布页常驻左侧边栏（2026-11-13）
 *
 * 需求：进入画布后左侧边栏常驻、默认展开、可收起；侧栏不能压住画布中间的上传入口；
 * 无论收起与否，三张上传卡和顶部工具条都在「画布区」内居中。
 *
 * 实现要点（任何一条被改回去都会零报错地错位）：
 *  1. /project/:id 包在 AppShell 里，但**不**走 ShellRoutes（`.artx-page-fade` 的
 *     transform 会给 fixed 子元素造新包含块）。
 *  2. Workspace 用 h-full，不能是 h-screen（外层 AppShell 已是 h-screen）。
 *  3. 顶部工具条用 absolute（相对画布根），不能 fixed + left:50%（那是视口居中）。
 *  4. 侧栏默认展开：navCollapsed 初值 false。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("画布页常驻左侧边栏", () => {
  it("/project/:id 包在 AppShell 里，且不经过带 artx-page-fade 的 ShellRoutes", () => {
    const app = src("App.tsx");
    const start = app.indexOf('<Route path="/project/:id">');
    expect(start).toBeGreaterThan(-1);
    const block = app.slice(start, app.indexOf("</Route>", start));
    expect(block).toContain("<AppShell>");
    expect(block).toContain("<Workspace projectId={params.id} />");
    expect(block).not.toContain("artx-page-fade");
    // 画布路由必须在 ShellRoutes 兜底路由之前，否则被它吞掉
    expect(start).toBeLessThan(app.indexOf("<ShellRoutes />"));
  });

  it("Workspace 用 h-full 填满 <main>，不能再写 h-screen", () => {
    const ws = src("pages/Workspace.tsx");
    expect(ws).toContain('className="flex flex-col h-full overflow-hidden"');
    expect(ws).not.toMatch(/className="[^"]*\bh-screen\b/);
  });

  it("侧边栏默认展开", () => {
    const shell = src("components/layout/AppShell.tsx");
    expect(shell).toContain("const [navCollapsed, setNavCollapsed] = useState(false);");
  });

  it("顶部工具条相对画布根居中（absolute），不是相对视口（fixed）", () => {
    const canvas = src("components/canvas/InfiniteCanvas.tsx");
    const i = canvas.indexOf("data-canvas-top-tool-palette");
    expect(i).toBeGreaterThan(-1);
    const block = canvas.slice(i - 600, i + 400);
    expect(block).toContain('className="absolute nodrag nopan"');
    expect(block).not.toContain('className="fixed nodrag nopan"');
    expect(block).not.toContain("100vw");
  });

  it("生成弹层初始位置以画布根为参照，不用视口中心", () => {
    const canvas = src("components/canvas/InfiniteCanvas.tsx");
    expect(canvas).not.toContain("window.innerWidth / 2 - 84 - popoverWidth");
    expect(canvas).toContain("(canvasLeft + canvasRight) / 2 - 84 - popoverWidth");
  });
});
