import { isAiBillingBlockedMessage } from "@shared/ai-credit-policy";

/**
 * 服务端 402 计费拦截的前端派发契约。
 *
 * 【为什么单独一个文件】
 * 客户端有两套互不相识的 HTTP 层：`ai.ts`（画布/生图）和
 * `ai-client.ts`（编排/品牌包）。402 的处理逻辑若在两边各写一份，
 * 迟早会漂成两套 —— 比如一边认 `code` 另一边认 `errorCode`，
 * 结果就是「某些 AI 功能缺积分时不弹窗，只是静默失败」。
 *
 * 这里放的是**唯一定义**，两边都从这里取。
 */

/** 服务端 shared/admin-store.ts 的 AiBillingErrorCode 镜像。 */
export type AiBillingErrorCode = "NO_SUBSCRIPTION" | "INSUFFICIENT_BALANCE";

/**
 * 「本次失败是计费拦截」的判定 —— 供**已经知道失败、但只拿到文案**的调用方使用。
 *
 * 【为什么需要它】
 * 画布在请求发出前就把占位节点插进了画布，402 回来后要把这些节点撤掉。
 * 但那 15 处 catch 只往上传了 `error.message`，拿不到 402 的 code，
 * 于是只能按文案反查。文案本身在 shared 里定义，服务端也引用同一份，
 * 所以这里不是「猜字符串」，而是读同一个常量。
 *
 * ⚠️ 只用它来决定「撤不撤占位节点」这种**可逆的视觉收尾**。
 *    真要区分跳订阅页还是跳充值页，必须用 402 响应里的 `code`（见
 *    emitInsufficientCredits / InsufficientCreditsDialog）。
 */
export function isAiCreditBlockedMessage(message?: string | null): boolean {
  return isAiBillingBlockedMessage(message);
}

export const AI_INSUFFICIENT_CREDITS_EVENT = "artx:insufficient-credits";

export type InsufficientCreditsDetail = {
  code: AiBillingErrorCode;
  requiredCredits: number;
  availableCredits: number;
};

/** 服务端 402 响应体。其余字段照常透传，不影响既有调用方。 */
export type AiBillingErrorPayload = {
  error?: string;
  message?: string;
  code?: AiBillingErrorCode;
  requiredCredits?: number;
  availableCredits?: number;
};

/**
 * 把 402 响应转成全局事件。非 402 的 payload 会被静默忽略。
 *
 * 【为什么走事件而不是返回值 / Error 子类】
 * 全站 AI 调用点有十几处，每处都自己 try/catch 再 toast（见 InfiniteCanvas），
 * 没有任何统一出口。改成逐处改造既容易漏，又会在下一处新调用点上再次漏掉。
 *
 * 用 window 事件是项目里**已有**的范式：`artx:login-required` 就是这么走通的
 * （ai.ts 派发，AuthContext 监听）。照抄一次即可零侵入覆盖所有调用点。
 *
 * 📌 于是弹窗只需要一个监听者，新增 AI 功能自动继承这条保护。
 */
export function emitInsufficientCredits(payload: AiBillingErrorPayload) {
  if (typeof window === "undefined") return;
  const code = payload?.code;
  if (code !== "NO_SUBSCRIPTION" && code !== "INSUFFICIENT_BALANCE") return;
  const detail: InsufficientCreditsDetail = {
    code,
    requiredCredits: Number(payload.requiredCredits) || 0,
    availableCredits: Number(payload.availableCredits) || 0,
  };
  window.dispatchEvent(new CustomEvent<InsufficientCreditsDetail>(AI_INSUFFICIENT_CREDITS_EVENT, { detail }));
}
