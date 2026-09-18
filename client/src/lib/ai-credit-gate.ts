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
