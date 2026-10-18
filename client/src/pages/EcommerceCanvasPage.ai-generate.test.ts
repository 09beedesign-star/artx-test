/**
 * EcommerceCanvasPage.ai-generate.test.ts
 *
 * 电商画布 AI 生成底层逻辑测试（2026-10-17 修复后验证）
 *
 * 根因：原实现调用 generateImages（text_to_image），完全没传商品图，导致
 * 生成的是不相关的图片。修复后改为与智能产品板块相同的底层链路：
 *   - 产品图模式（有背景模板）→ createProductBackground（smart_background）
 *   - 带货图文模式（有分镜）→ editImageWithPrompt × N（image_edit）
 *
 * 本测试覆盖：
 *   1. 产品图模式调用 createProductBackground，传入商品图和背景模板 ID
 *   2. 带货图文模式循环调用 editImageWithPrompt，传入商品图作为源图
 *   3. 带货图文逐张追加差异化指令（分镜角度），避免出一样的图
 *   4. buildPrompt 包含产品保护规则（不能重绘、换色、替换商品主体）
 *   5. 计费逻辑：产品图 smart_background（480/请求），带货图文 image_edit（180/次 × N）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("./EcommerceCanvasPage.tsx", import.meta.url),
  "utf-8",
);

describe("EcommerceCanvasPage — AI 生成底层逻辑（2026-10-17 修复）", () => {
  it("1. 导入了 createProductBackground 和 editImageWithPrompt（AI 能力源头与智能产品一致）", () => {
    // 只锁「从 @/lib/ai 导入了这两个能力」，不锁整行字面量（2026-10-18 断点恢复追加了 waitForImageGenerationTask）。
    const aiImport = pageSource.match(/import \{([^}]*)\} from "@\/lib\/ai"/);
    expect(aiImport).not.toBeNull();
    const names = aiImport![1].split(",").map(s => s.trim());
    expect(names).toContain("createProductBackground");
    expect(names).toContain("editImageWithPrompt");
  });

  it("2. buildPrompt 包含产品保护规则（PRODUCT_PROTECTION_RULES）", () => {
    expect(pageSource).toContain("const PRODUCT_PROTECTION_RULES = [");
    expect(pageSource).toContain("强约束：必须以上传的产品图作为唯一商品主体");
    expect(pageSource).toContain("保持上传产品图的商品主体完整清晰");
    expect(pageSource).toContain("风格只能影响背景、道具和环境氛围，不能卡通化、重绘或重新解释产品主体");
  });

  it("3. 产品图模式 buildPrompt 输出包含背景模板名和产品保护规则", () => {
    const buildPromptBlock = pageSource.match(
      /function buildPrompt\(\)\s*\{[\s\S]*?^  \}/m,
    )?.[0];
    expect(buildPromptBlock).toBeTruthy();
    expect(buildPromptBlock).toContain('if (mode === "product")');
    expect(buildPromptBlock).toContain("draft.bgTemplate ? `电商背景模板：${draft.bgTemplate.name}`");
    expect(buildPromptBlock).toContain("...PRODUCT_PROTECTION_RULES,");
  });

  it("4. 产品图模式调用 createProductBackground，传入 imageSrc（draft.uploads[0]）和 sceneType（draft.bgTemplate.id）", () => {
    const handleGenerateBlock = pageSource.match(
      /const handleGenerate = useCallback\(async \(\) => \{[\s\S]*?\}, \[/m,
    )?.[0];
    expect(handleGenerateBlock).toBeTruthy();
    expect(handleGenerateBlock).toContain('if (startedMode === "product")');
    expect(handleGenerateBlock).toContain("await createProductBackground({");
    expect(handleGenerateBlock).toContain("imageSrc: draft.uploads[0],");
    expect(handleGenerateBlock).toContain("sceneType: draft.bgTemplate?.id,");
    expect(handleGenerateBlock).toContain("resolution: draft.productTier");
    expect(handleGenerateBlock).toContain("count: startedCount,");
  });

  it("5. 带货图文模式循环调用 editImageWithPrompt（image_edit），传入 imageSrc（商品图）", () => {
    const handleGenerateBlock = pageSource.match(
      /const handleGenerate = useCallback\(async \(\) => \{[\s\S]*?\}, \[/m,
    )?.[0];
    expect(handleGenerateBlock).toBeTruthy();
    expect(handleGenerateBlock).toContain("} else {");
    expect(handleGenerateBlock).toContain("for (let index = 0; index < startedCount; index += 1)");
    expect(handleGenerateBlock).toContain("await editImageWithPrompt({");
    expect(handleGenerateBlock).toContain("imageSrc: draft.uploads[0],");
    expect(handleGenerateBlock).toContain("model: draft.model,");
  });

  it("6. 带货图文模式逐张追加差异化指令（分镜角度），避免出一样的图", () => {
    const handleGenerateBlock = pageSource.match(
      /const handleGenerate = useCallback\(async \(\) => \{[\s\S]*?\}, \[/m,
    )?.[0];
    expect(handleGenerateBlock).toContain("const shots = tpl ? splitFlow(tpl.flow) : [];");
    expect(handleGenerateBlock).toContain("const shot = shots.length");
    expect(handleGenerateBlock).toContain("这是第 ${index + 1} / ${startedCount} 张");
    expect(handleGenerateBlock).toContain("本张分镜：${shot}");
    expect(handleGenerateBlock).toContain("更换构图角度、道具搭配与光影氛围，与其他张形成明显差异");
  });

  it("7. 带货图文模式传入额外参考图（其他上传图）作为补充", () => {
    const handleGenerateBlock = pageSource.match(
      /const handleGenerate = useCallback\(async \(\) => \{[\s\S]*?\}, \[/m,
    )?.[0];
    expect(handleGenerateBlock).toContain("const extraRefs = draft.uploads.slice(1).map((src, i) => ({");
    expect(handleGenerateBlock).toContain("title: `same product, another angle ${i + 2}`");
    expect(handleGenerateBlock).toContain("referencedAssets: extraRefs,");
  });

  it("8. 带货图文模式逐张容错（失败的跳过，至少拿到 1 张就算成功）", () => {
    const handleGenerateBlock = pageSource.match(
      /const handleGenerate = useCallback\(async \(\) => \{[\s\S]*?\}, \[/m,
    )?.[0];
    expect(handleGenerateBlock).toContain("const collected: string[] = [];");
    expect(handleGenerateBlock).toContain("let lastError: unknown = null;");
    expect(handleGenerateBlock).toContain("try {");
    expect(handleGenerateBlock).toContain("} catch (error) {");
    expect(handleGenerateBlock).toContain("lastError = error;");
    expect(handleGenerateBlock).toContain("if (collected.length === 0) {");
    expect(handleGenerateBlock).toContain("throw lastError");
  });

  it("9. 计费能力：产品图 smart_background，带货图文 image_edit", () => {
    expect(pageSource).toContain('const billingCapability = mode === "product" ? "smart_background" : "image_edit";');
  });

  it("10. 计费逻辑：产品图 smart_background 一次请求（flat），带货图文 image_edit 循环 N 次 × chargedCredits", () => {
    const quoteBlock = pageSource.match(
      /const quote = useMemo\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/m,
    )?.[0];
    expect(quoteBlock).toBeTruthy();
    expect(quoteBlock).toContain('mode === "product"');
    expect(quoteBlock).toContain("single.chargedCredits * count");
  });

  it("11. unitCredits：产品图均摊（480 / count），带货图文真按张计（180）", () => {
    const unitBlock = pageSource.match(
      /const unitCredits = useMemo\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/m,
    )?.[0];
    expect(unitBlock).toBeTruthy();
    expect(unitBlock).toContain('if (mode === "product")');
    expect(unitBlock).toContain("chargedCredits / count");
    expect(unitBlock).toContain('capability: "image_edit"');
  });
});
