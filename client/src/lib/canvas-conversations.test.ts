import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncWorkspaceNow } from "./workspace-sync";
import { normalizeWorkspaceSyncPayload } from "../../../shared/workspace-sync";
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  MAX_CANVAS_CONVERSATIONS,
  canvasConversationIndexKey,
  canvasConversationMessagesKey,
  createCanvasConversationId,
  createConversationMeta,
  deriveConversationTitle,
  ensureConversationIndex,
  formatConversationTime,
  isConversationMemoryEnabled,
  parseConversationIndex,
  setConversationMemoryEnabled,
  type CanvasConversationMeta,
  removeConversation,
  searchConversations,
  sortConversations,
  touchConversation,
} from "./canvas-conversations";

function msg(role: string, content: string) {
  return { role, content };
}

describe("存储 key", () => {
  it("索引 key 带项目号，projectId 为空时退回 p1", () => {
    expect(canvasConversationIndexKey("p9")).toBe("artx:canvas-conversations:p9");
    expect(canvasConversationIndexKey("")).toBe("artx:canvas-conversations:p1");
  });

  it("⚠️ 空 conversationId 必须退回老 key（不带会话后缀），否则老用户对话静默丢失", () => {
    expect(canvasConversationMessagesKey("p1", "")).toBe(
      "artx:canvas-assistant-messages:p1"
    );
  });

  it("非空 conversationId 追加后缀", () => {
    expect(canvasConversationMessagesKey("p1", "cabc")).toBe(
      "artx:canvas-assistant-messages:p1:cabc"
    );
  });

  it("新建的会话 id 互不相同", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCanvasConversationId()));
    expect(ids.size).toBe(50);
  });
});

describe("标题推导", () => {
  it("取首条用户消息", () => {
    expect(
      deriveConversationTitle([
        msg("assistant", "你好，请直接告诉我你想生成什么内容"),
        msg("user", "做一张新品海报"),
      ])
    ).toBe("做一张新品海报");
  });

  it("⚠️ 不能取助手种子消息，否则所有会话标题会一模一样", () => {
    const seed = "你好，请直接告诉我你想生成什么内容，我会按你的目标给出可执行方案。";
    expect(deriveConversationTitle([msg("assistant", seed)])).toBe("");
  });

  it("超长截断到 20 字并加省略号", () => {
    const long = "一".repeat(60);
    const title = deriveConversationTitle([msg("user", long)]);
    expect(title).toBe(`${"一".repeat(CONVERSATION_TITLE_MAX_LENGTH)}…`);
  });

  it("恰好 20 字不加省略号", () => {
    const exact = "一".repeat(CONVERSATION_TITLE_MAX_LENGTH);
    expect(deriveConversationTitle([msg("user", exact)])).toBe(exact);
  });

  it("换行与多空格压成单空格", () => {
    expect(deriveConversationTitle([msg("user", "做一张\n\n  海报")])).toBe("做一张 海报");
  });

  it("纯空白的用户消息不算标题", () => {
    expect(deriveConversationTitle([msg("user", "   \n ")])).toBe("");
  });
});

describe("索引解析", () => {
  it("非法输入返回 null", () => {
    expect(parseConversationIndex(null)).toBeNull();
    expect(parseConversationIndex("not json")).toBeNull();
    expect(parseConversationIndex("{}")).toBeNull();
    expect(parseConversationIndex('{"conversations":[]}')).toBeNull();
  });

  it("⚠️ 空串 id 是合法的老会话，必须能被读出来", () => {
    const raw = JSON.stringify({
      activeId: "",
      conversations: [
        { id: "", title: "老对话", createdAt: "", updatedAt: "2026-09-18T00:00:00.000Z", messageCount: 3 },
      ],
    });
    const parsed = parseConversationIndex(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.conversations).toHaveLength(1);
    expect(parsed?.activeId).toBe("");
  });

  it("activeId 指向不存在的会话时退回首条", () => {
    const raw = JSON.stringify({
      activeId: "ghost",
      conversations: [{ id: "c1", title: "", createdAt: "", updatedAt: "2026-09-18T00:00:00.000Z", messageCount: 0 }],
    });
    expect(parseConversationIndex(raw)?.activeId).toBe("c1");
  });
});

