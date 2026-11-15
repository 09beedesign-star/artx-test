import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角 composer 选 3D 模型后必须真的生成 3D（2026-11-15）。
 *
 * 事故：3D 分类接进了下拉，但 handleSubmit 只读 assistantModelTab，
 * 完全没读展示层分类 → 用户选了 3D 模型、点发送，出来的还是图片。
 * 📌 「分类能选」不等于「选择被消费」，提交链路必须单独锁。
 */
const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");

/** 切出 handleSubmit 开头（3D 分支必须在这段里，切空会让断言集体假绿）。 */
function readSubmitHead() {
  const start = source.indexOf("async function handleSubmit()");
  expect(start, "找不到提交函数锚点").toBeGreaterThan(-1);
  const block = source.slice(start, start + 9000);
  expect(block, "提交函数切片太短，样本无效").toContain("const userMessage");
  return block;
}
const submitHead = readSubmitHead();

/** 切出 3D 分支本身。 */
function readThreeDBranch() {
  const start = submitHead.indexOf(
    'if (assistantModelPanelCategory === "3d") {'
  );
  expect(start, "提交函数里没有 3D 分支").toBeGreaterThan(-1);
  const end = submitHead.indexOf("    const userMessage = {", start);
  expect(end, "3D 分支没有在提交函数里收口").toBeGreaterThan(start);
  const block = submitHead.slice(start, end);
  expect(block.length, "3D 分支切得太短，样本无效").toBeGreaterThan(800);
  return block;
}
const branch = readThreeDBranch();

describe("右下角 composer 3D 生成链路", () => {
  it("提交函数在进入原有生图/对话流程前先按 3D 分类分叉，并锁 return", () => {
    const branchAt = submitHead.indexOf(
      'if (assistantModelPanelCategory === "3d") {'
    );
    // setSubmittingKind 是原有生图/对话流程的起点，紧跟在 3D 分叉之后。
    const originalFlowAt = submitHead.indexOf("setSubmittingKind(");
    expect(branchAt, "找不到 3D 分叉").toBeGreaterThan(-1);
    expect(originalFlowAt, "切片里找不到原有流程起点，范围可能划错").toBeGreaterThan(-1);
    expect(branchAt, "3D 分叉必须早于原有生图/对话流程").toBeLessThan(originalFlowAt);
    // 没有 return 的话会继续执行下面的生图链路 —— 又变回「生成图片」。
    expect(branch).toMatch(/\n\s*return;\s*\n\s*\}\s*$/);
    expect(branch, "3D 分支里不许派发图片任务").not.toContain(
      "dispatchImageGenerationTask("
    );
  });

  it("复用 3D 任务收口，模型取用户在下拉里选中的 3D 模型", () => {
    expect(branch).toContain("startThreeDGenerationTask({");
    expect(branch).toContain("waitForThreeDGenerationTask(");
    expect(branch).toContain("const threeDModelId = assistant3DModelId;");
    expect(branch).toMatch(/prompt:\s*threeDPrompt/);
    /*
     * ⚠️ 必须切到启动调用本身：只断言「branch 里出现过 model: threeDModelId」
     *    会命中下面事件 detail 里的同名字段，把请求改成图片模型照样全绿
     *    （变异测试实测抓不到，是覆盖缺口不是等价变异）。
     */
    const startAt = branch.indexOf("startThreeDGenerationTask({");
    expect(startAt, "找不到 3D 任务启动调用").toBeGreaterThan(-1);
    const callBlock = branch.slice(startAt, startAt + 320);
    expect(callBlock).toMatch(/model:\s*threeDModelId/);
    expect(callBlock).not.toMatch(/model:\s*assistantImageModelId/);
    // 不许另写一套 fetch 绕开 /api/threed/generate
    expect(branch).not.toContain("fetch(");
  });

  it("生成完成后两个入口都派发同一个事件，由画布统一开预览", () => {
    expect(source).toContain(
      'const CANVAS_3D_GENERATED_EVENT = "canvas-3d-generated";'
    );
    expect(branch).toContain(
      "new CustomEvent(CANVAS_3D_GENERATED_EVENT"
    );
    expect(branch).toContain("modelUrl: completed.modelUrl");
    // 图片右键那个 3D 面板也必须走同一事件，否则出现第二个出口
    const panelCb = source.indexOf(
      "onGenerated={(modelUrl, model, prompt) => {"
    );
    expect(panelCb, "找不到 3D 生成面板回调").toBeGreaterThan(-1);
    const cbBlock = source.slice(panelCb, panelCb + 500);
    expect(cbBlock).toContain("new CustomEvent(CANVAS_3D_GENERATED_EVENT");
    // 唯一监听者 → 打开预览 state
    expect(source).toContain(
      "window.addEventListener(CANVAS_3D_GENERATED_EVENT, onGenerated)"
    );
    expect(source).toContain("setThreeDViewerState(detail)");
  });

  it("提交中有 3D 进度文案，且 3D 模型行显示积分单价", () => {
    expect(source).toMatch(/useState<"image" \| "text" \| "3d">/);
    expect(source).toContain('"正在生成 3D 模型..."');
    // 3D 模型单价 300~500 积分/次且各不相同，选中前必须可见。
    // ⚠️ 锁渲染条件本身：只搜函数名会命中角标里的第二次调用，
    //    把条件改成恒 false 后函数还在，断言照样绿（变异实测抓不到）。
    expect(source).toMatch(
      /assistantModelPanelCategory === "3d"\s*&&\s*getAiThreeDModelCreditPolicy\(model\.id\)/
    );
    expect(source).toContain("积分/次");
  });
});
