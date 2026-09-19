/**
 * ── 阻断闸门（唯一事实源）──────────────────────────────────────
 *
 * 解决的问题：公告弹窗和新手引导都在「进入首页约 1 秒内」触发，
 * 而新手引导的 z-index 是 2147483600（见 OnboardingTour.tsx），
 * 必定盖在公告上面。两个都是「必须处理才能继续」的层，撞在一起时
 * 用户会看到引导气泡浮在公告上，非常混乱。
 *
 * 规则：**公告优先**。公告阻断期间，新手引导不自动播；
 * 公告关闭后闸门解除，引导照常开始。
 *
 * ⚠️ 这里必须带订阅（而不是只导出一个布尔量）。
 *    OnboardingProvider 的自动播放写在 useEffect 里，
 *    光改一个模块级变量不会让它重新执行 —— 引导会被永久吃掉，
 *    而且不报任何错，表现为「新手引导突然没了」。
 */

let blocking = false;
const listeners = new Set<() => void>();

export function isAnnouncementBlocking(): boolean {
  return blocking;
}

export function setAnnouncementBlocking(next: boolean): void {
  if (blocking === next) return;
  blocking = next;
  listeners.forEach(listener => listener());
}

export function subscribeAnnouncementBlocking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