describe("排序与上限", () => {
  it("按 updatedAt 倒序", () => {
    const sorted = sortConversations([
      { id: "old", title: "", createdAt: "", updatedAt: "2026-09-01T00:00:00.000Z", messageCount: 0 },
      { id: "new", title: "", createdAt: "", updatedAt: "2026-09-18T00:00:00.000Z", messageCount: 0 },
    ]);
    expect(sorted.map(item => item.id)).toEqual(["new", "old"]);
  });

  it("⚠️ ISO 时间戳必须能正确解析，先 replace 会变 NaN 导致排序随机", () => {
    const sorted = sortConversations([
      { id: "a", title: "", createdAt: "", updatedAt: "2026-09-17T01:52:13.000Z", messageCount: 0 },
      { id: "b", title: "", createdAt: "", updatedAt: "2026-09-17T09:52:13.000Z", messageCount: 0 },
    ]);
    expect(sorted[0].id).toBe("b");
  });

  it("超过上限被截断", () => {
    const many = Array.from({ length: MAX_CANVAS_CONVERSATIONS + 15 }, (_, index) => ({
      id: `c${index}`,
      title: "",
      createdAt: "",
      updatedAt: new Date(Date.now() - index * 1000).toISOString(),
      messageCount: 0,
    }));
    expect(sortConversations(many)).toHaveLength(MAX_CANVAS_CONVERSATIONS);
  });
});

describe("touchConversation", () => {
  it("更新条数并补上标题", () => {
    const base = { activeId: "c1", conversations: [createConversationMeta("c1")] };
    const next = touchConversation(base, "c1", [msg("user", "画只猫")]);
    expect(next.conversations[0].title).toBe("画只猫");
    expect(next.conversations[0].messageCount).toBe(1);
  });

  it("⚠️ 已有标题不被覆盖，否则用户重命名会被下一条消息冲掉", () => {
    const base = {
      activeId: "c1",
      conversations: [{ ...createConversationMeta("c1"), title: "我改的名字" }],
    };
    const next = touchConversation(base, "c1", [msg("user", "完全不同的内容")]);
    expect(next.conversations[0].title).toBe("我改的名字");
  });

  it("索引里没有该会话时自动补一条", () => {
    const base = { activeId: "c1", conversations: [createConversationMeta("c1")] };
    const next = touchConversation(base, "c2", [msg("user", "新的")]);
    expect(next.conversations.some(item => item.id === "c2")).toBe(true);
  });
});

describe("removeConversation", () => {
  it("删非当前会话时 activeId 不变", () => {
    const base = {
      activeId: "c1",
      conversations: [createConversationMeta("c1"), createConversationMeta("c2")],
    };
    expect(removeConversation(base, "c2").index.activeId).toBe("c1");
  });

  it("删当前会话时切到剩下的首条", () => {
    const base = {
      activeId: "c1",
      conversations: [createConversationMeta("c1"), createConversationMeta("c2")],
    };
    const next = removeConversation(base, "c1").index;
    expect(next.activeId).toBe("c2");
    expect(next.conversations).toHaveLength(1);
  });

  it("⚠️ 删到空必须自动补一条，否则面板变空白且点不动", () => {
    const base = { activeId: "c1", conversations: [createConversationMeta("c1")] };
    const next = removeConversation(base, "c1").index;
    expect(next.conversations).toHaveLength(1);
    expect(next.activeId).toBe(next.conversations[0].id);
    expect(next.activeId).not.toBe("c1");
  });
});

