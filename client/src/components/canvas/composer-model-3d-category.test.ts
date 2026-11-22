import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-11-22 用户要求：右下角模型菜单只留生图 / 对话，不再提供 3D 分类。
 * 推翻原先「右下角必须有 3D tab」的前提，保留独立 3D 入口、公共组件与计费隔离保护。
 * 仅关闭入口及状态写入，不在本次菜单改动中重构历史 3D 执行链路或修改计费。
 */
const canvasSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");
const selectorSource = readFileSync(resolve(__dirname, "ModelSelector.tsx"), "utf8");
const popoverStart = canvasSource.indexOf("<AssistantModelPopover");
expect(popoverStart, "找不到右下角浮层调用，样本无效").toBeGreaterThan(-1);
const popoverEnd = canvasSource.indexOf("/>", popoverStart);
expect(popoverEnd).toBeGreaterThan(popoverStart);
const popover = canvasSource.slice(popoverStart, popoverEnd);
const tabs = popover.match(/tabs=\{\[([\s\S]*?)\]\}/)?.[1];
expect(tabs, "找不到分类配置，样本无效").toBeTruthy();
const categoryHandler = popover.match(/onCategoryChange=\{cat => \{([\s\S]*?)\n\s*\}\}/)?.[1];
expect(categoryHandler, "找不到分类切换回调，样本无效").toBeTruthy();

function changeCategory(cat: string) {
  const writes: Array<[string, string]> = [];
  new Function("cat", "setAssistantModelPanelCategory", "setAssistantModelTab", categoryHandler!)(
    cat,
    (value: string) => writes.push(["panel", value]),
    (value: string) => writes.push(["business", value])
  );
  return writes;
}

describe("右下角模型菜单移除 3D 分类", () => {
  it("仅配置生图和对话，不能通过开发环境开关重新出现 3D", () => {
    const ids = [...tabs!.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1]);
    expect(ids).toEqual(["image", "text"]);
    expect(tabs).toContain('label: "生图"');
    expect(tabs).toContain('label: "对话"');
    expect(tabs).not.toMatch(/THREED|3[dD]/);
    expect(popover).toContain("showAuto");
  });

  it.each(["image", "text"])("%s 分类正常同步展示和业务页签", category => {
    expect(changeCategory(category)).toEqual([["panel", category], ["business", category]]);
  });

  it.each(["3d", "video", ""])("拒绝分类 %s，不能由共享回调恢复 3D 状态", category => {
    expect(changeCategory(category)).toEqual([]);
  });

  it("分类初值与其他状态写入不会从持久化恢复 3D", () => {
    expect(canvasSource).toContain('type CanvasAssistantModelTab = "image" | "text";');
    expect(canvasSource).toMatch(/const \[assistantModelPanelCategory, setAssistantModelPanelCategory\] =\s*useState<[^>]+>\(assistantModelTab\);/);
    const writes = [...canvasSource.matchAll(/setAssistantModelPanelCategory\(([^)]*)\)/g)].map(match => match[1]);
    expect(writes.sort()).toEqual(['"text"', "assistantModelTab", "cat"].sort());
  });

  it("保留其他位置的独立 3D 入口和唯一生成链路", () => {
    const start = canvasSource.indexOf("onSubmit={({ prompt, model }) => {");
    expect(start, "找不到独立 3D 面板回调").toBeGreaterThan(-1);
    const callback = canvasSource.slice(start, start + 1600);
    expect(callback).toContain("runCanvasThreeDGeneration({");
    expect(callback).toMatch(/model,/);
    expect(canvasSource).toContain("enable3D={THREED_GENERATION_ON}");
  });

  it("公共组件仍支持其他入口的 3D 型号和积分提示，不做全局删除", () => {
    expect(selectorSource).toContain("THREED_AI_MODEL_OPTIONS.find(m => m.id === model)");
    expect(selectorSource).toContain("getAiThreeDModelCreditPolicy(model.id)");
    expect(selectorSource).toMatch(/is3D && threeDCredit/);
    expect(selectorSource).toContain("积分/次");
  });
});
