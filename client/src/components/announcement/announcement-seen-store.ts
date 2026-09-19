/**
 * 「这一期公告是否已经看过」的读写。
 *
 * 存的是**看过的公告 id**，不是布尔值 ——
 * 这样换弹窗（改 announcement-content.ts 里的 id）时，
 * 老用户的记录自动不匹配，会重新看到新一期，不需要任何迁移代码。
 *
 * ⚠️ 只写 localStorage，不碰 sessionStorage：
 *    公告是「这台设备已经看过」的长期状态，不该关标签页就重来。
 *
 * ⚠️ 隐私模式下 localStorage 可能直接抛错。
 *    读失败时必须返回 false（= 显示弹窗），而不是 true。
 *    返回 true 会让整个公告在隐私模式下静默消失，且没有任何报错可查。
 */

const ANNOUNCEMENT_SEEN_KEY = "artx:announcement-seen-id";

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
