/**
 * 余额不足弹窗：「不向用户披露积分消耗」的回归测试
 *
 * 【产品决策】2026-09-19 用户拍板：
 * 弹窗里不再显示「本次需要 N 积分 / 当前可用 M」，
 * 只告诉用户积分不足，以及下一步（去订阅 / 去充值）。
 *
 * 【为什么要写测试锁住它】
 * 这是一条**纯产品约定**，代码上加回去毫无阻力：
 * 服务端 402 响应体至今仍带着 requiredCredits / availableCredits
 * （后台对账和日志排查要用，不能删），下一个人只要在弹窗里
 * 渲染一下就"恢复"了，而且不会报任何错、不会有任何人发现。
 *
 * 因此护栏放在**事件契约**上：InsufficientCreditsDetail 只携带 code。
 * 本文件确保：
 *   ① 契约里确实没有这两个字段
 *   ② emitInsufficientCredits 解析时确实把它们丢掉了
 *   ③ 弹窗源码里确实没有渲染任何积分数字
 *
 * ⚠️ 每条反向断言都配了正向锚点，防止「路径写错 / 正则吃掉源码」导致恒绿。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "../../../../shared/strip-source-comments";

const REPO_ROOT = resolve(__dirname, "../../../..");

const DIALOG_PATH = "client/src/components/billing/InsufficientCreditsDialog.tsx";
const GATE_PATH = "client/src/lib/ai-credit-gate.ts";
const POLICY_PATH = "shared/ai-credit-policy.ts";

/**
 * 这几个文件都带大段设计说明注释，占比天然偏高。
 *
 * 实测（两套独立口径互相印证，差值均 < 1 个百分点）：
 *   ai-credit-gate.ts             正则 63.7% / 逐行 63.7%
 *   ai-credit-policy.ts           正则 34.9% / 逐行 35.6%
 *   InsufficientCreditsDialog.tsx 正则 21.9% / 逐行 22.3%
 * 两个口径吻合 ⇒ 是注释真的多，不是正则把源码吃跑了。
 *
 * ⚠️ 只放宽本调用点，**绝不改 assertStripKeptSource 的默认值 0.3** ——
 *    默认值是全仓其它测试共用的护栏，动它等于替所有文件把门拆了。
 * ⚠️ 同时上面保留了一次「锚点幸存」正向自检：万一正则将来真的退化，
 *    比例可能仍在阈值内，但锚点会消失，届时所有反向断言会恒绿。
 */
const MAX_COMMENT_RATIO = 0.7;

function readCode(relativePath: string): string {
  const raw = readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, MAX_COMMENT_RATIO);
  return stripped;
}

/* ───────────────── 检测器自检 ───────────────── */

describe("检测器自身有效性", () => {
  it("三个源文件都能读到，且剥注释后关键锚点仍幸存", () => {
    /**
     * 没有这条自检，下面所有 not.toContain 都会在
     * 「路径写错」或「正则把源码吃光」时恒绿 —— 那才是真正的失守。
     */
    const anchors: Array<[string, string]> = [
      [DIALOG_PATH, "export default function InsufficientCreditsDialog"],
      [GATE_PATH, "export function emitInsufficientCredits"],
      [POLICY_PATH, "AI_BILLING_BLOCKED_MESSAGES"],
    ];
    for (const [path, anchor] of anchors) {
      expect(readCode(path), `${path} 的锚点丢了，本文件的反向断言已全部失效`)
        .toContain(anchor);
    }
  });
});

/* ───────────────── 契约层：前端拿不到这两个数 ───────────────── */

describe("事件契约不携带积分数额", () => {
  it("InsufficientCreditsDetail 里没有 requiredCredits / availableCredits", () => {
    const code = readCode(GATE_PATH);
    const start = code.indexOf("export type InsufficientCreditsDetail");
    expect(start, "类型声明找不到了，断言已失效").toBeGreaterThan(-1);
    const block = code.slice(start, code.indexOf("};", start) + 2);

    // 正向：确实还带着 code（否则弹窗分不清订阅还是充值）
    expect(block).toContain("code: AiBillingErrorCode");
    // 反向：两个数额都不许进契约
    expect(block).not.toContain("requiredCredits");
    expect(block).not.toContain("availableCredits");
  });

  it("emitInsufficientCredits 构造 detail 时只取 code", () => {
    const code = readCode(GATE_PATH);
    const start = code.indexOf("export function emitInsufficientCredits");
    const block = code.slice(start, start + 900);

    expect(block).toContain("const detail: InsufficientCreditsDetail = { code }");
    /**
     * ⚠️ 作用域必须限定在函数体内。
     *    全文件搜这两个串会命中 AiBillingErrorPayload 的类型定义
     *    （那是服务端响应体的镜像，必须保留），导致断言恒红。
     */
    expect(block).not.toContain("requiredCredits:");
    expect(block).not.toContain("availableCredits:");
  });

  it("响应体类型仍保留这两个字段（服务端要返回，不能连带删掉）", () => {
    /**
     * 反向保护：有人为了"彻底清理"把服务端响应体类型也删了，
     * 会让后台对账链路静默失配。这里明确它必须还在。
     */
    const code = readCode(GATE_PATH);
    const start = code.indexOf("export type AiBillingErrorPayload");
    const block = code.slice(start, code.indexOf("};", start) + 2);
    expect(block).toContain("requiredCredits?: number");
    expect(block).toContain("availableCredits?: number");
  });
});

/* ───────────────── 展示层：弹窗里没有任何积分数字 ───────────────── */

describe("弹窗不展示积分消耗", () => {
  it("没有「本次需要」「当前可用」这两栏", () => {
    const code = readCode(DIALOG_PATH);
    // 正向锚点：弹窗主体还在
    expect(code).toContain("data-artx-insufficient-credits");
    // 反向：两个标签都不许出现
    expect(code).not.toContain("本次需要");
    expect(code).not.toContain("当前可用");
  });

  it("不再渲染任何积分数额（formatCredits 已移除）", () => {
    const code = readCode(DIALOG_PATH);
    /**
     * ⚠️ 不能只断言 not.toContain("formatCredits(")：
     *    有人换个函数名（toLocaleString / Intl.NumberFormat）一样能显示出来。
     *    所以连数字格式化手段一起禁掉。
     */
    expect(code).not.toContain("formatCredits");
    expect(code).not.toContain("toLocaleString");
    expect(code).not.toContain("Intl.NumberFormat");
    expect(code).not.toContain("detail.requiredCredits");
    expect(code).not.toContain("detail.availableCredits");
  });

  it("仍保留两个出口文案和关闭能力（别把弹窗本身改坏了）", () => {
    const code = readCode(DIALOG_PATH);
    expect(code).toContain("查看订阅方案");
    expect(code).toContain("去充值");
    expect(code).toContain("暂不需要");
    expect(code).toContain("创作积分不足");
  });
});

/* ───────────────── 文案层：对外错误文案不含数字 ───────────────── */

describe("对外错误文案不泄露数额", () => {
  it("AI_BILLING_BLOCKED_MESSAGES 的两条文案里没有数字占位", () => {
    const code = readCode(POLICY_PATH);
    const start = code.indexOf("export const AI_BILLING_BLOCKED_MESSAGES");
    expect(start).toBeGreaterThan(-1);
    const block = code.slice(start, code.indexOf("} as const;", start));

    expect(block).toContain("当前可用积分不足以完成本次创作");
    // 模板插值 / 阿拉伯数字都不许出现 —— 一旦出现就等于把单价说出去了
    expect(block).not.toContain("${");
    expect(block).not.toMatch(/\d/);
  });
});
