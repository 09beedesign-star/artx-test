import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPreferredImageModelId,
  writePreferredImageModelId,
} from "./assistant-model-preference";
import {
  AUTO_AI_MODEL,
  DEFAULT_IMAGE_AI_MODEL_ID,
  IMAGE_AI_MODELS,
} from "./workspace-data";

/**
 * 出图模型偏好存储的防护测试。
 *
 * 【这组测试真正要守住的事故】
 * 画布这套存储不是「一个 key 存一个模型 id」：
 *   - 图片模型 key 只存**具体模型**，校验用 IMAGE_AI_MODELS，而它**不含 auto**；
 *   - 「当前是不是 auto」由另一个独立开关 key 表达，"0" 才算关闭。
 *
 * 首页若天真地把 "auto" 写进图片模型 key，画布读取时会因为
 * IMAGE_AI_MODELS.some() 判非法而**静默回落成默认模型**：
 * 用户在首页选了 auto，进画布一看变成 image2.5，全程零报错。
 *
 * 所以这里的核心断言是「auto 走开关、不污染模型 key」。
 */

const IMAGE_MODEL_STORAGE_KEY = "artx:canvas-assistant-image-model";
const AUTO_MODE_STORAGE_KEY = "artx:canvas-assistant-auto-mode";
const LEGACY_MODEL_STORAGE_KEY = "artx:canvas-assistant-model";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 找一个真实存在的具体图片模型，避免测试写死某个会下线的 id。 */
const concreteModelId = IMAGE_AI_MODELS[0]!.id;

describe("auto 的存储语义", () => {
  it("IMAGE_AI_MODELS 不含 auto（本组测试成立的前提）", () => {
    /**
     * 这条是「前提锁」。若哪天有人把 auto 塞进 IMAGE_AI_MODELS，
     * 下面所有断言会因为前提变了而变得没有意义 —— 但它们仍可能通过。
     * 先把前提本身钉死。
     */
    expect(IMAGE_AI_MODELS.some(model => model.id === AUTO_AI_MODEL.id)).toBe(false);
  });

  it("⚠️ 选 auto 时不得把 \"auto\" 写进图片模型 key", () => {
    writePreferredImageModelId(concreteModelId);
    writePreferredImageModelId(AUTO_AI_MODEL.id);

    // 这是本文件最核心的一条：一旦有人图省事写成
    // localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, "auto")，
    // 画布读的时候会静默回落成默认模型。
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).not.toBe(AUTO_AI_MODEL.id);
    // 正向锚点：上一次选的具体模型必须原样留着。
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
    expect(storage.get(AUTO_MODE_STORAGE_KEY)).toBe("1");
  });

  it("auto ↔ 具体模型来回切换，具体模型不丢", () => {
    writePreferredImageModelId(concreteModelId);
    expect(readPreferredImageModelId()).toBe(concreteModelId);

    writePreferredImageModelId(AUTO_AI_MODEL.id);
    expect(readPreferredImageModelId()).toBe(AUTO_AI_MODEL.id);

    // 切回来时不该要求用户重新选一遍 —— 上次的选择还在。
    writePreferredImageModelId(concreteModelId);
    expect(readPreferredImageModelId()).toBe(concreteModelId);
  });

  it("全新用户（存储为空）默认是 auto", () => {
    /**
     * 这条守的是「零行为变化迁移」：接入选择器之前，首页是硬编码 model:"auto"。
     * 如果默认值变成某个具体模型，等于给所有老用户偷偷换了出图模型 ——
     * 会直接改变出图效果和扣费，属于「改默认值」级别的变更。
     */
    expect(readPreferredImageModelId()).toBe(AUTO_AI_MODEL.id);
  });

  it("只有显式写入 \"0\" 才算关闭 auto", () => {
    // 与画布 getStoredCanvasAssistantImageEditModel 的口径严格一致。
    // 写成 !== "1" 或 === "false" 都会让老用户的 auto 状态被误读。
    storage.set(AUTO_MODE_STORAGE_KEY, "");
    expect(readPreferredImageModelId()).toBe(AUTO_AI_MODEL.id);

    storage.set(AUTO_MODE_STORAGE_KEY, "0");
    storage.set(IMAGE_MODEL_STORAGE_KEY, concreteModelId);
    expect(readPreferredImageModelId()).toBe(concreteModelId);
  });
});

describe("非法值与兼容读", () => {
  it("存了非法模型 id 时回落到默认图片模型", () => {
    storage.set(AUTO_MODE_STORAGE_KEY, "0");
    storage.set(IMAGE_MODEL_STORAGE_KEY, "这个模型早就下线了");
    expect(readPreferredImageModelId()).toBe(DEFAULT_IMAGE_AI_MODEL_ID);
  });

  it("写入非法模型 id 时直接忽略，不污染存储", () => {
    writePreferredImageModelId(concreteModelId);
    writePreferredImageModelId("不存在的模型");

    // 反向断言：非法值不能落盘。
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
  });

  it("读得到旧版 key（兼容老用户）", () => {
    // 旧版只有一个 key。老用户升级后不该被重置成默认模型。
    storage.set(AUTO_MODE_STORAGE_KEY, "0");
    storage.set(LEGACY_MODEL_STORAGE_KEY, concreteModelId);
    expect(readPreferredImageModelId()).toBe(concreteModelId);
  });

  it("localStorage 抛错时回到 auto，不把页面打挂", () => {
    // 隐私模式 / 配额耗尽时 localStorage 会抛。
    // 读不到偏好不是致命问题，但抛到渲染层就是白屏。
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("SecurityError");
        },
      },
    });

    expect(() => readPreferredImageModelId()).not.toThrow();
    expect(readPreferredImageModelId()).toBe(AUTO_AI_MODEL.id);
    expect(() => writePreferredImageModelId(concreteModelId)).not.toThrow();
  });
});
