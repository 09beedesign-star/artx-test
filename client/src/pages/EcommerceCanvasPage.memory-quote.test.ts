/**
 * 电商画布报价必须和服务端扣费同口径：
 * 服务端 /api/images/generate → withUserMemory → buildUserMemoryContext 非空即 +5。
 * 前端若不带 userMemoryContext，按钮写 70、实扣 75，零报错。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { quoteAiUsage } from "../../../shared/ai-credit-policy";
import { buildUserMemoryContext, createEmptyUserMemoryDocument } from "../../../shared/user-memory";

const source = readFileSync("client/src/pages/EcommerceCanvasPage.tsx", "utf8");

describe("电商画布报价带记忆附加费", () => {
  it("主报价 quoteAiUsage 传了 userMemoryContext", () => {
    const quoteBlock = source.match(/const quote = useMemo\([\s\S]*?\n  \);/)?.[0] || "";
    expect(quoteBlock).toContain("userMemoryContext: memoryContext");
    expect(quoteBlock).toMatch(/\[[^\]]*memoryContext[^\]]*\]/);
  });

  it("memoryContext 与服务端同一函数、同一开关口径（includeRecentPrompts = contextEnabled）", () => {
    expect(source).toContain("buildUserMemoryContext({");
    expect(source).toContain("includeRecentPrompts: memoryDoc.contextEnabled");
  });

  it("监听全站记忆变更事件，在画布/个人中心切换后同步刷新", () => {
    expect(source).toContain("USER_MEMORY_CHANGED_EVENT");
    expect(source).toMatch(/removeEventListener\(USER_MEMORY_CHANGED_EVENT/);
  });

  it("把 memoryActive / memorySurcharge 传给工作台", () => {
    expect(source).toContain("memoryActive={memoryActive}");
    expect(source).toContain("memorySurcharge={");
  });

  it("行为：只写了长期记忆（开关关）也收附加费，与服务端一致", () => {
    const doc = { ...createEmptyUserMemoryDocument(), longTerm: "我习惯暖色调" };
    const ctx = buildUserMemoryContext({ document: doc, includeRecentPrompts: doc.contextEnabled });
    const base = quoteAiUsage({ capability: "text_to_image", outputCount: 2 }).chargedCredits;
    const withMem = quoteAiUsage({ capability: "text_to_image", outputCount: 2, userMemoryContext: ctx }).chargedCredits;
    expect(withMem - base).toBe(5);
  });

  it("行为：空记忆不收附加费", () => {
    const doc = createEmptyUserMemoryDocument();
    const ctx = buildUserMemoryContext({ document: doc, includeRecentPrompts: true });
    expect(ctx).toBe("");
    const base = quoteAiUsage({ capability: "text_to_image", outputCount: 1 }).chargedCredits;
    expect(quoteAiUsage({ capability: "text_to_image", outputCount: 1, userMemoryContext: ctx }).chargedCredits).toBe(base);
  });
});
