import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角 composer 模型下拉「3D 分类」回归锁（2026-11-15 建，2026-11-18 适配重构）。
 *
 * 用户口径：这个选择器里缺 3D 模型分类，要把分类加载进去。
 * 3D 在正式环境已下架（THREED_GENERATION_ON=false），但本地开发仍保留 —— 本锁守的是
 * 「本地 3D 链路完整」，不是让 3D 回到正式环境。
 *
 * ⚠️ 为什么不能顺手把 3D 并进 assistantModelTab：
 *    那个值一路传到 AI 意图判断、一键同款计费护栏和 modelTab 持久化，
 *    扩成三值会同时改到扣费路径。3D 模型单价 300~500 积分/次，
 *    把它当 3D 生成默认模型更是悄悄改用户每次的花费。
 *    ✅ 3D 只作**展示层分类**，业务页签保持「生图 / 对话」两值。
 *
 * 2026-11-18 重构：浮层 UI 从 InfiniteCanvas 内联 JSX 抽成 ModelSelector.tsx
 * 里的公共组件 AssistantModelPopover。3D 的 tab 配置和选中回调留在调用方
 * （InfiniteCanvas），3D 角标渲染挪进公共组件。断言随之指向新位置，守护意图不变。
 */
const canvasSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");
const selectorSource = readFileSync(resolve(__dirname, "ModelSelector.tsx"), "utf8");

/** 切出传给公共浮层的 tabs 配置块。 */
function readTabsBlock() {
  const start = canvasSource.indexOf("tabs={[");
  expect(start, "找不到浮层 tabs 配置，样本无效").toBeGreaterThan(-1);
  const block = canvasSource.slice(start, start + 700);
  expect(block.length, "tabs 区块切得太短，样本无效").toBeGreaterThan(100);
  return block;
}
const tabsBlock = readTabsBlock();

describe("右下角 composer 模型下拉 3D 分类", () => {
  it("tab 行含三个分类，3D 可见性由 THREED_GENERATION_ON 控制，数据源与共享 ModelSelector 同源", () => {
    expect(tabsBlock).toContain('id: "image"');
    expect(tabsBlock).toContain("生图");
    expect(tabsBlock).toContain('id: "text"');
    expect(tabsBlock).toContain("对话");
    expect(tabsBlock).toContain('id: "3d"');
    expect(tabsBlock).toContain("3D");
    expect(tabsBlock).toContain("THREED_GENERATION_ON");
    expect(tabsBlock).toContain("THREED_AI_MODEL_OPTIONS.length > 0");
    // 不许另抄一份 3D 模型清单：import 必须来自唯一事实源
    const importBlock = canvasSource.slice(
      canvasSource.indexOf("from \"@/lib/workspace-data\"") - 420,
      canvasSource.indexOf("from \"@/lib/workspace-data\"")
    );
    expect(importBlock).toContain("THREED_AI_MODEL_OPTIONS");
  });

  it("3D 分类下展示 3D 模型，选中写独立 state", () => {
    const start = canvasSource.indexOf("const assistant3DModel =");
    expect(start, "找不到 3D 当前模型定义").toBeGreaterThan(-1);
    const optionsDef = canvasSource.slice(start, start + 720);
    expect(optionsDef).toContain('assistantModelPanelCategory === "3d"');
    expect(optionsDef).toContain("THREED_AI_MODEL_OPTIONS");
    // 选中 3D 模型写 independent state（回调在调用方）
    const onSelectStart = canvasSource.indexOf("onSelectModel={model => {", tabsBlockStart());
    expect(onSelectStart, "找不到 onSelectModel 回调").toBeGreaterThan(-1);
    const onSelect = canvasSource.slice(onSelectStart, onSelectStart + 500);
    expect(onSelect).toContain('assistantModelPanelCategory === "3d"');
    expect(onSelect).toContain("setAssistant3DModelId(model.id)");
  });

  it("3D 分类下的列表必须来自 3D 注册表，不能悄悄换回图片模型", () => {
    /*
     * ⚠️ 这条必须精确切到 assistantModelOptions 本身：只断言
     *    「源码里出现过 THREED_AI_MODEL_OPTIONS」会命中旁边
     *    assistant3DModel 的定义，把 3D 分支换成图片模型照样全绿
     *    （变异测试实测抓不到，是覆盖缺口不是等价变异）。
     */
    const start = canvasSource.indexOf("const assistantModelOptions =");
    expect(start, "找不到模型列表定义锚点").toBeGreaterThan(-1);
    const def = canvasSource.slice(start, start + 420);
    expect(def).toContain('assistantModelPanelCategory === "3d"');
    expect(def).toMatch(
      /assistantModelPanelCategory === "3d"\s*\?\s*THREED_AI_MODEL_OPTIONS/
    );
    expect(def).not.toMatch(
      /assistantModelPanelCategory === "3d"\s*\?\s*availableAssistant/
    );
  });

  it("3D 只是展示分类，不得混进业务页签（守护 AI 路由与计费）", () => {
    expect(canvasSource).toContain(
      'type CanvasAssistantModelTab = "image" | "text";'
    );
    // 反向：点 3D 分类不许改业务页签
    const popoverStart = canvasSource.indexOf("<AssistantModelPopover");
    expect(popoverStart, "找不到公共浮层调用").toBeGreaterThan(-1);
    const popoverBlock = canvasSource.slice(popoverStart, popoverStart + 2200);
    expect(popoverBlock).not.toContain('setAssistantModelTab("3d")');
    // 正向：只有非 3D 分类才同步业务页签（在 onCategoryChange 回调里）
    expect(popoverBlock).toContain('if (cat !== "3d") setAssistantModelTab(cat);');
  });

  it("3D 模型偏好按账号持久化", () => {
    expect(canvasSource).toContain('"artx:canvas-assistant-3d-model"');
    expect(canvasSource).toMatch(
      /writeOwnedPreference\(\s*CANVAS_ASSISTANT_3D_MODEL_STORAGE_KEY,\s*assistant3DModelId\s*\)/
    );
  });

  it("面板高度估算跟着展示分类走，切到 3D 不会沿用生图的行数", () => {
    const start = canvasSource.indexOf("const modelOptionCount =");
    expect(start, "找不到高度估算定义").toBeGreaterThan(-1);
    const def = canvasSource.slice(start, start + 340);
    expect(def).toContain('assistantModelPanelCategory === "3d"');
    expect(def).toContain("THREED_AI_MODEL_OPTIONS.length");
    expect(canvasSource).toMatch(
      /assistantImageModelOptions\.length,\s*assistantModelPanelCategory,\s*assistantModelTab/
    );
  });

  it("3D 积分/次角标渲染收口在公共浮层组件（唯一实现）", () => {
    // 3D 角标从内联挪进公共组件后，必须仍由 getAiThreeDModelCreditPolicy 驱动，
    // 且只在 activeCategory==="3d" 时显示 —— 否则用户看不到 3D 单价就可能被扣费。
    expect(selectorSource).toContain("getAiThreeDModelCreditPolicy(model.id)");
    expect(selectorSource).toMatch(
      /is3D && threeDCredit/
    );
    expect(selectorSource).toContain("积分/次");
  });
});

/** 定位到公共浮层 tabs 配置之前的 onSelectModel 回调起点。 */
function tabsBlockStart(): number {
  const tabs = canvasSource.indexOf("tabs={[");
  return tabs > 700 ? tabs - 700 : 0;
}
