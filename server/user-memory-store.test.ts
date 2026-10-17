import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetUserMemoryForTests,
  getUserMemoryDocument,
  recordPromptMemory,
  saveProjectMemory,
  updateUserMemorySettings,
} from "./user-memory-store";
import { getMemoryLimitsForPlan } from "../shared/user-memory";

beforeEach(() => {
  __resetUserMemoryForTests();
});

describe("按账号隔离", () => {
  it("两个用户的记忆互不可见", async () => {
    await updateUserMemorySettings("u1", { longTerm: "极简北欧" });
    await updateUserMemorySettings("u2", { longTerm: "赛博朋克" });
    expect((await getUserMemoryDocument("u1")).longTerm).toBe("极简北欧");
    expect((await getUserMemoryDocument("u2")).longTerm).toBe("赛博朋克");
  });

  it("没写过的用户拿到空文档而不是报错", async () => {
    const doc = await getUserMemoryDocument("never-seen");
    expect(doc.longTerm).toBe("");
    expect(doc.contextEnabled).toBe(false);
  });
});

describe("patch 语义：个人中心保存不能清空其他层", () => {
  it("保存长期记忆后项目记忆与历史提示词仍在", async () => {
    /*
     * ⚠️ 这是整份替换最典型的事故：用户在个人中心点一次保存，
     *    项目记忆和历史提示词全没了，而且零报错。
     */
    await updateUserMemorySettings("u1", { contextEnabled: true });
    await saveProjectMemory("u1", {
      projectId: "p1",
      note: "浅灰水泥台面",
      updatedAt: new Date().toISOString(),
    });
    await recordPromptMemory(
      "u1",
      { prompt: "白色马克杯", projectId: "p1", conversationId: "canvas:p1:c1", createdAt: new Date().toISOString() },
      true
    );

    await updateUserMemorySettings("u1", { longTerm: "极简北欧" });

    const doc = await getUserMemoryDocument("u1");
    expect(doc.longTerm).toBe("极简北欧");
    expect(doc.projects).toHaveLength(1);
    expect(doc.recentPrompts).toHaveLength(1);
    // 开关也不该被这次保存顺手关掉
    expect(doc.contextEnabled).toBe(true);
  });

  it("只改开关不会覆盖长期记忆文本", async () => {
    await updateUserMemorySettings("u1", { longTerm: "极简北欧" });
    await updateUserMemorySettings("u1", { contextEnabled: true });
    const doc = await getUserMemoryDocument("u1");
    expect(doc.longTerm).toBe("极简北欧");
    expect(doc.contextEnabled).toBe(true);
  });
});

describe("开关关闭时不记录提示词", () => {
  it("开关关着调用 recordPromptMemory 什么都不写", async () => {
    // 开关关着却偷偷记录 = 用户以为没开记忆、实际一直被记录。
    const result = await recordPromptMemory(
      "u1",
      { prompt: "白色马克杯", conversationId: "canvas:p1:c1", createdAt: new Date().toISOString() },
      false
    );
    expect(result).toBeNull();
    expect((await getUserMemoryDocument("u1")).recentPrompts).toEqual([]);
  });

  it("开关打开后才开始记录（开关按对话绑定，由调用方传 scopeEnabled）", async () => {
    await recordPromptMemory(
      "u1",
      { prompt: "白色马克杯", conversationId: "canvas:p1:c1", createdAt: new Date().toISOString() },
      true
    );
    expect((await getUserMemoryDocument("u1")).recentPrompts).toHaveLength(1);
  });
});

describe("并发写入不互相覆盖", () => {
  it("同时追加多条提示词，一条都不能丢", async () => {
    /*
     * ⚠️⚠️⚠️ 这条测试盯的是 runExclusive。
     * 去掉串行队列后，并发的 load→改→save 会互相抹掉，
     * 结果只剩最后一条。生产上的表现是「记忆时有时无」且零报错。
     */
    await updateUserMemorySettings("u1", { contextEnabled: true });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        recordPromptMemory(
          "u1",
          {
            prompt: `prompt-${i}`,
            conversationId: "canvas:p1:c1",
            createdAt: new Date(Date.now() + i * 1000).toISOString(),
          },
          true
        )
      )
    );
    const doc = await getUserMemoryDocument("u1");
    expect(doc.recentPrompts).toHaveLength(12);
  });

  it("并发写不同用户也不会互相抹掉", async () => {
    await Promise.all([
      updateUserMemorySettings("u1", { longTerm: "A" }),
      updateUserMemorySettings("u2", { longTerm: "B" }),
      updateUserMemorySettings("u3", { longTerm: "C" }),
    ]);
    expect((await getUserMemoryDocument("u1")).longTerm).toBe("A");
    expect((await getUserMemoryDocument("u2")).longTerm).toBe("B");
    expect((await getUserMemoryDocument("u3")).longTerm).toBe("C");
  });
});

describe("revision 单调递增", () => {
  it("每次写入 revision +1，便于将来做 CAS", async () => {
    const first = await updateUserMemorySettings("u1", { longTerm: "A" });
    const second = await updateUserMemorySettings("u1", { longTerm: "B" });
    expect(second.revision).toBe(first.revision + 1);
  });
});

describe("空 userId 不写库", () => {
  it("userId 为空时返回空文档且不抛错", async () => {
    const doc = await updateUserMemorySettings("", { longTerm: "X" });
    expect(doc.longTerm).toBe("");
  });
});

describe("【2026-10-18】按档位保存", () => {
  it("降级用户只拨开关，不会截掉付费期写的内容", async () => {
    await updateUserMemorySettings("u1", { projectMemory: "P".repeat(5000) }, getMemoryLimitsForPlan("pro"));
    await updateUserMemorySettings("u1", { ecommerceMemoryEnabled: true }, getMemoryLimitsForPlan("free"));
    expect((await getUserMemoryDocument("u1")).projectMemory).toHaveLength(5000);
  });

  it("改文本时按当前档位截断", async () => {
    await updateUserMemorySettings("u1", { projectMemory: "P".repeat(5000) }, getMemoryLimitsForPlan("free"));
    expect((await getUserMemoryDocument("u1")).projectMemory).toHaveLength(300);
  });
});
