import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 悬浮提示词输入框（AssetEditPromptBar）的「图片快捷编辑 / 局部重绘」
 * 不得被**可选的**提示词优化步骤拖垮（2026-11-15 线上事故）。
 *
 * 事故取证（生产库 admin-data.aiTasks）：
 *   2026-11-15T11:49:00.860Z capability="chat" model="claude-opus-5"
 *   status="failed" failureReason="upstream error: do request failed (request id: ...)"
 *   同一分钟 text_to_image 是 success —— VOD 出图链路完全健康。
 *
 * 根因：`handleAssetEditSubmit` 把 `callLLM("image-quick-edit-prompt")`
 * 放在 try 块第一步且无兜底。中转站文本网关一抖，整个快捷编辑直接进
 * catch 显示「快捷编辑失败」，而真正出图的 `runDerivedImageGeneration`
 * 根本没执行 → 用户看到「输入提示词后无法实现图片重绘的效果」。
 *
 * 📌 判据：把「可选的增强层」设成功能成立的必要条件 = 随机断路器。
 *    文本网关与 VOD 出图互不依赖，不该被串成一条链。
 *
 * 修复：抽出共用兜底函数 `optimizeImageEditPromptWithFallback`，
 * 优化失败降级为原始提示词继续出图。两处同类出口（图片快捷编辑 /
 * 3D 视角渲染）必须共用它，别只改一处。
 */
const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");

/** 切出兜底函数定义本身（切片为空会让下面所有断言假绿）。 */
function readFallbackHelper() {
  const start = source.indexOf(
    "async function optimizeImageEditPromptWithFallback({"
  );
  expect(start, "找不到提示词优化兜底函数").toBeGreaterThan(-1);
  const end = source.indexOf(
    "async function getVisibleAssetImageSourceFromNode",
    start
  );
  expect(end, "兜底函数后找不到切片终点").toBeGreaterThan(start);
  const block = source.slice(start, end);
  expect(block.length, "兜底函数切片太短，样本无效").toBeGreaterThan(300);
  return block;
}
const helper = readFallbackHelper();

describe("悬浮提示词输入框：提示词优化是可选项，不是出图必要条件", () => {
  it("兜底函数真的调 callLLM，并把异常吞掉降级为 fallback", () => {
    // 正向：确实还在做提示词优化（没有把功能整个砍掉）。
    expect(helper).toContain("await callLLM({");
    expect(helper).toContain("model: DEFAULT_TEXT_MODEL");
    expect(helper).toContain("result.text.trim() || fallback");
    // 正向：catch 里返回 fallback 而不是 rethrow —— 这是修复的本体。
    expect(helper).toContain("} catch (error) {");
    expect(helper).toMatch(/catch \(error\) \{[\s\S]*?return fallback;[\s\S]*?\}/);
    // 反向：catch 里绝不能再把错误抛出去，否则又变回「断路器」。
    const catchBody = helper.slice(helper.indexOf("} catch (error) {"));
    expect(catchBody, "兜底分支又抛错，快捷编辑会再次整条失败").not.toContain(
      "throw error"
    );
    expect(catchBody).not.toContain("notifyAiFailure");
    // 归因日志必须留，否则下次网关抖动无从排查。
    expect(catchBody).toContain("console.warn");
  });

  it("图片快捷编辑出口必须走兜底函数，且 fallback 是用户原始提示词", () => {
    const idx = source.indexOf('module: "image-quick-edit-prompt"');
    expect(idx, "找不到图片快捷编辑出口").toBeGreaterThan(-1);
    const block = source.slice(idx - 400, idx + 900);
    expect(block).toContain("await optimizeImageEditPromptWithFallback({");
    // 降级必须落回用户真实输入，不能落回「优化用的系统提示词」。
    expect(block).toContain("fallback:");
    expect(block).toMatch(/fallback:\s*payload\.prompt/);
  });

  it("3D 视角渲染出口也共用同一个兜底函数（防「多个出口只改一个」）", () => {
    const idx = source.indexOf('module: "model3d-view-render-prompt"');
    expect(idx, "找不到 3D 视角渲染出口").toBeGreaterThan(-1);
    const block = source.slice(idx - 400, idx + 900);
    expect(block).toContain("await optimizeImageEditPromptWithFallback({");
    expect(block).toContain("fallback: placeholderPrompt");
  });

  it("两处出口都不再直接 await callLLM（否则就是绕过兜底的第二个出口）", () => {
    // 全文件只应剩下兜底函数内部这一处 await callLLM。
    const all = [...source.matchAll(/await callLLM\(\{/g)].length;
    // 其它 callLLM 调用点用的是别的写法（await callLLM({ ... }) 也在计数内），
    // 所以这里精确限定：两个编辑出口的 module 附近不许出现裸调用。
    for (const module of [
      'module: "image-quick-edit-prompt"',
      'module: "model3d-view-render-prompt"',
    ]) {
      const idx = source.indexOf(module);
      expect(idx).toBeGreaterThan(-1);
      const win = source.slice(idx - 300, idx + 700);
      expect(win, `${module} 附近出现了绕过兜底的裸 callLLM`).not.toContain(
        "const optimizedPrompt = await callLLM"
      );
    }
    expect(all, "源码里完全没有 callLLM 调用点，锚点可能整体失效").toBeGreaterThan(0);
  });

  it("硬约束仍在优化之后拼接（降级路径同样经过，不会被冲掉）", () => {
    const idx = source.indexOf('module: "image-quick-edit-prompt"');
    const block = source.slice(idx, idx + 2600);
    // ⚠️ 必须剥注释再断言：把常量注释掉时字符串仍在源码里，
    //    裸 toContain 会恒绿（变异测试实测 F 存活过一轮）。
    const code = block
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const finalPromptStart = code.indexOf("const finalPrompt = [");
    expect(finalPromptStart, "找不到 finalPrompt 拼装").toBeGreaterThan(-1);
    const finalPromptBlock = code.slice(finalPromptStart, finalPromptStart + 260);
    expect(finalPromptBlock).toMatch(/\[\s*VIEWPOINT_LOCK_PROMPT_ZH/);
    expect(finalPromptBlock).toContain("buildRegionEditPromptPrefix(regionRect)");
    expect(finalPromptBlock).toContain("具体修改要求：");
    // 优化结果必须出现在 finalPrompt 里（证明降级后的文本真的进了出图链路）。
    expect(code).toMatch(/具体修改要求：\$\{optimizedText\}/);
  });
});