describe("ensureConversationIndex 老数据迁移", () => {
  it("全新用户建一条空会话", () => {
    const index = ensureConversationIndex("p1", () => null);
    expect(index.conversations).toHaveLength(1);
    expect(index.activeId).toBe(index.conversations[0].id);
    expect(index.activeId).not.toBe("");
  });

  it("⚠️⚠️ 老 key 有消息时认作第一条会话，且 id 为空串以继续读写老 key", () => {
    const legacy = JSON.stringify([
      { id: "m1", role: "assistant", content: "你好", timestamp: "2026-09-18T00:00:00.000Z" },
      { id: "m2", role: "user", content: "做一张海报", timestamp: "2026-09-18T00:01:00.000Z" },
    ]);
    const index = ensureConversationIndex("p1", key =>
      key === "artx:canvas-assistant-messages:p1" ? legacy : null
    );
    expect(index.conversations).toHaveLength(1);
    expect(index.conversations[0].id).toBe("");
    expect(index.activeId).toBe("");
    expect(index.conversations[0].title).toBe("做一张海报");
    expect(index.conversations[0].messageCount).toBe(2);
  });

  it("⚠️ 迁移过程绝不读写老 key 以外的内容（不搬运数据）", () => {
    const touched: string[] = [];
    const legacy = JSON.stringify([
      { id: "m1", role: "user", content: "旧的", timestamp: "2026-09-18T00:00:00.000Z" },
    ]);
    ensureConversationIndex("p1", key => {
      touched.push(key);
      return key === "artx:canvas-assistant-messages:p1" ? legacy : null;
    });
    expect(touched).toEqual([
      "artx:canvas-conversations:p1",
      "artx:canvas-assistant-messages:p1",
    ]);
  });

  it("已有新索引时直接返回，不走迁移", () => {
    const stored = JSON.stringify({
      activeId: "c9",
      conversations: [{ id: "c9", title: "已存在", createdAt: "", updatedAt: "2026-09-18T00:00:00.000Z", messageCount: 5 }],
    });
    const index = ensureConversationIndex("p1", key =>
      key === "artx:canvas-conversations:p1" ? stored : null
    );
    expect(index.activeId).toBe("c9");
    expect(index.conversations[0].title).toBe("已存在");
  });

  it("老 key 内容损坏时当作全新用户", () => {
    const index = ensureConversationIndex("p1", key =>
      key === "artx:canvas-assistant-messages:p1" ? "{{{坏的" : null
    );
    expect(index.activeId).not.toBe("");
  });

  it("老 key 是空数组时不认作老会话", () => {
    const index = ensureConversationIndex("p1", key =>
      key === "artx:canvas-assistant-messages:p1" ? "[]" : null
    );
    expect(index.activeId).not.toBe("");
  });

  /*
   * ⚠️⚠️⚠️ 【2026-09-18 线上实测抓到的真 bug，必须保留】
   *
   * 【现象】线上打开画布后，localStorage 里出现**两条**
   *   `artx:canvas-assistant-messages:<projectId>:<随机id>`，
   *   而 `artx:canvas-conversations:<projectId>` **压根不存在**。
   *   后果：每刷新一次就凭空多一条空会话，历史列表永远是空的，且零报错。
   *
   * 【根因】本函数走「全新用户」分支时 `createConversationMeta()` 生成随机 id，
   *   但**只返回不落盘**。调用方 InfiniteCanvas 会调它两次
   *   （useState 初值一次 + [projectId] effect 一次），
   *   两次各自生成一个**不同**的随机 id。
   *
   * 📌⭐⭐⭐ 判据：**「纯函数每次调用都产出新随机值」和「它被当成幂等初始化用」
   *   是冲突的**。凡是 `ensureX()` 这类名字带 ensure 的函数，
   *   语义承诺就是「调多少次结果都一样」—— 内部一旦有随机源就必须落盘，
   *   否则 ensure 是假的。
   *
   * ⚠️ 原有测试全部只调**一次**，所以整组 34 条测试没有一条能抓到它。
   */
  it("⚠️⚠️⚠️ 同一份存储上连调两次必须得到同一个 activeId（ensure 的语义）", () => {
    const store = new Map<string, string>();
    const read = (key: string) => store.get(key) ?? null;
    const write = (key: string, value: string) => {
      store.set(key, value);
    };

    const first = ensureConversationIndex("p1", read, write);
    const second = ensureConversationIndex("p1", read, write);

    expect(second.activeId).toBe(first.activeId);
    expect(second.conversations).toHaveLength(1);
    expect(store.has("artx:canvas-conversations:p1")).toBe(true);
  });

  it("⚠️ 新建的索引必须立刻落盘（否则刷新后又是一条新会话）", () => {
    const store = new Map<string, string>();
    const index = ensureConversationIndex(
      "p1",
      key => store.get(key) ?? null,
      (key, value) => {
        store.set(key, value);
      }
    );
    const raw = store.get("artx:canvas-conversations:p1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).activeId).toBe(index.activeId);
  });

  it("⚠️ 老数据迁移出来的索引同样要落盘", () => {
    const store = new Map<string, string>([
      [
        "artx:canvas-assistant-messages:p1",
        JSON.stringify([
          { id: "m1", role: "user", content: "旧的", timestamp: "2026-09-18T00:00:00.000Z" },
        ]),
      ],
    ]);
    ensureConversationIndex(
      "p1",
      key => store.get(key) ?? null,
      (key, value) => {
        store.set(key, value);
      }
    );
    const raw = store.get("artx:canvas-conversations:p1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).activeId).toBe("");
  });

  it("⚠️ 不传 write 时不能崩（SSR / 只读探测场景）", () => {
    expect(() => ensureConversationIndex("p1", () => null)).not.toThrow();
  });
});

describe("对话记忆默认开启", () => {
  it("新建及首次初始化的会话默认开启", () => {
    const created = createConversationMeta("c1");
    expect(created.memoryEnabled).toBe(true);
    const index = ensureConversationIndex("p1", () => null);
    expect(index.conversations[0].memoryEnabled).toBe(true);
    expect(isConversationMemoryEnabled(index, index.activeId)).toBe(true);
  });

  it.each([undefined, null, "false", 0, {}, []])("旧索引缺字段或脏值 %j 默认开启", memoryEnabled => {
    const meta = { id: "c1", title: "旧对话", memoryEnabled };
    const raw = JSON.stringify({ activeId: "c1", conversations: [meta] });
    const parsed = parseConversationIndex(raw)!;
    const restored = ensureConversationIndex("p1", key =>
      key === canvasConversationIndexKey("p1") ? raw : null
    );
    expect(parsed.conversations[0].memoryEnabled).toBe(true);
    expect(restored.conversations[0].memoryEnabled).toBe(true);
    const unnormalized = { activeId: "c1", conversations: [meta as CanvasConversationMeta] };
    expect(isConversationMemoryEnabled(unnormalized, "c1")).toBe(true);
  });

  it.each([true, false])("显式 %j 在序列化和恢复后保持不变", memoryEnabled => {
    const initial = { activeId: "c1", conversations: [createConversationMeta("c1")] };
    const changed = setConversationMemoryEnabled(initial, "c1", memoryEnabled);
    const store = new Map([[canvasConversationIndexKey("p1"), JSON.stringify(changed)]]);
    const restored = ensureConversationIndex("p1", key => store.get(key) ?? null);
    expect(restored.conversations[0].memoryEnabled).toBe(memoryEnabled);
    expect(isConversationMemoryEnabled(restored, "c1")).toBe(memoryEnabled);
    expect(changed.conversations[0].updatedAt).toBe(initial.conversations[0].updatedAt);
    expect(initial.conversations[0].memoryEnabled).toBe(true);
  });

  it("开关只影响目标对话，找不到会话仍关闭", () => {
    const initial = {
      activeId: "c1",
      conversations: [createConversationMeta("c1"), createConversationMeta("c2")],
    };
    const changed = setConversationMemoryEnabled(initial, "c1", false);
    expect(isConversationMemoryEnabled(changed, "c1")).toBe(false);
    expect(isConversationMemoryEnabled(changed, "c2")).toBe(true);
    expect(isConversationMemoryEnabled(changed, "missing")).toBe(false);
    expect(isConversationMemoryEnabled({ activeId: "", conversations: [] }, "")).toBe(false);
    expect(setConversationMemoryEnabled(changed, "missing", true)).toEqual(changed);
  });

  it("legacy 迁移立即开启并落盘，原消息保持不变", () => {
    const legacyKey = canvasConversationMessagesKey("p1", "");
    const legacy = JSON.stringify([msg("user", "旧对话内容")]);
    const store = new Map([[legacyKey, legacy]]);
    const read = (key: string) => store.get(key) ?? null;
    const migrated = ensureConversationIndex("p1", read, (key, value) => store.set(key, value));
    expect(migrated.activeId).toBe("");
    expect(migrated.conversations[0].memoryEnabled).toBe(true);
    expect(isConversationMemoryEnabled(migrated, "")).toBe(true);
    expect(JSON.parse(store.get(canvasConversationIndexKey("p1"))!).conversations[0].memoryEnabled).toBe(true);
    expect(ensureConversationIndex("p1", read).conversations[0].memoryEnabled).toBe(true);
    expect(store.get(legacyKey)).toBe(legacy);
  });

  it("删除最后一条已关闭的会话后，重建会话默认开启", () => {
    const initial = {
      activeId: "c1",
      conversations: [{ ...createConversationMeta("c1"), memoryEnabled: false }],
    };
    const next = removeConversation(initial, "c1").index;
    expect(next.activeId).not.toBe("c1");
    expect(next.conversations[0].memoryEnabled).toBe(true);
    expect(isConversationMemoryEnabled(next, next.activeId)).toBe(true);
    expect(isConversationMemoryEnabled(next, "c1")).toBe(false);
  });

  it("消息更新补建会话时默认开启，已有关闭状态不被覆盖", () => {
    const initial = {
      activeId: "c1",
      conversations: [{ ...createConversationMeta("c1"), memoryEnabled: false }],
    };
    const updated = touchConversation(initial, "c1", [msg("user", "继续")]);
    expect(isConversationMemoryEnabled(updated, "c1")).toBe(false);
    const rebuilt = touchConversation(updated, "c2", [msg("user", "新对话")]);
    expect(isConversationMemoryEnabled(rebuilt, "c2")).toBe(true);
  });
});

describe("对话记忆经云同步往返", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    vi.stubGlobal("window", {
      localStorage: storage, sessionStorage: storage,
      location: { hostname: "localhost" }, dispatchEvent: vi.fn(),
    });
    store.set("artx-auth-session", JSON.stringify({ token: "test-token", user: { id: "memory-test" } }));
    store.set("artx:workspace-project-history:memory-test", JSON.stringify([{
      id: "p1", title: "项目", cover: null, nodeCount: 0,
      createdAt: "2026-11-21T00:00:00.000Z", updatedAt: "2026-11-21T00:00:00.000Z",
    }]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([undefined, true, false])("本地记忆值 %j 上行后在另一台设备恢复，显式关闭不被默认值覆盖", async memoryEnabled => {
    const meta = { ...createConversationMeta("c1"), memoryEnabled };
    store.set(canvasConversationIndexKey("p1"), JSON.stringify({ activeId: "c1", conversations: [meta] }));
    let uploaded: ReturnType<typeof normalizeWorkspaceSyncPayload> | undefined;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const incoming = normalizeWorkspaceSyncPayload(JSON.parse(init!.body as string));
      if (!uploaded) uploaded = incoming;
      return { ok: true, text: async () => JSON.stringify({ document: { ...uploaded, revision: 1 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncWorkspaceNow();
    const expected = memoryEnabled ?? true;
    expect(uploaded?.conversations[0].memoryEnabled).toBe(expected);
    store.delete(canvasConversationIndexKey("p1"));
    await syncWorkspaceNow();
    const restored = ensureConversationIndex("p1", key => store.get(key) ?? null);
    expect(restored.activeId).toBe("c1");
    expect(restored.conversations[0].memoryEnabled).toBe(expected);
    expect(isConversationMemoryEnabled(restored, "c1")).toBe(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, "false", true, false])("远端新版本的记忆值 %j 下行后遵守默认值且保留布尔值", async memoryEnabled => {
    const local = { ...createConversationMeta("c1"), updatedAt: "2026-11-21T00:00:00.000Z", memoryEnabled: memoryEnabled === false };
    store.set(canvasConversationIndexKey("p1"), JSON.stringify({ activeId: "c1", conversations: [local] }));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ document: {
        projects: [{ id: "p1", title: "项目", updatedAt: "2026-11-22T00:00:00.000Z" }],
        conversations: [{ projectId: "p1", conversationId: "c1", updatedAt: "2026-11-22T00:00:00.000Z", memoryEnabled }],
        revision: 2,
      } }),
    })));
    await syncWorkspaceNow();
    const restored = ensureConversationIndex("p1", key => store.get(key) ?? null);
    expect(restored.conversations[0].memoryEnabled).toBe(typeof memoryEnabled === "boolean" ? memoryEnabled : true);
  });

  it("远端旧缺字段会话不会覆盖本地更新的显式关闭", async () => {
    const local = { ...createConversationMeta("c1"), updatedAt: "2026-11-22T00:00:00.000Z", memoryEnabled: false };
    store.set(canvasConversationIndexKey("p1"), JSON.stringify({ activeId: "c1", conversations: [local] }));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ document: {
        projects: [{ id: "p1", title: "项目", updatedAt: "2026-11-21T00:00:00.000Z" }],
        conversations: [{ projectId: "p1", conversationId: "c1", updatedAt: "2026-11-21T00:00:00.000Z" }],
        revision: 2,
      } }),
    })));
    await syncWorkspaceNow();
    const restored = ensureConversationIndex("p1", key => store.get(key) ?? null);
    expect(isConversationMemoryEnabled(restored, "c1")).toBe(false);
  });
});

