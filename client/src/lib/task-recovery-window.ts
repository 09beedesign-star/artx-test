/**
 * 未完成任务恢复提示的「2 分钟窗口 + 只提示一次」判据（2026-10-18）。
 *
 * 用户拍板：再次进入工作台 / 智能产品 / 电商画布后 2 分钟内提示一次。
 *
 * ⚠️ 「只提示一次」按**任务批次**算，不按标签页算：
 *    sessionStorage 刷新后仍在，如果只存一个 "true"，同一个标签页第二次
 *    中断时就永远不会再提示（零报错）。所以存的是这批未完成任务 id 的签名，
 *    同一批任务只提示一次，出现新的未完成任务会再提示。
 */
export const RECOVERY_PROMPT_WINDOW_MS = 120_000;

const PROMPTED_KEY_PREFIX = "artx:recovery-prompted:";

/** 页面加载后 2 分钟内为 true */
export function isInRecoveryWindow(pageLoadTime: number, now = Date.now()): boolean {
  return now - pageLoadTime <= RECOVERY_PROMPT_WINDOW_MS;
}

/** 一批任务 id 的稳定签名（与顺序无关） */
export function recoveryBatchSignature(taskIds: string[]): string {
  return Array.from(new Set(taskIds)).sort().join("|");
}

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 这一批任务在本会话是否已经提示过 */
export function hasPromptedThisSession(scope: string, signature: string): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  return storage.getItem(`${PROMPTED_KEY_PREFIX}${scope}`) === signature;
}

/** 记录这一批任务已经提示过 */
export function markPromptedThisSession(scope: string, signature: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(`${PROMPTED_KEY_PREFIX}${scope}`, signature);
  } catch {
    // 存储满/隐私模式：最坏情况是多提示一次，不影响功能
  }
}
