import { toast } from "sonner";
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

/**
 * 弹窗需要的全部信息 —— 只有 code。
 * ⚠️ 刻意不含积分数额（产品决策 2026-09-19：不向用户披露单次消耗）。
 *    服务端 402 仍返回它们（后台对账用），故闸门在前端解析处。
 *    判据与变异自证见 insufficient-credits-dialog.test.ts。
 */
export type InsufficientCreditsDetail = {
  code: AiBillingErrorCode;
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
  // ⚠️ 只取 code：两个数额到此为止，不进事件也不进 React state。
  const detail: InsufficientCreditsDetail = { code };
  window.dispatchEvent(new CustomEvent<InsufficientCreditsDetail>(AI_INSUFFICIENT_CREDITS_EVENT, { detail }));
}

/**
 * AI 请求失败的**统一 toast 出口**。
 *
 * 【为什么不能在缺积分时再弹一条失败提示】
 * catch 里的 toast 与 `emitInsufficientCredits` 弹窗是两条独立的链路，
 * 它们都看到了同一个错误。于是在缺积分时，用户看到的是：
 * 屏幕中间一个「去充值」弹窗，旁边还挂一条「图像生成失败 · 当前可用积分不足…」。
 * 后者会把「账户没钱」这件**用户能解决**的事，说成「系统出故障」这种
 * 用户无从下手的事 —— 而且两个提示并列时，真正要紧的弹窗反而像附属说明。
 *
 * 所以这里判定命中计费拦截就**静默**，把话留给弹窗一个人说。
 * 判定与「撤占位框」用的是同一个 isAiCreditBlockedMessage：同一句文案，同一个结论。
 *
 * ⚠️ 只用于「错误来自 AI 请求」的失败提示。参数校验类失败
 *   （"当前图片没有可处理的图像来源"之类）不要走这里，那些该照常显示。
 */
export function notifyAiFailure(title: string, message: string) {
  if (isAiCreditBlockedMessage(message)) return;
  toast(title, { description: message });
}