describe("相对时间", () => {
  const now = new Date("2026-09-18T12:00:00.000Z").getTime();

  it("一分钟内显示刚刚", () => {
    expect(formatConversationTime("2026-09-18T11:59:30.000Z", now)).toBe("刚刚");
  });

  it("小时内显示分钟", () => {
    expect(formatConversationTime("2026-09-18T11:30:00.000Z", now)).toBe("30 分钟前");
  });

  it("一天内显示小时", () => {
    expect(formatConversationTime("2026-09-18T06:00:00.000Z", now)).toBe("6 小时前");
  });

  it("一周内显示天", () => {
    expect(formatConversationTime("2026-09-15T12:00:00.000Z", now)).toBe("3 天前");
  });

  it("超过一周显示日期", () => {
    expect(formatConversationTime("2026-08-01T12:00:00.000Z", now)).toContain("2026/08/01");
  });

  it("空值返回空串", () => {
    expect(formatConversationTime("", now)).toBe("");
  });
});

describe("searchConversations", () => {
  const store: Record<string, string> = {};
  const read = (key: string) => store[key] ?? null;
  const conversations = [
    { id: "c1", title: "品牌海报", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z", messageCount: 3 },
    { id: "c2", title: "新对话", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T01:00:00.000Z", messageCount: 2 },
  ];

  beforeEach(() => {
    Object.keys(store).forEach(key => delete store[key]);
    store[canvasConversationMessagesKey("p1", "c1")] = JSON.stringify([
      msg("user", "帮我做一张夏日促销海报"),
      msg("assistant", "好的，我先确认主色"),
    ]);
    store[canvasConversationMessagesKey("p1", "c2")] = JSON.stringify([
      msg("user", "把这张图的背景换成海边"),
      msg("assistant", "已替换"),
    ]);
  });

  it("关键词为空时原样返回全部且不读盘", () => {
    let reads = 0;
    const hits = searchConversations({
      projectId: "p1",
      conversations,
      query: "   ",
      read: () => {
        reads += 1;
        return null;
      },
    });
    expect(hits).toHaveLength(2);
    expect(reads).toBe(0);
  });

  it("标题命中时不读正文，snippet 为空串", () => {
    const hits = searchConversations({
      projectId: "p1",
      conversations,
      query: "海报",
      read,
    });
    expect(hits.map(item => item.conversation.id)).toEqual(["c1"]);
    expect(hits[0].snippet).toBe("");
  });

  it("正文命中返回带省略号的片段", () => {
    const hits = searchConversations({
      projectId: "p1",
      conversations,
      query: "海边",
      read,
    });
    expect(hits.map(item => item.conversation.id)).toEqual(["c2"]);
    expect(hits[0].snippet).toContain("海边");
  });

  it("英文大小写不敏感", () => {
    const hits = searchConversations({
      projectId: "p1",
      conversations: [{ ...conversations[0], title: "GPT image" }],
      query: "gpt",
      read,
    });
    expect(hits).toHaveLength(1);
  });

  it("没有命中返回空数组", () => {
    const hits = searchConversations({
      projectId: "p1",
      conversations,
      query: "完全不存在的关键词",
      read,
    });
    expect(hits).toEqual([]);
  });

  it("消息体损坏时跳过，不影响其余会话", () => {
    store[canvasConversationMessagesKey("p1", "c1")] = "{ not json";
    const hits = searchConversations({
      projectId: "p1",
      conversations,
      query: "海边",
      read,
    });
    expect(hits.map(item => item.conversation.id)).toEqual(["c2"]);
  });
});
