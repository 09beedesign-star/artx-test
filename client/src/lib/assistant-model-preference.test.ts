import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPreferredAssistantModelId,
  readPreferredImageModelId,
  writePreferredAssistantModelId,
  writePreferredImageModelId,
} from "./assistant-model-preference";
import {
  AUTO_AI_MODEL,
  DEFAULT_IMAGE_AI_MODEL_ID,
  IMAGE_AI_MODELS,
  TEXT_AI_MODELS,
} from "./workspace-data";
import { AUTH_SESSION_STORAGE_KEY } from "./owner-storage";

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
const MODEL_TAB_STORAGE_KEY = "artx:canvas-assistant-model-tab";
const TEXT_MODEL_STORAGE_KEY = "artx:canvas-assistant-text-model";

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
// 当前生产清单只有一个文本模型；另用落盘断言防止默认回落掩盖写入失效。
const textModelId = TEXT_AI_MODELS[0]!.id;

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

describe("助手级文本、图片与 auto 偏好", () => {
  it("夹具包含真实文本模型，且不与图片及 auto 混淆", () => {
    expect(TEXT_AI_MODELS.length).toBeGreaterThan(0);
    expect(IMAGE_AI_MODELS.some(model => model.id === textModelId)).toBe(false);
    expect(textModelId).not.toBe(AUTO_AI_MODEL.id);
  });

  it("空存储默认 auto，读取不凭空写入偏好", () => {
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
    expect(storage.size).toBe(0);
  });

  it("从空存储选 auto 只写模式与开关，不把 auto 塞入具体模型 key", () => {
    writePreferredAssistantModelId(AUTO_AI_MODEL.id);
    expect(storage).toEqual(new Map([
      [AUTO_MODE_STORAGE_KEY, "1"],
      [MODEL_TAB_STORAGE_KEY, "image"],
    ]));
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
  });

  it("选文本写入文本模式并关闭 auto，不覆盖图片记忆", () => {
    writePreferredImageModelId(concreteModelId);
    writePreferredAssistantModelId(textModelId);
    expect(storage.get(TEXT_MODEL_STORAGE_KEY)).toBe(textModelId);
    expect(storage.get(MODEL_TAB_STORAGE_KEY)).toBe("text");
    expect(storage.get(AUTO_MODE_STORAGE_KEY)).toBe("0");
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
    expect(readPreferredAssistantModelId()).toBe(textModelId);
    // 图片专用 API 的契约不被助手级文本模式改变。
    expect(readPreferredImageModelId()).toBe(concreteModelId);
  });

  it("扩展文本目录时读取真实存储 ID，而不是总返回默认模型", () => {
    // 仅扩展当前测试进程的目录，finally 恢复；不改任何共享源码。
    const extra = { ...TEXT_AI_MODELS[0], id: "test-only-text-model" };
    TEXT_AI_MODELS.push(extra);
    try {
      writePreferredAssistantModelId(extra.id);
      expect(storage.get(TEXT_MODEL_STORAGE_KEY)).toBe(extra.id);
      expect(readPreferredAssistantModelId()).toBe(extra.id);
    } finally {
      TEXT_AI_MODELS.pop();
    }
  });

  it("文本切图片切 auto 再切文本，两种具体模型记忆都保留", () => {
    writePreferredAssistantModelId(textModelId);
    writePreferredAssistantModelId(concreteModelId);
    expect(storage.get(MODEL_TAB_STORAGE_KEY)).toBe("image");
    expect(storage.get(AUTO_MODE_STORAGE_KEY)).toBe("0");
    expect(readPreferredAssistantModelId()).toBe(concreteModelId);

    writePreferredAssistantModelId(AUTO_AI_MODEL.id);
    expect(storage.get(MODEL_TAB_STORAGE_KEY)).toBe("image");
    expect(storage.get(AUTO_MODE_STORAGE_KEY)).toBe("1");
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
    expect(storage.get(TEXT_MODEL_STORAGE_KEY)).toBe(textModelId);
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);

    writePreferredAssistantModelId(textModelId);
    expect(readPreferredAssistantModelId()).toBe(textModelId);
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
  });

  it.each([undefined, "", "1", "false"])("文本标签下 auto 开关 %s 仍优先 auto", autoValue => {
    storage.set(MODEL_TAB_STORAGE_KEY, "text");
    storage.set(TEXT_MODEL_STORAGE_KEY, textModelId);
    if (autoValue !== undefined) storage.set(AUTO_MODE_STORAGE_KEY, autoValue);
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
  });

  it.each([undefined, "已下线的文本模型", concreteModelId])("文本模式的无效记忆 %s 回落默认文本模型", stored => {
    storage.set(MODEL_TAB_STORAGE_KEY, "text");
    storage.set(AUTO_MODE_STORAGE_KEY, "0");
    if (stored !== undefined) storage.set(TEXT_MODEL_STORAGE_KEY, stored);
    expect(readPreferredAssistantModelId()).toBe(TEXT_AI_MODELS[0].id);
  });

  it("图片模式忽略残留文本记忆，兼容旧图片 key", () => {
    storage.set(MODEL_TAB_STORAGE_KEY, "image");
    storage.set(AUTO_MODE_STORAGE_KEY, "0");
    storage.set(TEXT_MODEL_STORAGE_KEY, textModelId);
    storage.set(LEGACY_MODEL_STORAGE_KEY, concreteModelId);
    expect(readPreferredAssistantModelId()).toBe(concreteModelId);
  });

  it.each(["text", "image", "auto"])("%s 模式下写非法 ID 不得污染任何存储或当前选择", mode => {
    writePreferredAssistantModelId(concreteModelId);
    writePreferredAssistantModelId(textModelId);
    if (mode === "image") writePreferredAssistantModelId(concreteModelId);
    if (mode === "auto") writePreferredAssistantModelId(AUTO_AI_MODEL.id);
    const before = new Map(storage);
    const selected = readPreferredAssistantModelId();
    writePreferredAssistantModelId("不存在的模型");
    expect(storage, "非法 ID 必须完全忽略，不能改变模式标签").toEqual(before);
    expect(readPreferredAssistantModelId()).toBe(selected);
  });
});

