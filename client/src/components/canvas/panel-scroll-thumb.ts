/**
 * 画布浮层面板「自绘滚动滑杆」的几何唯一事实源。
 *
 * ════════════════════════════════════════════════════════════════
 * 为什么要自己画一根滑杆
 * ════════════════════════════════════════════════════════════════
 *
 * 面板正文区写了 `overflowY: "auto"`，**内容确实能滚**，但 macOS 的原生
 * 滚动条是 overlay 式的：不滚动时它完全隐形。面板高度被 `maxHeight` 钉死，
 * 而反推出来的提示词动辄几百字 —— 用户看到的就是「最后一行被切掉一半，
 * 且没有任何可以往下看的提示」，于是以为内容丢了。
 *
 * ⚠️ 这里的坑是：**「能滚」和「看得出能滚」是两回事**，而且前者成立时
 *    后者不成立不会有任何报错，只能靠人眼发现。所以滑杆必须常驻可见，
 *    并且在「内容没超出」时以低透明度显示（而不是消失），这样用户永远
 *    知道这个区域是可滚的。
 *
 * ════════════════════════════════════════════════════════════════
 * 为什么抽成纯函数放在单独文件
 * ════════════════════════════════════════════════════════════════
 *
 * 1. 文字提取面板与提示词反推面板用的是**同一套**滑杆。以前只有前者有，
 *    后者没有；如果这次再复制一份公式过去，就等于给同一份逻辑开了第二个
 *    出口 —— 以后改一处漏一处（本项目已经在这个模式上栽过十几次）。
 * 2. 本项目 vitest 跑在 `environment: "node"`，组件渲染测不了。
 *    把几何算式抽成不依赖 React / DOM 的纯函数，是让它能被**真正断言**
 *    （而不是只能写源码字符串断言）的唯一办法。
 */

/**
 * 轨道相对滚动容器上下各留的空白之和。
 *
 * ⚠️ 必须与 JSX 里轨道的 `top-2 bottom-2`（各 8px）保持一致。
 *    两边对不上时，滑杆会在轨道尽头差几像素停住 —— 拖到底了但内容还没到底，
 *    零报错，只是手感诡异。
 */
export const PANEL_SCROLL_TRACK_INSET = 16;

/**
 * 滑杆最小高度。
 *
 * ⚠️ 内容特别长时按比例算出来的高度会趋近 0，滑杆变成一条看不见也抓不住的线。
 *    26px 是保证还能用鼠标准确按住的下限。
 */
export const PANEL_SCROLL_MIN_THUMB_HEIGHT = 26;

export type PanelScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export type PanelScrollThumb = {
  top: number;
  height: number;
  /** 内容可滚动的总距离；为 0 表示内容没超出，滑杆只作占位提示。 */
  maxScroll: number;
};

export const EMPTY_PANEL_SCROLL_THUMB: PanelScrollThumb = {
  top: 0,
  height: PANEL_SCROLL_MIN_THUMB_HEIGHT,
  maxScroll: 0,
};

/**
 * 由容器的滚动度量算出滑杆的位置与高度。
 *
 * ⚠️ `maxScroll` 为 0 时 `top` 必须返回 0：此时除法的分母是 0，
 *    不特判会得到 NaN，而 NaN 写进 style.top 会被浏览器静默忽略 ——
 *    滑杆停在上一帧的位置不动，看起来像"卡住了"。
 */
export function computePanelScrollThumb(
  metrics: PanelScrollMetrics
): PanelScrollThumb {
  const clientHeight = Math.max(0, metrics.clientHeight);
  const scrollHeight = Math.max(0, metrics.scrollHeight);
  const trackHeight = Math.max(1, clientHeight - PANEL_SCROLL_TRACK_INSET);
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const height =
    maxScroll && scrollHeight > 0
      ? Math.max(
          PANEL_SCROLL_MIN_THUMB_HEIGHT,
          Math.round((clientHeight / scrollHeight) * trackHeight)
        )
      : PANEL_SCROLL_MIN_THUMB_HEIGHT;
  const maxTop = Math.max(0, trackHeight - height);
  const scrollTop = Math.max(0, Math.min(maxScroll, metrics.scrollTop));
  const top = maxScroll ? Math.round((scrollTop / maxScroll) * maxTop) : 0;
  return { top, height, maxScroll };
}

/**
 * 拖动滑杆 → 容器应该滚到的 scrollTop。
 *
 * ⚠️ `maxTop` 夹到至少 1：滑杆高度等于轨道高度（内容刚好不超出）时
 *    分母会是 0，不夹就是 Infinity，一拖就跳到底。
 */
export function resolvePanelScrollTopFromThumb(params: {
  trackHeight: number;
  thumbHeight: number;
  desiredThumbTop: number;
  maxScroll: number;
}): number {
  const trackHeight = Math.max(1, params.trackHeight);
  const maxTop = Math.max(1, trackHeight - params.thumbHeight);
  const nextTop = Math.max(0, Math.min(maxTop, params.desiredThumbTop));
  return (nextTop / maxTop) * Math.max(0, params.maxScroll);
}
