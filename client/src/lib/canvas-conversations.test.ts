import { describe, expect, it } from "vitest";
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
  parseConversationIndex,
  removeConversation,
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
