import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 扩图 / 裁切 / 擦除 / 视角这四种「就地编辑态」会在节点内部渲染自己的控制面板
 * 和边缘拖拽手柄。资源工具条（AssetFloatingToolbar）是贴着节点左边缘竖排的浮层，
 * 两者必然重叠 —— 工具条会盖住扩展框的左边界与底部面板的左半部分，
 * 用户既拖不动左边缘、也点不到面板左侧按钮。
 *
 * ⚠️ 这里锁的是「渲染条件」而不是「样式微调」：
 * 历史上曾用 imageToolbarBottomPanelReserve（给底部面板预留 96px）缓解过，
 * 但那只让工具条上移，横向遮挡一点没解决 —— 工具条 left 恒等于节点左边缘。
 * 所以断言必须落在 JSX 渲染守卫上，避免有人把修复"退化"回纯样式方案。
 */

const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

/** 剥掉整行块注释，防止断言命中我们自己写的解释性注释。 */
function stripBlockComments(text: string): string {
  return text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const code = stripBlockComments(source);

describe("就地编辑态必须隐藏资源工具条", () => {
  it("剥注释后仍含实质代码（防断言空转）", () => {
    expect(code).toContain("AssetFloatingToolbar");
    expect(code).toContain("selectedImageInInlineEditMode");
    expect(code.length).toBeGreaterThan(100000);
  });

  it("定义了 selectedImageInInlineEditMode，且覆盖四种就地编辑态", () => {
    const block = code.match(
      /const selectedImageInInlineEditMode = Boolean\(([\s\S]*?)\n\s*\);/
    )?.[1];
    expect(block).toBeTruthy();
    expect(block).toContain("isExpanding");
    expect(block).toContain("isCropping");
    expect(block).toContain("isErasing");
    expect(block).toContain("isCameraViewAdjusting");
    // 只对 asset 节点生效，画板（canvasFrame）没有这些就地编辑态
    expect(block).toContain('selectedImageNode?.type === "asset"');
  });

  it("AssetFloatingToolbar 的渲染条件带上了这个守卫", () => {
    const renderGuard = code.match(
      /\{selectedVisualNodeIds\.length === 1 &&[\s\S]{0,200}?<AssetFloatingToolbar/
    )?.[0];
    expect(renderGuard).toBeTruthy();
    expect(renderGuard).toContain("!selectedImageInInlineEditMode");
  });

  it("反向断言：修复不能退化成只调样式/只预留边距", () => {
    // 只要渲染守卫还在，纯样式方案（例如把 reserve 调大、给工具条加透明度）
    // 就不足以作为修复。这里显式拒绝"删掉守卫只留 reserve"的写法。
    const renderGuard = code.match(
      /\{selectedVisualNodeIds\.length === 1 &&[\s\S]{0,200}?<AssetFloatingToolbar/
    )?.[0];
    expect(renderGuard).not.toMatch(/opacity:\s*0/);
    expect(renderGuard).toContain("!selectedImageInInlineEditMode");
  });

  it("扩图面板与扩展框仍然渲染（隐藏的只是工具条，不是功能本身）", () => {
    expect(code).toContain("{isExpanding && !isAiProcessingImage && (");
    expect(code).toContain("applyExpandRatio");
    expect(code).toContain("cancelExpand");
    expect(code).toContain("confirmExpand");
  });
});
