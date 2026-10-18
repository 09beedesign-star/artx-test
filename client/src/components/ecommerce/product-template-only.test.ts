/**
 * 产品图「只靠背景模板出图」守卫（2026-10-18 用户需求）。
 *
 * 背景：选了 PicWish 模板时服务端只传 scene_type、整段 prompt 不传
 * （server/image-generation.ts createBackgroundWithPicWish 三元互斥），
 * 用户在模板模式下填的文字等于没填，且界面不告诉他。
 *
 * 锁三件事：
 *   1. 服务端互斥仍成立（前提变了，本次的隐藏就该重新评估）
 *   2. 电商画布：卖点框只在带货图文出现；产品图有「无需提示词」说明；产品图 prompt 不再拼卖点
 *   3. 智能产品：模板面板有「无需提示词」说明
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");

const server = read("../../../../server/image-generation.ts");
const workspace = read("./EcommerceWorkspace.tsx");
const page = read("../../pages/EcommerceCanvasPage.tsx");
const dialog = read("../canvas/SmartCommerceProductDialog.tsx");

describe("产品图只靠背景模板出图", () => {
  it("前提：服务端选了模板就不传 prompt", () => {
    expect(server).toContain("...(input.sceneType ? { scene_type: input.sceneType } : { prompt })");
  });

  it("电商画布：卖点 textarea 包在 mode === \"post\" 分支里", () => {
    const idx = workspace.indexOf("value={draft.sellingPoints}");
    expect(idx).toBeGreaterThan(0);
    const guard = workspace.lastIndexOf('{mode === "post" ? (', idx);
    const productBranch = workspace.lastIndexOf(") : (", idx);
    // 最近的 post 守卫必须在 textarea 之前，且两者之间没有切进别的分支
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(productBranch);
  });

  it("电商画布：产品图有「无需提示词」说明，底部文案不再声称融合卖点", () => {
    expect(workspace).toContain('data-testid="ecommerce-product-template-hint"');
    expect(workspace).toContain("无需填写提示词");
    expect(workspace).not.toContain("融合左侧上传图、设置、卖点与背景模板");
  });

  it("电商画布：产品图 buildPrompt 不拼卖点", () => {
    const block = page.match(/function buildPrompt\(\)\s*\{[\s\S]*?^  \}/m)?.[0] || "";
    const productBranch = block.slice(0, block.indexOf("const tpl ="));
    expect(productBranch).toContain('if (mode === "product")');
    expect(productBranch).not.toContain("draft.sellingPoints");
    // 带货图文仍然用卖点
    expect(block.slice(block.indexOf("const tpl ="))).toContain("draft.sellingPoints");
  });

  it("智能产品：模板面板有「无需提示词」说明", () => {
    expect(dialog).toContain('data-testid="smart-product-template-hint"');
    expect(dialog).toContain("精调模板，无需提示词");
  });
});