describe("助手级账号隔离与存储不可用", () => {
  const login = (id: string) => {
    storage.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ user: { id } }));
  };

  it("账号 A 文本、账号 B 图片与 auto 互不串号", () => {
    login("owner-a");
    writePreferredAssistantModelId(concreteModelId);
    writePreferredAssistantModelId(textModelId);
    // 在任何读取/旧 key 认领之前验落盘，避免迁移兜底掩盖未分桶写入。
    for (const key of [TEXT_MODEL_STORAGE_KEY, IMAGE_MODEL_STORAGE_KEY, MODEL_TAB_STORAGE_KEY, AUTO_MODE_STORAGE_KEY]) {
      expect(storage.has(key), `账号写入不得产生匿名 key：${key}`).toBe(false);
      expect(storage.has(`${key}:owner-a`)).toBe(true);
    }
    expect(storage.get(`${TEXT_MODEL_STORAGE_KEY}:owner-a`)).toBe(textModelId);
    login("owner-b");
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
    writePreferredAssistantModelId(concreteModelId);
    expect(readPreferredAssistantModelId()).toBe(concreteModelId);
    writePreferredAssistantModelId(AUTO_AI_MODEL.id);
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
    login("owner-a");
    expect(readPreferredAssistantModelId()).toBe(textModelId);
    expect(storage.get(`${TEXT_MODEL_STORAGE_KEY}:owner-a`)).toBe(textModelId);
    expect(storage.get(`${MODEL_TAB_STORAGE_KEY}:owner-a`)).toBe("text");
    expect(storage.get(`${AUTO_MODE_STORAGE_KEY}:owner-a`)).toBe("0");
    expect(storage.get(`${IMAGE_MODEL_STORAGE_KEY}:owner-b`)).toBe(concreteModelId);
    expect(storage.get(`${AUTO_MODE_STORAGE_KEY}:owner-b`)).toBe("1");
    for (const key of [TEXT_MODEL_STORAGE_KEY, IMAGE_MODEL_STORAGE_KEY, MODEL_TAB_STORAGE_KEY, AUTO_MODE_STORAGE_KEY]) {
      expect(storage.has(key)).toBe(false);
    }
  });

  it("旧匿名文本偏好仅认领给首个账号，不泄漏给后续账号", () => {
    writePreferredAssistantModelId(textModelId);
    login("owner-a");
    expect(readPreferredAssistantModelId()).toBe(textModelId);
    for (const key of [TEXT_MODEL_STORAGE_KEY, MODEL_TAB_STORAGE_KEY, AUTO_MODE_STORAGE_KEY]) {
      expect(storage.has(key)).toBe(false);
      expect(storage.has(`${key}:owner-a`)).toBe(true);
    }
    login("owner-b");
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
    expect(storage.has(`${TEXT_MODEL_STORAGE_KEY}:owner-b`)).toBe(false);
    login("owner-a");
    expect(readPreferredAssistantModelId()).toBe(textModelId);
  });

  it.each(["无 window", "无 localStorage", "访问存储抛错", "存储方法抛错"])("%s 时读回 auto，所有模型写入不抛异常", scenario => {
    if (scenario === "无 window") vi.stubGlobal("window", undefined);
    if (scenario === "无 localStorage") vi.stubGlobal("window", {});
    if (scenario === "访问存储抛错") {
      vi.stubGlobal("window", {
        get localStorage() { throw new Error("SecurityError"); },
      });
    }
    if (scenario === "存储方法抛错") {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () => { throw new Error("SecurityError"); },
          setItem: () => { throw new Error("QuotaExceededError"); },
        },
      });
    }
    expect(() => readPreferredAssistantModelId()).not.toThrow();
    expect(readPreferredAssistantModelId()).toBe(AUTO_AI_MODEL.id);
    for (const id of [textModelId, concreteModelId, AUTO_AI_MODEL.id, "非法模型"]) {
      expect(() => writePreferredAssistantModelId(id)).not.toThrow();
    }
    expect(storage.size).toBe(0);
  });

  it("仅写入配额耗尽时不抛错，也不改变已有文本偏好", () => {
    writePreferredAssistantModelId(textModelId);
    const before = new Map(storage);
    window.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    for (const id of [concreteModelId, AUTO_AI_MODEL.id, textModelId]) {
      expect(() => writePreferredAssistantModelId(id)).not.toThrow();
      expect(storage).toEqual(before);
      expect(readPreferredAssistantModelId()).toBe(textModelId);
    }
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

    // 不只守图片 key：非法值也不能悄悄关闭 auto。
    expect(storage.get(IMAGE_MODEL_STORAGE_KEY)).toBe(concreteModelId);
    writePreferredImageModelId(AUTO_AI_MODEL.id);
    const before = new Map(storage);
    writePreferredImageModelId("不存在的模型");
    expect(storage).toEqual(before);
    expect(readPreferredImageModelId()).toBe(AUTO_AI_MODEL.id);
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
