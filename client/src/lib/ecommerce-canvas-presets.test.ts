/**
 * 电商画布参数预设 —— 存储 + 合并规则测试（2026-10-18）
 *
 * 锁死两件事：
 *   1. 「分辨率/画幅比：预设为首选，用户一旦手选，以用户为准」
 *   2. 存储与智能产品预设同口径：账号隔离、逐字段兜底、回到初始态 removeItem
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ECOMMERCE_CANVAS_DEFAULT_PAYLOAD,
  ECOMMERCE_CANVAS_PRESET_LIMIT,
  mergeEcommerceCanvasPreset,
  nextEcommerceCanvasPresetName,
  readActiveEcommerceCanvasPresetId,
  readEcommerceCanvasPresets,
  writeActiveEcommerceCanvasPresetId,
  writeEcommerceCanvasPresets,
  type EcommerceCanvasPresetPayload,
} from "./ecommerce-canvas-presets";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  (globalThis as any).window = { localStorage: memoryStorage() };
});

const preset: EcommerceCanvasPresetPayload = {
  ...ECOMMERCE_CANVAS_DEFAULT_PAYLOAD,
  productTier: "4k",
  postRatio: "9:16",
  productCount: 5,
  postCount: 8,
  sellingPoints: "预设卖点",
};

const baseDraft = () => ({
  ...ECOMMERCE_CANVAS_DEFAULT_PAYLOAD,
  bgTemplate: undefined as unknown,
  uploads: ["data:image/png;base64,AAA"],
});

describe("mergeEcommerceCanvasPreset — 分辨率/画幅比优先级", () => {
  it("1. 用户没手选过 → 分辨率与画幅比以预设为准", () => {
    const merged = mergeEcommerceCanvasPreset(baseDraft(), preset);
    expect(merged.productTier).toBe("4k");
    expect(merged.postRatio).toBe("9:16");
  });

  it("2. 用户手选过分辨率 → 预设不覆盖分辨率，但其他字段照常套用", () => {
    const draft = { ...baseDraft(), productTier: "2k" as const, userModifiedProductTier: true };
    const merged = mergeEcommerceCanvasPreset(draft, preset);
    expect(merged.productTier).toBe("2k");
    expect(merged.postRatio).toBe("9:16");
    expect(merged.productCount).toBe(5);
    expect(merged.sellingPoints).toBe("预设卖点");
  });

  it("3. 用户手选过画幅比 → 预设不覆盖画幅比", () => {
    const draft = { ...baseDraft(), postRatio: "1:1", userModifiedPostRatio: true };
    const merged = mergeEcommerceCanvasPreset(draft, preset);
    expect(merged.postRatio).toBe("1:1");
    expect(merged.productTier).toBe("4k");
  });

  it("4. 连续套用两次预设，用户的手选仍然保留（标记不被清空）", () => {
    const draft = { ...baseDraft(), productTier: "2k" as const, userModifiedProductTier: true };
    const once = mergeEcommerceCanvasPreset(draft, preset);
    const twice = mergeEcommerceCanvasPreset(once, { ...preset, productTier: "1k" });
    expect(twice.productTier).toBe("2k");
    expect(twice.userModifiedProductTier).toBe(true);
  });

  it("5. 回到初始态（force）→ 用户手选也被重置，标记清空", () => {
    const draft = {
      ...baseDraft(),
      productTier: "2k" as const,
      postRatio: "1:1",
      userModifiedProductTier: true,
      userModifiedPostRatio: true,
    };
    const merged = mergeEcommerceCanvasPreset(draft, ECOMMERCE_CANVAS_DEFAULT_PAYLOAD, { force: true });
    expect(merged.productTier).toBe("1k");
    expect(merged.postRatio).toBe("3:4");
    expect(merged.userModifiedProductTier).toBe(false);
    expect(merged.userModifiedPostRatio).toBe(false);
  });

  it("6. 套用预设不会清掉已上传的商品图", () => {
    const merged = mergeEcommerceCanvasPreset(baseDraft(), preset);
    expect(merged.uploads).toEqual(["data:image/png;base64,AAA"]);
  });
});

describe("预设存储 — 与智能产品同口径", () => {
  it("7. 账号隔离：A 账号存的预设，B 账号读不到", () => {
    writeEcommerceCanvasPresets("user-a", [
      { id: "p1", name: "预设 1", payload: preset, createdAt: 1, updatedAt: 1 },
    ]);
    expect(readEcommerceCanvasPresets("user-a")).toHaveLength(1);
    expect(readEcommerceCanvasPresets("user-b")).toHaveLength(0);
  });

  it("8. 老版本缺字段的预设读出来逐字段兜底，不会出现 undefined", () => {
    (globalThis as any).window.localStorage.setItem(
      "artx:ecommerce-canvas-presets:user-a",
      JSON.stringify([{ id: "old", name: "旧", payload: { productTier: "8k", postCount: 99 } }]),
    );
    const [item] = readEcommerceCanvasPresets("user-a");
    expect(item.payload.productTier).toBe("1k");
    expect(item.payload.postCount).toBe(9);
    expect(item.payload.withCopy).toBe(ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.withCopy);
    expect(item.payload.postRatio).toBe("3:4");
  });

  it("9. 清除激活预设用 removeItem，而不是写入字符串 \"null\"", () => {
    writeActiveEcommerceCanvasPresetId("user-a", "p1");
    expect(readActiveEcommerceCanvasPresetId("user-a")).toBe("p1");
    writeActiveEcommerceCanvasPresetId("user-a", null);
    expect(readActiveEcommerceCanvasPresetId("user-a")).toBeNull();
  });

  it("10. 默认命名删掉中间一份后不撞名", () => {
    const list = [
      { id: "a", name: "预设 1", payload: preset, createdAt: 1, updatedAt: 1 },
      { id: "c", name: "预设 3", payload: preset, createdAt: 1, updatedAt: 1 },
    ];
    expect(nextEcommerceCanvasPresetName(list)).toBe("预设 2");
    expect(ECOMMERCE_CANVAS_PRESET_LIMIT).toBe(10);
  });
});

describe("出厂默认值与页面 createDefaultDraft 逐字段一致", () => {
  it("11. 回到初始态得到的就是第一次打开页面的样子", () => {
    const page = readFileSync(
      new URL("../pages/EcommerceCanvasPage.tsx", import.meta.url),
      "utf-8",
    );
    const block = page.match(/function createDefaultDraft\(\)[\s\S]*?\n\}/)?.[0] || "";
    expect(block).toContain(`postRatio: "${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.postRatio}"`);
    expect(block).toContain(`productRatio: "${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productRatio}"`);
    expect(block).toContain(`productTier: "${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productTier}"`);
    expect(block).toContain(`postCount: ${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.postCount}`);
    expect(block).toContain(`productCount: ${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productCount}`);
    expect(block).toContain(`withCopy: ${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.withCopy}`);
    expect(block).toContain(`noTextOnImage: ${ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.noTextOnImage}`);
  });

  it("12. 两个手选入口都打了「用户改过」标记", () => {
    const ws = readFileSync(
      new URL("../components/ecommerce/EcommerceWorkspace.tsx", import.meta.url),
      "utf-8",
    );
    expect(ws).toContain("updateDraft({ productTier: t, userModifiedProductTier: true })");
    expect(ws).toContain("updateDraft({ postRatio, userModifiedPostRatio: true })");
  });
});
