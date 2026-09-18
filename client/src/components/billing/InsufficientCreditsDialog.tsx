/**
 * 余额不足 / 未订阅拦截弹窗。
 *
 * 【为什么要有它】
 * 服务端此前只做「事后扣账」，0 积分账号其实可以无限调用 AI —— 直到
 * assertUserCanAffordAiUsage 上线才真正拦住。但光有拦截不行：
 * 请求被拒而前端没有任何解释，用户只会看到一句 toast「生成失败」，
 * 然后判定为「这个产品坏了」。这条弹窗负责把「为什么失败」和
 * 「下一步怎么办」讲清楚。
 *
 * 【为什么两种文案】
 * 这是两类处境完全不同的用户，混成一句话都会误导：
 *   NO_SUBSCRIPTION     —— 从没买过东西，要的是「这东西怎么买」，给套餐列表
 *   INSUFFICIENT_BALANCE —— 老用户只是当月额度用完了，给充值入口就够了，
 *                          再把他推去订阅页等于让他重复花钱
 * code 由服务端根据用户 plan 判定（见 server/admin-store.ts 的 AiBillingError），
 * 前端不再自行二次推断 —— 推断就有可能与服务端口径不一致。
 *
 * 【为什么监听 window 事件而不是接收 props】
 * 全站 AI 调用点十几处，没有任何统一出口。用事件可以让新增的 AI 功能
 * 自动继承这条保护，不必记得「这里也要传一个 handler」。
 * 同款范式见 ai.ts 的 artx:login-required。
 *
 * 【为什么调用 /billing 而不是自建支付 UI】
 * 订阅与充值的选择只是在全部站收敛到 BillingDialogProvider 一个出口，
 * 这里另写一套 UI = 第 N 次「同一份逻辑的多个出口」，改价必漏。
 */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, Sparkles, Wallet, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  AI_INSUFFICIENT_CREDITS_EVENT,
  type InsufficientCreditsDetail,
} from "@/lib/ai-credit-gate";
import { useBillingDialog } from "./BillingDialogProvider";
import { getBillingTheme } from "./billing-theme";

function formatCredits(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("zh-CN");
}

export default function InsufficientCreditsDialog() {
  const { resolvedTheme } = useTheme();
  const theme = getBillingTheme(resolvedTheme === "dark");
  const { openBilling } = useBillingDialog();
  const [detail, setDetail] = useState<InsufficientCreditsDetail | null>(null);

  useEffect(() => {
    const handleInsufficient = (event: Event) => {
      const next = (event as CustomEvent<InsufficientCreditsDetail>).detail;
      if (!next?.code) return;
      /**
       * 批量操作（一次生成多张、画布里多个节点同时跑）会在同一 tick 里
       * 连发好几次事件。只认第一次：后面的数据与第一次是同一个用户的同一个处境，
       * 反复 setState 只会让弹窗内容抖动。
       */
      setDetail(previous => previous ?? next);
    };
    window.addEventListener(AI_INSUFFICIENT_CREDITS_EVENT, handleInsufficient);
    return () => {
      window.removeEventListener(AI_INSUFFICIENT_CREDITS_EVENT, handleInsufficient);
    };
  }, []);

  const close = useCallback(() => setDetail(null), []);

  const goBilling = useCallback(() => {
    const code = detail?.code;
    setDetail(null);
    openBilling(code === "NO_SUBSCRIPTION" ? "subscription" : "recharge");
  }, [detail?.code, openBilling]);

  useEffect(() => {
    if (!detail) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail, close]);

  // 与 BillingDialog 同款：开着时不锁的话，滚动会穿透到背后的长页面。
  useEffect(() => {
    if (!detail || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detail]);

  if (!detail) return null;

  const { panel, panelStrong, border, text, sub, faint, purple } = theme;
  const noSubscription = detail.code === "NO_SUBSCRIPTION";
  const Icon = noSubscription ? Sparkles : Wallet;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center px-4 py-6"
      style={{
        background: "rgba(23,23,23,0.72)",
        backdropFilter: "blur(10px)",
      }}
      onClick={event => {
        if (event.target === event.currentTarget) close();
      }}
      data-artx-insufficient-credits
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl-design)] border"
        style={{
          background: theme.bg,
          borderColor: border,
          boxShadow: "0 32px 100px oklch(0 0 0 / 0.46)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: border, background: panel }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-pill)]"
              style={{ background: "oklch(0.68 0.20 292 / 0.14)", color: purple }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="type-body-strong" style={{ color: text }}>
              {noSubscription ? "还没有可用创作积分" : "创作积分不足"}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="rounded-[var(--radius-pill)] p-1.5 transition-opacity hover:opacity-70"
            style={{ color: faint }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5" style={{ background: panelStrong }}>
          <p className="type-body mb-4 leading-relaxed" style={{ color: sub }}>
            {noSubscription ? (
              <>
                当前账号还没有开通套餐，AI 生成、编辑、提示词反推这些能力都需要消耗创作积分。
                订阅后每月会自动发放额度。
              </>
            ) : (
              <>
                当前套餐的月度额度已用完，无法完成本次创作。补充积分后可以立刻继续，
                次月会照常发放新的套餐额度。
              </>
            )}
          </p>

          <div
            className="mb-5 flex items-center justify-between rounded-[var(--radius-lg-design)] border px-4 py-3"
            style={{ borderColor: border, background: theme.bg }}
          >
            <span className="type-caption" style={{ color: faint }}>
              本次需要
            </span>
            <span className="type-body-strong" style={{ color: text }}>
              {formatCredits(detail.requiredCredits)} 积分
            </span>
            <span className="type-caption" style={{ color: border }}>|</span>
            <span className="type-caption" style={{ color: faint }}>
              当前可用
            </span>
            <span className="type-body-strong" style={{ color: text }}>
              {formatCredits(detail.availableCredits)}
            </span>
          </div>

          <button
            type="button"
            onClick={goBilling}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2.5 type-body-strong transition-opacity hover:opacity-90"
            style={{ background: theme.green, color: "#171717" }}
          >
            <CreditCard className="h-4 w-4" />
            {noSubscription ? "查看订阅方案" : "去充值"}
          </button>
          <button
            type="button"
            onClick={close}
            className="mt-2 w-full rounded-[var(--radius-pill)] px-4 py-2 type-caption transition-opacity hover:opacity-70"
            style={{ color: faint }}
          >
            暂不需要
          </button>
        </div>
      </div>
    </div>
  );
}
