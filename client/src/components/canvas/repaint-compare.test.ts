import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPAINT_COMPARE_POSITION,
  buildBeforeLayerClipPath,
  clampComparePosition,
  comparePositionFromPointer,
  isLocalRepaintPayload,
  resolveRepaintCompareBeforeSrc,
} from "./repaint-compare";

describe("A|B 对比滑杆：哪些出图算局部重绘", () => {
  it("注释修改 / 橡皮擦 / 文案编辑三种局部修改都打标", () => {
    expect(isLocalRepaintPayload({ style: "注释修改结果" })).toBe(true);
    expect(isLocalRepaintPayload({ style: "橡皮工具结果" })).toBe(true);
    expect(isLocalRepaintPayload({ style: "文案编辑结果" })).toBe(true);
  });

  it("框选局部重绘多张时 style 是 Skill 名，靠显式 localRepaint / 任务字段识别", () => {
    expect(isLocalRepaintPayload({ style: "海报精修", localRepaint: true })).toBe(true);
    expect(
      isLocalRepaintPayload({
        style: "快捷编辑结果",
        backgroundTaskInput: { operation: "annotation_edit", regionSelectEdit: true },
      })
    ).toBe(true);
    expect(
      isLocalRepaintPayload({ style: "x", backgroundTaskInput: { operation: "erase" } })
    ).toBe(true);
  });

  it("整图变换（HD / 去背景 / 整图快捷编辑 / 文生图）不打标", () => {
    for (const style of ["HD 高清结果", "去背景结果", "矢量化结果", "视角调整结果", "首页创作"]) {
      expect(isLocalRepaintPayload({ style })).toBe(false);
    }
    expect(
      isLocalRepaintPayload({ style: "快捷编辑结果", backgroundTaskInput: { operation: "edit" } })
    ).toBe(false);
    expect(isLocalRepaintPayload(undefined)).toBe(false);
  });

  it("就地重绘不打标（前图走撤销快照，撤销后滑杆必须消失）", () => {
    expect(
      isLocalRepaintPayload({ style: "注释修改结果", inPlaceRepaintNodeId: "n1", localRepaint: true })
    ).toBe(false);
  });
});

describe("A|B 对比滑杆：重绘前那张图从哪来", () => {
  it("就地重绘：快照有效时取快照里的前图", () => {
    expect(
      resolveRepaintCompareBeforeSrc({
        localSrc: "after.png",
        inPlaceRepaintUndo: { localSrc: "before.png", repaintedLocalSrc: "after.png" },
      })
    ).toBe("before.png");
  });

  it("就地重绘：原节点是内置素材（快照前图为空）时回落素材图", () => {
    expect(
      resolveRepaintCompareBeforeSrc(
        { localSrc: "after.png", inPlaceRepaintUndo: { repaintedLocalSrc: "after.png" } },
        "/assets/builtin.png"
      )
    ).toBe("/assets/builtin.png");
  });

  it("就地重绘：撤销后 / 又换了图（快照过期）→ 无对比", () => {
    expect(resolveRepaintCompareBeforeSrc({ localSrc: "before.png" })).toBeNull();
    expect(
      resolveRepaintCompareBeforeSrc({
        localSrc: "later.png",
        inPlaceRepaintUndo: { localSrc: "before.png", repaintedLocalSrc: "after.png" },
      })
    ).toBeNull();
  });

  it("新节点局部重绘：取 generationSourceImageSrc", () => {
    expect(
      resolveRepaintCompareBeforeSrc({
        localSrc: "after.png",
        localRepaintResult: true,
        generationSourceImageSrc: "source.png",
      })
    ).toBe("source.png");
  });

  it("未打标的普通生成图，即便有 generationSourceImageSrc 也不给对比", () => {
    expect(
      resolveRepaintCompareBeforeSrc({ localSrc: "hd.png", generationSourceImageSrc: "source.png" })
    ).toBeNull();
  });

  it("前后是同一张图时不给假对比", () => {
    expect(
      resolveRepaintCompareBeforeSrc({
        localSrc: "same.png",
        localRepaintResult: true,
        generationSourceImageSrc: "same.png",
      })
    ).toBeNull();
  });
});

describe("A|B 对比滑杆：位置", () => {
  it("默认在正中间", () => {
    expect(DEFAULT_REPAINT_COMPARE_POSITION).toBe(50);
    expect(buildBeforeLayerClipPath(DEFAULT_REPAINT_COMPARE_POSITION)).toBe("inset(0 50% 0 0)");
  });

  it("按屏幕矩形换算（画布缩放下仍跟手），越界夹紧", () => {
    const rect = { left: 100, width: 200 };
    expect(comparePositionFromPointer(150, rect)).toBe(25);
    expect(comparePositionFromPointer(0, rect)).toBe(0);
    expect(comparePositionFromPointer(999, rect)).toBe(100);
    expect(comparePositionFromPointer(150, { left: 0, width: 0 })).toBe(50);
    expect(clampComparePosition(Number.NaN)).toBe(50);
  });

  it("clip-path 只露出滑杆左侧", () => {
    expect(buildBeforeLayerClipPath(0)).toBe("inset(0 100% 0 0)");
    expect(buildBeforeLayerClipPath(100)).toBe("inset(0 0% 0 0)");
  });
});
