import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments, assertStripKeptSource } from "../../../../shared/strip-source-comments";

/**
 * 右下角 composer 选 3D 模型后必须真的生成 3D（2026-11-15）。
 *
 * 事故：3D 分类接进了下拉，但 handleSubmit 只读 assistantModelTab，
 * 完全没读展示层分类 → 用户选了 3D 模型、点发送，出来的还是图片。
 * 📌 「分类能选」不等于「选择被消费」，提交链路必须单独锁。
 */
function readSource(name: string) {
  const raw = readFileSync(resolve(__dirname, name), "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped);
  return stripped;
}
const source = readSource("InfiniteCanvas.tsx");
/** 2026-11-18：3D 积分角标渲染已抽到公共浮层组件，单独读一份。 */
const selectorSource = readSource("ModelSelector.tsx");

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

  /** 唯一执行链路 runCanvasThreeDGeneration 的函数体。 */
  function readRunner() {
    const start = source.indexOf("async function runCanvasThreeDGeneration(");
    expect(start, "找不到 3D 生成唯一链路").toBeGreaterThan(-1);
    const end = source.indexOf("\n}\n", start);
    const block = source.slice(start, end);
    expect(block.length, "3D 生成链路切得太短，样本无效").toBeGreaterThan(600);
    return block;
  }
  const runner = readRunner();

  it("复用 3D 任务收口，模型取用户在下拉里选中的 3D 模型", () => {
    expect(branch).toContain("const threeDModelId = assistant3DModelId;");
    const callAt = branch.indexOf("runCanvasThreeDGeneration({");
    expect(callAt, "3D 分支必须走唯一生成链路").toBeGreaterThan(-1);
    const callBlock = branch.slice(callAt, callAt + 240);
    expect(callBlock).toMatch(/prompt:\s*threeDPrompt/);
    expect(callBlock).toMatch(/model:\s*threeDModelId/);
    expect(callBlock).not.toMatch(/model:\s*assistantImageModelId/);
    expect(runner).toContain("startThreeDGenerationTask({");
    expect(runner).toContain("waitForThreeDGenerationTask(");
    expect(runner).toMatch(/model:\s*input\.model/);
    // 不许另写一套 fetch 绕开 /api/threed/generate
    expect(branch).not.toContain("fetch(");
    expect(runner).not.toContain("fetch(");
  });

  it("3D 结果进画布内 3D 容器节点，不再弹独立的 3D 预览弹窗（2026-11-16）", () => {
    expect(source).toContain(
      'const CANVAS_3D_GENERATED_EVENT = "canvas-3d-generated";'
    );
    // 先派发 start（放容器占位），再提交任务 —— 顺序反了就不是「点发送立刻出现」
    const startEvt = runner.indexOf('phase: "start"');
    const submit = runner.indexOf("startThreeDGenerationTask({");
    expect(startEvt).toBeGreaterThan(-1);
    expect(startEvt, "占位容器必须早于提交任务").toBeLessThan(submit);
    expect(runner).toContain('phase: "completed"');
    expect(runner).toContain('phase: "failed"');
    // 容器只认服务端转存后的 modelId，不认外部 modelUrl（国内拉不到 GitHub CDN）
    expect(runner).toContain("modelId: completed.modelId");
    expect(runner).not.toContain("modelUrl: completed.modelUrl");
    // 图片右键 3D 面板走同一链路（不另开第二个出口）
    const panelCb = source.indexOf("onSubmit={({ prompt, model }) => {");
    expect(panelCb, "找不到 3D 生成面板回调").toBeGreaterThan(-1);
    expect(source.slice(panelCb, panelCb + 500)).toContain("runCanvasThreeDGeneration({");
    // 监听者：放 3D 容器节点，带生成中标记
    const listenAt = source.indexOf("window.addEventListener(CANVAS_3D_GENERATED_EVENT, handler)");
    expect(listenAt, "找不到 3D 生成事件监听").toBeGreaterThan(-1);
    const listener = source.slice(listenAt - 5200, listenAt);
    expect(listener).toContain("createModel3DContainerNode(center)");
    expect(listener).toContain("generatingTaskId: detail.taskId");
    expect(listener).toContain("appendContainerModels(d, [item])");
    // 独立预览弹窗彻底下线
    expect(source).not.toContain("<ThreeDViewerDialog");
    expect(source).not.toContain("setThreeDViewerState");
  });

  it("提交中有 3D 进度文案，且 3D 模型行显示积分单价", () => {
    expect(source).toMatch(/useState<"image" \| "text" \| "3d">/);
    expect(source).toContain('"正在生成 3D 模型..."');
    // 3D 模型单价必须在选中前可见（混元生 3D 2400 积分/次）。
    // ⚠️ 锁渲染条件本身：只搜函数名会命中别处的调用，
    //    把条件改成恒 false 后函数还在，断言照样绿（变异实测抓不到）。
    // 2026-11-18 起角标渲染收口在公共浮层 AssistantModelPopover，只在 3D 分类显示。
    expect(selectorSource).toMatch(
      /const threeDCredit = is3D && show3DCreditBadge\s*\?\s*getAiThreeDModelCreditPolicy\(model\.id\)/
    );
    expect(selectorSource).toMatch(/\{is3D && threeDCredit \? \(/);
    expect(selectorSource).toContain("积分/次");
  });
});
