import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isModel3DGenerating, MODEL3D_GENERATING_TEXT_ZH } from "./model3d-container";

describe("3D 容器「生成中」状态（2026-11-16）", () => {
  const now = 1_000_000_000_000;
  it("有任务 id 且未超时 = 生成中", () => {
    expect(isModel3DGenerating({ generatingTaskId: "t1", generatingSince: now - 1000 }, now)).toBe(true);
  });
  it("无任务 id / 无开始时间 / 超过 10 分钟 = 不算生成中（刷新后轮询已断，不能永远转圈）", () => {
    expect(isModel3DGenerating({ generatingSince: now }, now)).toBe(false);
    expect(isModel3DGenerating({ generatingTaskId: "t1" }, now)).toBe(false);
    expect(isModel3DGenerating({ generatingTaskId: "t1", generatingSince: now - 11 * 60 * 1000 }, now)).toBe(false);
    expect(isModel3DGenerating(undefined, now)).toBe(false);
  });
  it("提示文案与用户要求逐字一致，并在节点里渲染", () => {
    expect(MODEL3D_GENERATING_TEXT_ZH).toBe("正在生成3d模型。请稍后");
    const node = readFileSync(resolve(__dirname, "Model3DNode.tsx"), "utf8");
    expect(node).toMatch(/generating && \(\s*<Overlay>/);
    expect(node).toContain("{MODEL3D_GENERATING_TEXT_ZH}");
    // 生成中不能同时显示「把模型拖到这里」的空态
    expect(node).toContain("uploadingCount === 0 && !generating");
  });
});
