import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角 composer 模型下拉「3D 分类」回归锁（2026-11-15）。
 *
 * 用户口径：这个选择器里缺 3D 模型分类，要把分类加载进去。
 *
 * ⚠️ 为什么不能顺手把 3D 并进 assistantModelTab：
 *    那个值一路传到 AI 意图判断、一键同款计费护栏和 modelTab 持久化，
 *    扩成三值会同时改到扣费路径。3D 模型单价 300~500 积分/次，
 *    把它当 3D 生成默认模型更是悄悄改用户每次的花费。
 *    ✅ 3D 只作**展示层分类**，业务页签保持「生图 / 对话」两值。
 */
const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");

/** 切出模型下拉面板（从三分类 tab 行到面板结束）。 */
function readPanelBlock() {
  const start = source.indexOf('className="grid grid-cols-3 gap-1 px-1 pb-1"');
  expect(start, "找不到三分类 tab 行，样本无效").toBeGreaterThan(-1);
  const end = source.indexOf("modelLabel={assistantModel.label}", start);
  const block = source.slice(start, end > start ? end : start + 12000);
  expect(block.length, "面板区块切得太短，样本无效").toBeGreaterThan(2000);
  return block;
}
const panel = readPanelBlock();

describe("右下角 composer 模型下拉 3D 分类", () => {
  it("tab 行有三个分类，3D 数据源与共享 ModelSelector 同源", () => {
    expect(panel).toContain("grid grid-cols-3");
    expect(panel).toContain('{ id: "3d" as const, label: "3D" }');
    expect(panel).toContain("THREED_AI_MODEL_OPTIONS.length > 0");
    // 不许另抄一份 3D 模型清单：import 必须来自唯一事实源
    const importBlock = source.slice(
      source.indexOf("from \"@/lib/workspace-data\"") - 420,
      source.indexOf("from \"@/lib/workspace-data\"")
    );
    expect(importBlock).toContain("THREED_AI_MODEL_OPTIONS");
  });

  it("3D 分类下展示 3D 模型，选中写独立 state", () => {
    const start = source.indexOf("const assistant3DModel =");
    expect(start, "找不到 3D 当前模型定义").toBeGreaterThan(-1);
    const optionsDef = source.slice(start, start + 720);
    expect(optionsDef).toContain('assistantModelPanelCategory === "3d"');
    expect(optionsDef).toContain("THREED_AI_MODEL_OPTIONS");
    expect(panel).toContain('if (assistantModelPanelCategory === "3d")');
    expect(panel).toContain("setAssistant3DModelId(model.id)");
  });

  it("3D 分类下的列表必须来自 3D 注册表，不能悄悄换回图片模型", () => {
    /*
     * ⚠️ 这条必须精确切到 assistantModelOptions 本身：只断言
     *    「源码里出现过 THREED_AI_MODEL_OPTIONS」会命中旁边
     *    assistant3DModel 的定义，把 3D 分支换成图片模型照样全绿
     *    （变异测试实测抓不到，是覆盖缺口不是等价变异）。
     */
    const start = source.indexOf("const assistantModelOptions =");
    expect(start, "找不到模型列表定义锚点").toBeGreaterThan(-1);
    const def = source.slice(start, start + 420);
    expect(def).toContain('assistantModelPanelCategory === "3d"');
    expect(def).toMatch(
      /assistantModelPanelCategory === "3d"\s*\?\s*THREED_AI_MODEL_OPTIONS/
    );
    expect(def).not.toMatch(
      /assistantModelPanelCategory === "3d"\s*\?\s*availableAssistant/
    );
  });

  it("3D 只是展示分类，不得混进业务页签（守护 AI 路由与计费）", () => {
    expect(source).toContain(
      'type CanvasAssistantModelTab = "image" | "text";'
    );
    // 反向：点 3D 分类不许改业务页签
    expect(panel).not.toContain('setAssistantModelTab("3d")');
    // 正向：只有非 3D 分类才同步业务页签
    expect(panel).toContain(
      'if (tab.id !== "3d") setAssistantModelTab(tab.id);'
    );
  });

  it("3D 模型偏好按账号持久化", () => {
    expect(source).toContain('"artx:canvas-assistant-3d-model"');
    expect(source).toMatch(
      /writeOwnedPreference\(\s*CANVAS_ASSISTANT_3D_MODEL_STORAGE_KEY,\s*assistant3DModelId\s*\)/
    );
  });

  it("面板高度估算跟着展示分类走，切到 3D 不会沿用生图的行数", () => {
    const start = source.indexOf("const modelOptionCount =");
    expect(start, "找不到高度估算定义").toBeGreaterThan(-1);
    const def = source.slice(start, start + 340);
    expect(def).toContain('assistantModelPanelCategory === "3d"');
    expect(def).toContain("THREED_AI_MODEL_OPTIONS.length");
    expect(source).toMatch(
      /assistantImageModelOptions\.length,\s*assistantModelPanelCategory,\s*assistantModelTab/
    );
  });
});
