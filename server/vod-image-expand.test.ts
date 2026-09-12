import { describe, expect, it } from "vitest";
import {
  __testClampExpansionToAreaLimit,
  VOD_EXPAND_AREA_MULTIPLIER_MAX,
  VOD_EXPAND_RATIO_MAX,
} from "./tencent-vod-aigc";
import {
  VOD_IMAGE_EXPANSION_MODEL,
  VOD_IMAGE_EXPANSION_PROVIDER,
  VOD_EXPANSION_PROMPT_MAX_LENGTH,
} from "../shared/image-expansion";

const areaOf = (r: { up: number; down: number; left: number; right: number }) =>
  (1 + r.left + r.right) * (1 + r.up + r.down);

describe("VOD Kling 扩图比例约束", () => {
  it("在面积限制内的比例原样透传", () => {
    const r = __testClampExpansionToAreaLimit({ up: 0.2, down: 0.2, left: 0, right: 0 });
    expect(r).toEqual({ up: 0.2, down: 0.2, left: 0, right: 0 });
  });

  it("把负数与非法值归零，而不是抛错", () => {
    // 扩图由用户拖拽触发，脏值应静默收敛，不该把整次请求打挂。
    const r = __testClampExpansionToAreaLimit({
      up: -1,
      down: Number.NaN,
      left: undefined,
      right: 0.5,
    });
    expect(r).toEqual({ up: 0, down: 0, left: 0, right: 0.5 });
  });

  it("单边超过 2 倍时收敛到上限", () => {
    const r = __testClampExpansionToAreaLimit({ up: 5, down: 0, left: 0, right: 0 });
    expect(r.up).toBe(VOD_EXPAND_RATIO_MAX);
  });

  it("面积超过 3 倍时等比缩小，且结果不超上限", () => {
    // 四边各 1.0 → 面积 3×3 = 9 倍，远超 3 倍上限
    const r = __testClampExpansionToAreaLimit({ up: 1, down: 1, left: 1, right: 1 });
    expect(areaOf(r)).toBeLessThanOrEqual(VOD_EXPAND_AREA_MULTIPLIER_MAX + 1e-6);
    // 等比缩小必须保持四边相等
    expect(r.up).toBeCloseTo(r.down, 6);
    expect(r.left).toBeCloseTo(r.right, 6);
    expect(r.up).toBeCloseTo(r.left, 6);
  });

  it("等比缩小保持各方向的相对比例", () => {
    // 只有右边扩，缩小后仍应只有右边扩
    const r = __testClampExpansionToAreaLimit({ up: 0, down: 0, left: 0, right: 2 });
    expect(r.up).toBe(0);
    expect(r.down).toBe(0);
    expect(r.left).toBe(0);
    expect(r.right).toBeGreaterThan(0);
    expect(areaOf(r)).toBeLessThanOrEqual(VOD_EXPAND_AREA_MULTIPLIER_MAX + 1e-6);
  });

  it("非对称比例缩小后相对关系不变", () => {
    const r = __testClampExpansionToAreaLimit({ up: 0.5, down: 1.5, left: 1, right: 2 });
    expect(areaOf(r)).toBeLessThanOrEqual(VOD_EXPAND_AREA_MULTIPLIER_MAX + 1e-6);
    // down 原本是 up 的 3 倍，缩小后应保持
    expect(r.down / r.up).toBeCloseTo(3, 4);
    expect(r.right / r.left).toBeCloseTo(2, 4);
  });
});

describe("Kling 不支持蒙版扩图", () => {
  it("只给 mask 不给方向时，报错必须点明是上游能力差异", async () => {
    // 佐糖能用 mask 推断扩展区域，Kling 只认四向比例。
    // 若这里退化成通用的「请重新框选」，带 mask 的调用方会完全看不出原因。
    const { expandImageWithVodKling } = await import("./image-generation");
    await expect(
      expandImageWithVodKling({
        imageSrc: "data:image/png;base64,iVBORw0KGgo=",
        maskSrc: "data:image/png;base64,iVBORw0KGgo=",
      } as never),
    ).rejects.toThrow(/不支持蒙版驱动扩图/);
  });

  it("既无 mask 也无方向时走通用提示", async () => {
    const { expandImageWithVodKling } = await import("./image-generation");
    await expect(
      expandImageWithVodKling({ imageSrc: "data:image/png;base64,iVBORw0KGgo=" } as never),
    ).rejects.toThrow(/至少一个方向/);
  });
});

describe("扩图供应商标识", () => {
  it("模型串与供应商名是唯一来源，不再散落硬编码", () => {
    expect(VOD_IMAGE_EXPANSION_MODEL).toBe("vod-kling-image-expand");
    expect(VOD_IMAGE_EXPANSION_PROVIDER).toContain("Kling");
  });

  it("Kling 的 prompt 上限远宽于佐糖的 200", () => {
    // 切换到 Kling 的收益之一就是提示词不再被砍到 200 字符。
    // 这条断言锁住：若有人误把上限改回 200，测试立刻红。
    expect(VOD_EXPANSION_PROMPT_MAX_LENGTH).toBe(2500);
    expect(VOD_EXPANSION_PROMPT_MAX_LENGTH).toBeGreaterThan(200);
  });
});
