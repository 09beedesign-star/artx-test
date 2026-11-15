/**
 * 🔒 2026-11-15 用户要求：画布空状态「生成图片」草稿框（DraftImageNodeComponent）里的
 * 模型选择器展开面板，在浅色主题下必须是白色模式。
 *
 * 改之前：没传 popoverTheme → 走默认 "dark" → 浅色画布上弹出 #161616 黑面板。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const raw = readFileSync(
  resolve(repoRoot, "client/src/components/canvas/InfiniteCanvas.tsx"),
  "utf8",
);
const src = stripSourceComments(raw);
assertStripKeptSource(raw, src, 0.45);

describe("草稿生成框的模型选择器跟随浅色主题", () => {
  it("DraftImageNodeComponent 的 ModelSelector 传 popoverTheme", () => {
    const start = src.indexOf("function DraftImageNodeComponent(");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("\nfunction ", start + 10);
    const node = src.slice(start, end);
    const selStart = node.indexOf("<ModelSelector");
    expect(selStart).toBeGreaterThan(0);
    const selector = node.slice(selStart, node.indexOf("/>", selStart));
    expect(selector).toContain('popoverTheme={isDark ? "dark" : "light"}');
  });

  it("2026-11-15：去掉快捷键灰字，控制条与「生成」同一行，输入框 4 行", () => {
    const start = src.indexOf("function DraftImageNodeComponent(");
    const node = src.slice(start, src.indexOf("\nfunction ", start + 10));
    expect(node).not.toContain("Enter 生成 · Shift+Enter 换行");
    const row = node.slice(node.indexOf('data-draft-control-row=""'));
    expect(row.indexOf("<ImageRatioSelector")).toBeGreaterThan(0);
    // 「生成」按钮在同一个控制行容器里（位于比例选择器之后）
    expect(row.indexOf("生成\n")).toBeGreaterThan(row.indexOf("<ImageRatioSelector"));
    expect(node).toContain("rows={4}");
  });

  it("light token 是白底深字", async () => {
    const { modelPopoverTokens } = await import("./model-popover-tokens");
    const t = modelPopoverTokens("light", { text: "#161616", border: "#000" }, false);
    expect(t.background).toBe("#ffffff");
    expect(t.text).toBe("rgba(20,20,36,0.88)");
  });
});
