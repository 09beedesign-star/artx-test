/**
 * 画布节点落位规则的唯一事实源。
 *
 * 【2026-09-13 新建】用户规则：新生成的图片不能和已有图片**完全重叠**，
 * 必须在横向、纵向两个轴上都至少错开 10px。
 *
 * ⚠️ 为什么不放在 InfiniteCanvas.tsx 里：
 * 生成链路有两个插入点（pending 占位 / completed 兜底新建），
 * 且原先 `shouldUseFixedGeneratedPlacement` 会让带 placement 的链路和多图生成
 * **完全绕过**防重叠 —— 这是典型的「同一份数据多个出口」。
 * 抽成可单测的纯函数，才能用测试锁住所有出口都接上了。
 */

/** 新图与已有图在单个轴上必须拉开的最小距离（像素）。 */
export const MIN_CANVAS_STAGGER_OFFSET = 10;

export type CanvasPoint = { x: number; y: number };

/**
 * 判断两个落点是否构成「完全重叠」。
 *
 * ⚠️⚠️ 判定是 **AND 不是 OR**，这是本模块最容易写错的地方：
 *
 * 只有当 x 和 y **两个轴同时**都没拉开 10px 时，才算完全重叠。
 * 如果写成 OR（任一轴不足 10px 就算重叠），会把**多图生成的横排布局**判成冲突 ——
 * 多图是刻意共用同一个 y、只在 x 上按 `size.w + 20` 排开的，
 * 此时 dy === 0，OR 语义会把整排图逐个往下推，直接毁掉横排。
 *
 * 用户的原话是「避免图片的完全重叠」，要治的是「新图精准盖在老图上、
 * 看起来像凭空消失了」这个症状，不是要求任意两图都不共线。
 */
export function isCanvasPositionFullyOverlapping(
  a: CanvasPoint,
  b: CanvasPoint,
  minOffset: number = MIN_CANVAS_STAGGER_OFFSET
): boolean {
  return Math.abs(a.x - b.x) < minOffset && Math.abs(a.y - b.y) < minOffset;
}

/**
 * 把落点推开，直到它与任何已有落点都不构成完全重叠。
 *
 * 推的方向固定为右下（+x, +y），和画布上「新内容往右下堆叠」的视觉习惯一致。
 * 每次都基于**被撞到的那个节点**来算新坐标（而不是盲目 +10），
 * 这样一次就能跨过它，不会在同一个节点旁边反复试探。
 *
 * @param desired 期望落点
 * @param occupied 画布上已有节点的落点
 * @param minOffset 单轴最小错开距离，默认 10px
 */
export function ensureCanvasStaggerOffset(
  desired: CanvasPoint,
  occupied: CanvasPoint[],
  minOffset: number = MIN_CANVAS_STAGGER_OFFSET
): CanvasPoint {
  if (!occupied.length) return { ...desired };

  let result = { ...desired };
  // 上限保护：画布节点再多也不该推这么多次，防止异常数据导致死循环。
  const maxAttempts = occupied.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = result;
    const collided = occupied.find(point =>
      isCanvasPositionFullyOverlapping(current, point, minOffset)
    );
    if (!collided) return result;
    result = {
      x: collided.x + minOffset,
      y: collided.y + minOffset,
    };
  }

  return result;
}

export type CanvasSize = { w: number; h: number };

/**
 * 算出一个节点的几何中心，供 `setCenter` 直接使用。
 *
 * 【2026-09-13 新增】⚠️⚠️ 这个函数存在的理由，是 `fitView` 在「提交提示词的那一刻」
 * **根本不生效**，而且零报错：
 *
 * `@xyflow/system` 的 `getFitViewNodes()` 里有这么一行：
 *     const isVisible = n.measured.width && n.measured.height && (...)
 * 也就是说 **fitView 只认已经被浏览器量过尺寸的节点**。
 * 占位节点是刚 setNodes 插进去的，这一帧还没被 ResizeObserver 测量，
 * `measured.width` 是 undefined → 节点被过滤掉 → 传给 fitView 的集合是空的。
 *
 * 而空集合的下场（`getInternalNodesBounds()`）：
 *     return hasVisibleNodes ? boxToRect(box) : { x: 0, y: 0, width: 0, height: 0 };
 * 返回一个**全零矩形**，fitView 照常把视角挪过去、Promise 正常 resolve、
 * 不抛错也不警告 —— 表现就是「提交时画面没反应，等图出来了才跳过去」。
 *
 * 📌 `requestAnimationFrame` 救不了：rAF 只等到 React 提交 DOM，
 * 而 `measured` 要等 ResizeObserver 回调，是更晚的一拍。
 *
 * 所以这里改用坐标驱动：位置和尺寸在插入占位节点时我们**本来就已经算出来了**，
 * 直接换算成中心点交给 `setCenter`，完全不依赖测量结果。
 */
export function getCanvasNodeCenter(
  position: CanvasPoint,
  size: CanvasSize
): CanvasPoint {
  return {
    x: position.x + size.w / 2,
    y: position.y + size.h / 2,
  };
}
