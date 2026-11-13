import { useCallback, useEffect, useState } from "react";

/**
 * 公告弹窗轮播（2026-11-13）：每 5 秒自动切到下一张，用户点锚点可手动切换。
 *
 * ⚠️ 为什么计时器单独放在这个 hook 里，而不是写进 AnnouncementModal.tsx：
 *    弹窗骨架有一条硬约束「不得有自动关闭定时器」（阻断式三要素之一），
 *    测试靠「骨架里没有 setTimeout / setInterval」来守。
 *    轮播的计时器只负责换页，**永远不碰 onClose** —— 放在这里，
 *    骨架那条守卫依然有效，本文件另有测试锁住「只换页、不关闭」。
 *
 * ⚠️ 手动点锚点后必须重新计时：否则用户刚点完，可能 0.1 秒后就被自动切走，
 *    看起来像「点了没反应」。实现方式是把 index 放进 effect 依赖 —— 每次换页都重建计时器。
 *
 * ⚠️ 只有一张时不起计时器（没东西可轮），弹窗关闭时（active=false）也不起。
 */
export const ANNOUNCEMENT_AUTOPLAY_MS = 5000;

export function useAnnouncementCarousel(count: number, active: boolean) {
  const [index, setIndex] = useState(0);

  // 每次重新打开都从第一张开始，避免停在上次关闭时那一张
  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  useEffect(() => {
    if (!active || count <= 1) return;
    const timer = window.setInterval(() => {
      setIndex(current => (current + 1) % count);
    }, ANNOUNCEMENT_AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [active, count, index]);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  // count 变小时（理论上不会，但防御一下）不让 index 越界
  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;
  return { index: safeIndex, goTo };
}
