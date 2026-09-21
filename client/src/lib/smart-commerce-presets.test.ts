import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SMART_COMMERCE_DEFAULT_PAYLOAD,
  createSmartCommercePresetId,
  nextSmartCommercePresetName,
  readActiveSmartCommercePresetId,
  readSmartCommercePresets,
  writeActiveSmartCommercePresetId,
  writeSmartCommercePresets,
  type SmartCommercePreset,
} from "./smart-commerce-presets";

/** 最小可用的 localStorage 替身，行为与浏览器一致（含 key 不存在返回 null）。 */
function installStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("window", { localStorage: storage } as unknown as Window);
  return { map, storage };
}

function makePreset(overrides: Partial<SmartCommercePreset> = {}): SmartCommercePreset {
  return {
    id: "p1",
    name: "预设 1",
    payload: { ...SMART_COMMERCE_DEFAULT_PAYLOAD },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("smart-commerce-presets", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  /*
    ⚠️⚠️ 本文件最重要的一条。
    需求原文：「这个参数的变化绑定用户账号」。
    如果 storage key 不含 userId，同一台电脑换账号会直接读到上一个人的预设，
    而且不会报任何错 —— 用户只会觉得「我的预设怎么变成别人的了」。
  */
  it("isolates presets per account", () => {
    installStorage();
    writeSmartCommercePresets("user-a", [makePreset({ id: "a1", name: "A 的预设" })]);
    writeSmartCommercePresets("user-b", [makePreset({ id: "b1", name: "B 的预设" })]);

    expect(readSmartCommercePresets("user-a").map(item => item.name)).toEqual(["A 的预设"]);
    expect(readSmartCommercePresets("user-b").map(item => item.name)).toEqual(["B 的预设"]);
    // 第三个账号读到的必须是空，而不是任何一方的数据
    expect(readSmartCommercePresets("user-c")).toEqual([]);
  });

  it("falls back to a guest slot instead of refusing to store", () => {
    installStorage();
    // 未登录（null）也要能存：用户很可能先调参数再登录
    writeSmartCommercePresets(null, [makePreset({ name: "游客预设" })]);
    expect(readSmartCommercePresets(null).map(item => item.name)).toEqual(["游客预设"]);
    expect(readSmartCommercePresets(undefined).map(item => item.name)).toEqual(["游客预设"]);
    // 但游客位与真实账号必须互不污染
    expect(readSmartCommercePresets("user-a")).toEqual([]);
  });

  /*
    ⚠️ 老版本写入的数据会缺字段。不逐字段兜底的话，payload.count 会是 undefined，
       回填时生成数量按钮会**一个都不高亮**——界面看着正常，只是没选中项。
  */
  it("normalizes legacy payloads field by field", () => {
    const { map } = installStorage();
    map.set(
      "artx:smart-commerce-presets:user-a",
      JSON.stringify([{ id: "old", name: "老预设", payload: { ratio: "4:5" } }])
    );
    const [preset] = readSmartCommercePresets("user-a");
    expect(preset.payload.ratio).toBe("4:5");
    expect(preset.payload.count).toBe(SMART_COMMERCE_DEFAULT_PAYLOAD.count);
    expect(preset.payload.backgroundMode).toBe("template");
    expect(preset.payload.customPrompt).toBe("");
    expect(preset.payload.ecommerceId).toBeNull();
    expect(preset.payload.picwishTemplate).toBeNull();
  });

  it("clamps count into the 1-9 range the UI actually renders", () => {
    const { map } = installStorage();
    map.set(
      "artx:smart-commerce-presets:u",
      JSON.stringify([
        { id: "a", name: "a", payload: { count: 99 } },
        { id: "b", name: "b", payload: { count: 0 } },
      ])
    );
    const [big, small] = readSmartCommercePresets("u");
    expect(big.payload.count).toBe(9);
    expect(small.payload.count).toBe(1);
  });

  it("never throws on corrupted json", () => {
    const { map } = installStorage();
    map.set("artx:smart-commerce-presets:u", "{ not json");
    // 整个电商面板会因为一次 throw 直接白屏，所以这里必须吞掉
    expect(() => readSmartCommercePresets("u")).not.toThrow();
    expect(readSmartCommercePresets("u")).toEqual([]);
  });

  /*
    ⚠️ 「回到初始态」传 null 时必须 removeItem，不能写入 "null" 字符串。
       写字符串的话下次读出来是 truthy 的 "null"，去找 id="null" 的预设找不到，
       静默不套用 —— 现象是「点了回到初始态，下次进来还是老样子」。
  */
  it("clears the active pointer instead of storing the string null", () => {
    installStorage();
    writeActiveSmartCommercePresetId("u", "p1");
    expect(readActiveSmartCommercePresetId("u")).toBe("p1");
    writeActiveSmartCommercePresetId("u", null);
    expect(readActiveSmartCommercePresetId("u")).toBeNull();
  });

  /*
    ⚠️ 默认名不能用 `预设 ${length + 1}`：删掉中间一份后长度回退，
       新名字会与已有的撞上，菜单里两条同名完全无法区分。
  */
  it("avoids duplicate default names after a middle deletion", () => {
    const list = [
      makePreset({ id: "1", name: "预设 1" }),
      makePreset({ id: "3", name: "预设 3" }),
    ];
    expect(nextSmartCommercePresetName(list)).toBe("预设 2");
    expect(nextSmartCommercePresetName([...list, makePreset({ id: "2", name: "预设 2" })])).toBe(
      "预设 4"
    );
  });

  it("generates unique preset ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createSmartCommercePresetId()));
    expect(ids.size).toBe(200);
  });

  it("reports write failure so the caller can warn the user", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      },
    } as unknown as Window);
    // 返回 false 而不是静默成功：静默成功会让用户以为存上了，下次进来却是空的
    expect(writeSmartCommercePresets("u", [makePreset()])).toBe(false);
  });
});
