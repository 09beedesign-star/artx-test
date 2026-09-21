/**
 * ── 首页公告「要不要弹」的唯一事实源 ──────────────────────────────
 *
 * 这里有**两个独立的状态**，优先级不同，别把它们混成一个：
 *
 *   ① 已读记录 `artx:announcement-seen-id`
 *      存的是看过的公告 id（不是布尔值）。换弹窗时只要改
 *      announcement-content.ts 里的 id，老用户记录自动不匹配 → 重新触达，
 *      不需要任何迁移代码。
 *
 *   ② 强制待弹标记 `artx:announcement-force-pending`
 *      每次登录 / 注册成功时打上。**优先级高于 ①** ——
 *      只要它在，哪怕用户已经看过一百遍，首页也必须弹。
 *
 * ── 为什么必须是「正向标记」而不是「清掉已读记录」（产品定稿 2026-09-19）──
 * 产品要求是**强硬规则**：每次登录、每次注册之后，首页一定要弹。
 * 早期实现靠登录时 `resetAnnouncementSeen()` 间接达成，问题是它很脆：
 * 清完之后，只要**任何**代码路径再写一次已读（比如同一轮里先弹过一次、
 * 或将来有人加了「预加载时标记已读」之类的逻辑），弹窗就被静默吃掉，
 * 而且完全不报错，线上只会表现为「有的人登录后不弹」。
 * 正向标记则相反：它是一个必须被**显式消费**掉的待办，
 * 中间无论谁写了多少次已读记录都盖不住它。
 *
 * ⚠️ 只写 localStorage，不碰 sessionStorage：
 *    公告是「这台设备的状态」，不该关个标签页就重来。
 *    强制标记同理 —— 用户可能在登录后新开标签页才回到首页。
 *
 * ⚠️ 隐私模式下 localStorage 可能直接抛错。
 *    所有读取失败都必须倒向「弹」（已读返回 false / 待弹返回 true 的那一侧），
 *    倒向「不弹」会让公告在隐私模式下静默消失，且没有任何报错可查。
 */

const ANNOUNCEMENT_SEEN_KEY = "artx:announcement-seen-id";

/** 强制待弹标记：登录 / 注册成功时写入，首页消费后清除 */
const ANNOUNCEMENT_FORCE_KEY = "artx:announcement-force-pending";

export function hasSeenAnnouncement(announcementId: string): boolean {
  if (typeof window === "undefined") return true; // SSR 阶段不弹
  try {
    return window.localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) === announcementId;
  } catch {
    return false;
  }
}

export function markAnnouncementSeen(announcementId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, announcementId);
  } catch {
    /* 存不下就下次再弹一遍，比直接报错给用户好 */
  }
}

/** 调试用：在控制台执行后刷新即可重新看到弹窗 */
export function resetAnnouncementSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANNOUNCEMENT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

/* ───────────────── 强制待弹标记 ───────────────── */

/**
 * 打上「下次进首页必须弹」的标记。
 * 由 AuthContext 在**每一条**登录 / 注册成功路径上调用。
 */
export function markAnnouncementForcePending(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANNOUNCEMENT_FORCE_KEY, "1");
  } catch {
    /* 存不下也没关系：同一轮里还有事件广播兜底，见 requestAnnouncementReplay */
  }
}

/**
 * 是否存在强制待弹标记。
 *
 * ⚠️ 读失败时返回 **false**（而不是 true）。
 *    这一条和 hasSeenAnnouncement 的「失败倒向弹」看似矛盾，其实一致：
 *    两者都倒向「不要因为存储异常而改变原有判断」——
 *    已读读不到就当没读过（弹），强制标记读不到就当没打标（走常规判断）。
 *    若这里返回 true，隐私模式下会变成**每次刷新首页都弹**，用户无法关掉。
 */
export function hasAnnouncementForcePending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANNOUNCEMENT_FORCE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 消费掉强制待弹标记（首页真正把弹窗打开之后调用）。
 *
 * ⚠️ 必须在「已经决定要弹」之后才清，不能在读取时顺手清。
 *    读取即清除会让 React 严格模式的双次渲染吃掉标记 ——
 *    第一次读到并清掉，第二次读到的就是空，弹窗时有时无且零报错。
 */
export function clearAnnouncementForcePending(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANNOUNCEMENT_FORCE_KEY);
  } catch {
    /* ignore */
  }
}

/* ───────────────── 登录 / 注册后的重放 ───────────────── */

/**
 * 「登录 / 注册成功后必须再弹一次」的广播事件名。
 *
 * ⚠️ 光有 localStorage 标记是不够的。登录面板就开在首页上，
 *    打标记时 HomePage 已经挂载完毕，不会重新跑那次惰性初始化 ——
 *    表现为「登录成功了但公告没出来，刷新一下才有」，且零报错。
 *    所以打完标记必须再广播一次，让首页当场把弹窗打开。
 */
export const ANNOUNCEMENT_REPLAY_EVENT = "artx:announcement-replay";

/**
 * 请求重放公告：每次登录 / 注册成功后调用（强硬规则，无条件执行）。
 *
 * 做两件事，**缺一不可**，因为它们覆盖的是两条完全不同的路径：
 *   1. 打强制标记 —— 覆盖「登录后跳转 / 刷新 / 新开标签页才回首页」
 *   2. 广播事件   —— 覆盖「本来就停在首页登录，组件已挂载」
 *
 * ⚠️ 别因为「事件已经能弹了」就删掉标记，也别反过来。
 *    删任意一条都会漏掉一半用户，且这半边永远不报错。
 */
export function requestAnnouncementReplay(): void {
  if (typeof window === "undefined") return;
  markAnnouncementForcePending();
  try {
    window.dispatchEvent(new Event(ANNOUNCEMENT_REPLAY_EVENT));
  } catch {
    /* 事件派发失败不影响登录主流程；标记已写，下次进首页仍会弹 */
  }
}
