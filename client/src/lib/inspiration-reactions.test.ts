import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSPIRATION_REACTIONS_EVENT,
  getDisplayLikeCount,
  isInspirationReacted,
  readInspirationReactions,
  toggleInspirationReaction,
  type InspirationReactionItem,
} from "./inspiration-reactions";

/**
 * 灵感点赞 / 收藏状态的防护测试。
 *
 * 【这组测试真正要守住的事故】
 * 用户要求「取消点赞或取消收藏，个人中心的点赞、收藏 tab 同步消失对应的沉淀内容」。
 * 这条需求有三个会静默失效的点：
 *   1. **没有广播** —— 同一个标签页写 localStorage 收不到 storage 事件，
 *      个人中心那棵组件树根本不会重渲染，表现就是「取消了它还在」；
 *   2. **只存 id 不存快照** —— 专题页数据是远程分页的，用户赞过的条目
 *      未必在当前已加载页里，个人中心会渲染出空白卡片；
 *   3. **按用户分桶漏了** —— 换账号后看到上一个人的收藏夹。
 * 还有一个穿帮点：展示用赞数是随机基数，不能当真实计数持久化。
 */

const storage = new Map<string, string>();
const dispatched: Array<{ type: string }> = [];

beforeEach(() => {
  storage.clear();
  dispatched.length = 0;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    dispatchEvent: (event: { type: string }) => {
      dispatched.push(event);
      return true;
    },
  });
  // jsdom 不在本项目的 vitest 环境里（environment: node），自己补一个最小 CustomEvent。
  vi.stubGlobal(
    "CustomEvent",
    class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sample: Omit<InspirationReactionItem, "reactedAt"> = {
  id: "赛博朋克城市夜景",
  title: "赛博朋克城市夜景",
  field: "概念设计",
  group: "视觉创意",
  subcategory: "场景",
  description: "霓虹雨夜的高密度城市",
  prompt: "a neon-soaked cyberpunk city at night, rain reflections",
  imageUrl: "https://cdn.example.com/a.jpg",
};

describe("inspiration reactions store", () => {
  it("starts empty and records a like with a full content snapshot", () => {
    expect(readInspirationReactions("u1")).toEqual({ like: [], favorite: [] });

    const { active, state } = toggleInspirationReaction("u1", "like", sample);
    expect(active).toBe(true);
    expect(state.like).toHaveLength(1);

    // ⚠️ 必须是整条快照，不是只有 id —— 个人中心要按专题页卡片原样渲染
    const stored = state.like[0]!;
    expect(stored.title).toBe(sample.title);
    expect(stored.field).toBe(sample.field);
    expect(stored.prompt).toBe(sample.prompt);
    expect(stored.imageUrl).toBe(sample.imageUrl);
    expect(typeof stored.reactedAt).toBe("number");
  });

  it("removes the entry on the second toggle so profile tabs drop it", () => {
    toggleInspirationReaction("u1", "like", sample);
    const { active, state } = toggleInspirationReaction("u1", "like", sample);
    expect(active).toBe(false);
    expect(state.like).toHaveLength(0);
    expect(isInspirationReacted(readInspirationReactions("u1"), "like", sample.id)).toBe(false);
  });

  it("broadcasts a change event so other mounted trees re-render", () => {
    toggleInspirationReaction("u1", "like", sample);
    // 📌 没有这条广播，个人中心就是「取消了它还在」
    expect(dispatched.some(event => event.type === INSPIRATION_REACTIONS_EVENT)).toBe(true);
  });

  it("keeps like and favorite independent", () => {
    toggleInspirationReaction("u1", "like", sample);
    toggleInspirationReaction("u1", "favorite", sample);
    let state = readInspirationReactions("u1");
    expect(state.like).toHaveLength(1);
    expect(state.favorite).toHaveLength(1);

    toggleInspirationReaction("u1", "like", sample);
    state = readInspirationReactions("u1");
    // 取消点赞不应该连带把收藏也取消
    expect(state.like).toHaveLength(0);
    expect(state.favorite).toHaveLength(1);
  });

  it("isolates state per user so switching accounts never leaks a collection", () => {
    toggleInspirationReaction("u1", "favorite", sample);
    expect(readInspirationReactions("u2").favorite).toHaveLength(0);
    expect(readInspirationReactions("u1").favorite).toHaveLength(1);
  });

  it("falls back to an anonymous bucket instead of throwing when logged out", () => {
    const { active } = toggleInspirationReaction(null, "like", sample);
    expect(active).toBe(true);
    expect(readInspirationReactions(null).like).toHaveLength(1);
    // 未登录的记录不应该串进某个具体账号
    expect(readInspirationReactions("u1").like).toHaveLength(0);
  });

  it("returns an empty state instead of crashing on corrupted storage", () => {
    storage.set("artx:inspiration-reactions:u1", "{not json");
    expect(readInspirationReactions("u1")).toEqual({ like: [], favorite: [] });
  });

  it("drops malformed entries that have no id", () => {
    storage.set(
      "artx:inspiration-reactions:u1",
      JSON.stringify({ like: [{ title: "没有 id" }, { ...sample, reactedAt: 1 }], favorite: [] })
    );
    expect(readInspirationReactions("u1").like).toHaveLength(1);
  });

  it("puts the newest reaction first so profile tabs show recent items on top", () => {
    toggleInspirationReaction("u1", "like", sample);
    const second = { ...sample, id: "第二条", title: "第二条" };
    const { state } = toggleInspirationReaction("u1", "like", second);
    expect(state.like[0]!.id).toBe("第二条");
  });
});

describe("display like count", () => {
  it("adds only the current user vote on top of the random display base", () => {
    expect(getDisplayLikeCount(1200, false)).toBe(1200);
    expect(getDisplayLikeCount(1200, true)).toBe(1201);
  });

  it("never renders a negative or NaN count", () => {
    expect(getDisplayLikeCount(Number.NaN, true)).toBe(1);
    expect(getDisplayLikeCount(-5, false)).toBe(0);
  });
});
