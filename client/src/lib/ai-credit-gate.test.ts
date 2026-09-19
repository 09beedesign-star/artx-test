import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertStripKeptSource, stripSourceComments } from "../../../shared/strip-source-comments";
import { AI_BILLING_BLOCKED_MESSAGES } from "../../../shared/ai-credit-policy";
import { isAiCreditBlockedMessage } from "./ai-credit-gate";

/**
 * 「计费拦截不留失败节点」的契约测试。
 *
 * ## 背景
 *
 * 画布上的占位框是在请求**发出之前**插进去的（用户要立刻看到"正在生成中"），
 * 402 要等请求回来才知道。此前一律把占位框改成"生成图片失败"留在画布上，
 * 于是未订阅/余额不足的用户点一次生成，就白得一个（批量时是并排 4 个）空失败框：
 * 弹窗说没钱、画布却像出了故障。
 *
 * ## 这条链路为什么必须锁住
 *
 * 判定依据是**文案**：全站 15 处 catch 只把 `error.message` 往下传，
 * 402 的 code 在这一层已经丢了。文案一旦在两端各写一份，
 * 服务端改词 → 画布侧静默失效 → 失败节点重新爬回画布，且没有任何报错。
 * 所以这里同时锁三件事：文案同源、判定函数会认、画布真的调了它。
 *
 * ⚠️ 源码断言一律走 shared/strip-source-comments 的唯一实现，
 *    且必须先 assertStripKeptSource 自检 —— 否则注释被吃多时断言会恒绿。
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * @param maxLossRatio 剥离自检的容忍比例。
 *   ⚠️ 大文件用默认的 0.3；**小契约文件必须放宽**：ai-credit-gate.ts 是
 *   一份「只剩约定」的模块，注释本来就占一多半，按大文件口径测会误报成
 *   「剥离器坏了」。放宽前先确认：这个文件里确实没有 `"image/*"` 这类
 *   会把块注释正则带跑的字符串，否则真坏了也会被当成正常。
 */
function readSource(relativePath: string, maxLossRatio = 0.3) {
  const filePath = path.join(repoRoot, relativePath);
  const raw = readFileSync(filePath, "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return { raw, stripped };
}

describe("计费拦截文案：前后端必须同源", () => {
  it("isAiCreditBlockedMessage 认得出两条服务端文案", () => {
    expect(isAiCreditBlockedMessage(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION)).toBe(true);
    expect(isAiCreditBlockedMessage(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE)).toBe(true);
  });

  it("网络/上游类失败不会被误判成计费拦截 —— 那些必须保留失败节点给用户重试", () => {
    for (const message of [
      undefined,
      null,
      "",
      "图像生成超时，请稍后重试",
      "AI 未返回可用图片，请稍后重试",
      "Failed to fetch",
      "当前未订阅套餐，暂无可用创作积分（额外说明）",
    ]) {
      expect(isAiCreditBlockedMessage(message)).toBe(false);
    }
  });

  it("服务端不再自己写一段文案，而是引用 shared 常量", () => {
    const { stripped } = readSource("server/admin-store.ts");

    expect(stripped).toContain("AI_BILLING_BLOCKED_MESSAGES[input.code]");
    // 硬编码回来就等于重新出现第二份真相 —— 前端会跟着静默失效。
    expect(stripped).not.toContain(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION);
    expect(stripped).not.toContain(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE);
  });

  it("前端判定层不重复写文案，只从 shared 取", () => {
    // 用未剥离的原文断言：连注释里都不该出现第二份字面量。
    const { raw } = readSource("client/src/lib/ai-credit-gate.ts", 0.6);

    expect(raw).toContain('from "@shared/ai-credit-policy"');
    expect(raw).not.toContain(AI_BILLING_BLOCKED_MESSAGES.NO_SUBSCRIPTION);
    expect(raw).not.toContain(AI_BILLING_BLOCKED_MESSAGES.INSUFFICIENT_BALANCE);
  });
});

describe("画布接线：计费拦截时撤占位框而不是标失败", () => {
  const canvasPath = "client/src/components/canvas/InfiniteCanvas.tsx";

  it("failed 分支按文案识别计费拦截，并调用撤框函数", () => {
    const { stripped } = readSource(canvasPath);

    expect(stripped).toContain("isAiCreditBlockedMessage(detail.error)");
    expect(stripped).toContain("removeGenerationPlaceholders(nds, generationId)");
    /**
     * 撤框必须被 blockedByCredits 包住：无条件撤会把普通的网络失败也变成
     * 「点了生成、画布什么都没发生」，用户连重试的入口都找不到。
     */
    expect(stripped).toMatch(
      /if \(blockedByCredits\) \{[\s\S]{0,300}?removeGenerationPlaceholders\(nds, generationId\)/
    );
  });

  it("占位框在创建处打标记，且全文件只此一处", () => {
    const { stripped } = readSource(canvasPath);

    expect(stripped.match(/placeholderForGeneration: true/g) || []).toHaveLength(1);
  });

  it("撤框逻辑复用的是可测的纯函数模块，不是内联在组件里", () => {
    const { stripped } = readSource(canvasPath);
    expect(stripped).toContain('from "@/lib/canvas-generation-nodes"');
  });
});
