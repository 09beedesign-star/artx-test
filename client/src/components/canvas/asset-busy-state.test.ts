import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getAssetBusyState } from "./asset-busy-state";

describe("getAssetBusyState 判定", () => {
  it("空数据 / 空闲 → 不忙", () => {
    expect(getAssetBusyState(undefined).busy).toBe(false);
    expect(getAssetBusyState({}).busy).toBe(false);
  });

  it("就地局部重绘中 → 忙，文案点明「局部重绘」", () => {
    const s = getAssetBusyState({ isGeneratingImage: true, inPlaceRepainting: true });
    expect(s.busy).toBe(true);
    expect(s.title).toBe("图片正在局部重绘中");
    expect(s.description).toContain("完成后才能继续生成");
  });

  it("普通生成 / 擦除 / 抠图中 → 忙", () => {
    expect(getAssetBusyState({ isGeneratingImage: true }).busy).toBe(true);
    expect(getAssetBusyState({ isErasingImage: true }).busy).toBe(true);
    expect(getAssetBusyState({ isRemovingBackground: true }).busy).toBe(true);
  });

  it("失败态不算忙 —— 否则失败后按钮永久灰掉，用户无法重试", () => {
    expect(
      getAssetBusyState({ isGeneratingImage: false, isGenerationFailed: true }).busy
    ).toBe(false);
  });

  it("inPlaceRepainting 残留但已不在生成 → 不忙", () => {
    expect(getAssetBusyState({ inPlaceRepainting: true }).busy).toBe(false);
  });
});

describe("接线：面板与提交链路共用同一判定", () => {
  const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
  const between = (a: string, b: string) => {
    const i = source.indexOf(a);
    const j = source.indexOf(b, i + a.length);
    return i >= 0 && j > i ? source.slice(i, j) : "";
  };

  it("发送按钮可用态必须把 busy 算进去（按钮与回车同一条件）", () => {
    const bar = between("function AssetEditPromptBar(", "// ── Zoom Control Bar");
    expect(bar.length).toBeGreaterThan(1000);
    expect(bar).toContain("const canSendPrompt = hasPromptContent && !isTargetBusy;");
    expect(bar).toContain("if (isTargetBusy) {");
    expect(bar).toContain("disabled={!canSendPrompt}");
    expect(bar).toContain("data-artx-asset-busy-banner");
  });

  it("两个面板入口都传入实时 busyState", () => {
    const count = source.split("busyState={getAssetBusyState(").length - 1;
    expect(count).toBe(2);
  });

  it("提交链路有兜底闸门 + 同步进行中锁，且在 finally 释放", () => {
    const submit = between(
      "const handleAssetEditSubmit = useCallback(",
      "const handleNodeComposerSubmit = useCallback("
    );
    expect(submit).toContain("getAssetBusyState(sourceNode.data)");
    expect(submit).toContain("assetEditInFlightRef.current.has(target.nodeId)");
    expect(submit).toContain("assetEditInFlightRef.current.add(target.nodeId)");
    expect(submit).toMatch(/finally \{\s*releaseInFlight\(\);/);
    // 蒙版失败早退也必须释放，否则这张图永久锁死
    expect(submit).toMatch(/notifyAiFailure\(\s*"局部重绘失败"[\s\S]*?releaseInFlight\(\);\s*return;/);
  });
});
