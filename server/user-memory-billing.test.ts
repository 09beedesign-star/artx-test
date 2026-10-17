/**
 * 记忆附加费计费测试 —— 锁定「开启记忆时由用户承担成本」（2026-10-17 用户拍板）。
 *
 * 判据：没有记忆内容 / 能力不消费提示词 → 不收；有记忆 + 能力会消费 → 收附加费。
 * 📌 生产扣费走 server/admin-store.ts 的 quoteAiUsageFromData，不是 shared 的 quoteAiUsage ——
 *    两份都必须调 getMemoryContextSurcharge，这里用源码断言锁住生产那份。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  quoteAiUsage,
  getMemoryContextSurcharge,
  MEMORY_CONTEXT_SURCHARGE_CREDITS,
  MEMORY_CONSUMING_CAPABILITIES,
} from "../shared/ai-credit-policy";

const MODEL = "vod-og25-sunburst-medium";
const MEMORY = "主色必须用 #1F2937 深蓝灰，禁止高饱和；一律极简北欧风";

describe("记忆附加费", () => {
  it("不带记忆时与改造前逐位一致", () => {
    const quote = quoteAiUsage({ capability: "text_to_image", model: MODEL });
    expect(quote.chargedCredits).toBe(70);
  });

  it("出图带记忆时多收附加费", () => {
    const base = quoteAiUsage({ capability: "text_to_image", model: MODEL }).chargedCredits;
    const withMemory = quoteAiUsage({ capability: "text_to_image", model: MODEL, userMemoryContext: MEMORY }).chargedCredits;
    expect(withMemory).toBe(base + MEMORY_CONTEXT_SURCHARGE_CREDITS);
  });

  it("多张图只收一次附加费（记忆按请求发一次，不按张）", () => {
    const base = quoteAiUsage({ capability: "text_to_image", model: MODEL, outputCount: 4 }).chargedCredits;
    const withMemory = quoteAiUsage({ capability: "text_to_image", model: MODEL, outputCount: 4, userMemoryContext: MEMORY }).chargedCredits;
    expect(withMemory - base).toBe(MEMORY_CONTEXT_SURCHARGE_CREDITS);
  });

  it("4K 出图附加费不跟着分辨率翻倍", () => {
    const base = quoteAiUsage({ capability: "text_to_image", model: MODEL, resolutionTier: "4k" }).chargedCredits;
    const withMemory = quoteAiUsage({ capability: "text_to_image", model: MODEL, resolutionTier: "4k", userMemoryContext: MEMORY }).chargedCredits;
    expect(withMemory - base).toBe(MEMORY_CONTEXT_SURCHARGE_CREDITS);
  });

  it("空白记忆不收", () => {
    const base = quoteAiUsage({ capability: "text_to_image", model: MODEL }).chargedCredits;
    expect(quoteAiUsage({ capability: "text_to_image", model: MODEL, userMemoryContext: "   " }).chargedCredits).toBe(base);
  });

  it("对话带记忆也收", () => {
    const base = quoteAiUsage({ capability: "text_generation" }).chargedCredits;
    expect(quoteAiUsage({ capability: "text_generation", userMemoryContext: MEMORY }).chargedCredits)
      .toBe(base + MEMORY_CONTEXT_SURCHARGE_CREDITS);
  });

  it("抠图这类不读提示词的能力，带了记忆也不收", () => {
    for (const capability of ["background_removal", "watermark_removal", "image_expansion"] as const) {
      const base = quoteAiUsage({ capability }).chargedCredits;
      expect(quoteAiUsage({ capability, userMemoryContext: MEMORY }).chargedCredits, capability).toBe(base);
    }
  });

  it("附加费口径", () => {
    expect(MEMORY_CONTEXT_SURCHARGE_CREDITS).toBe(5);
    expect([...MEMORY_CONSUMING_CAPABILITIES].sort()).toEqual(["text_generation", "text_to_image"]);
    expect(getMemoryContextSurcharge("text_to_image", MEMORY)).toBe(5);
    expect(getMemoryContextSurcharge("background_removal", MEMORY)).toBe(0);
  });
});

describe("生产扣费链路必须全部带上记忆", () => {
  const store = readFileSync(resolve(__dirname, "admin-store.ts"), "utf-8");
  const index = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

  it("生产报价函数调用了附加费", () => {
    const start = store.indexOf("function quoteAiUsageFromData");
    const body = store.slice(start, store.indexOf("\n}\n", start));
    expect(body).toContain("getMemoryContextSurcharge(input.capability, input.userMemoryContext)");
  });

  it("余额校验和真实扣费都把记忆传进报价", () => {
    for (const fn of ["export async function assertUserCanAffordAiUsage", "export async function recordAiUsage"]) {
      const start = store.indexOf(fn);
      expect(start, fn).toBeGreaterThan(-1);
      const body = store.slice(start, store.indexOf("\n}\n", start));
      expect(body, fn).toContain("userMemoryContext: input.userMemoryContext");
    }
  });

  it("所有成功扣费的路由都把请求体交给计费", () => {
    // 成功分支的 recordAiRouteUsage 必须带 request，否则真实扣费看不到记忆 → 平台白吃。
    const calls = index.split("await recordAiRouteUsage(").slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("});") + 3));
    const success = calls.filter((call) => call.includes('status: "success"'));
    expect(success.length).toBeGreaterThanOrEqual(5);
    for (const call of success) expect(call, call.slice(0, 120)).toMatch(/request:/);
  });
});
