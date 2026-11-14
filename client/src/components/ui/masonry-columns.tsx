/**
 * 瀑布流（等宽列、高度随图片自适应）—— 灵感专题页与画布灵感弹窗共用。
 *
 * 🔒 2026-11-14 用户要求：灵感模板预览容器「宽度不变、高度完全自适应图片」，让整张图完整可见。
 *
 * 为什么不用 CSS `columns`：
 *   CSS 多列是「先竖着排满第一列再排第二列」，点「加载更多」时已有卡片会整体跨列重排，
 *   用户刚看到的图会跳到别处。这里改为**按顺序轮流分配到各列**（第 i 张进第 i % N 列），
 *   追加时老卡片位置不动，阅读顺序仍是从左到右。
 *
 * 列数按**容器自身宽度**断点计算（不是窗口宽度）：同一组件放进 980px 的弹窗和全宽页面都对。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MasonryBreakpoint = { minWidth: number; columns: number };

export type MasonryColumnsProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** 按 minWidth 升序；容器宽度 ≥ minWidth 时取对应列数。 */
  breakpoints: MasonryBreakpoint[];
  /** 列间距 / 卡片纵向间距（px）。 */
  gap?: number;
  className?: string;
};

export function resolveMasonryColumnCount(width: number, breakpoints: MasonryBreakpoint[]): number {
  let columns = 1;
  for (const bp of breakpoints) {
    if (width >= bp.minWidth) columns = bp.columns;
  }
  return Math.max(1, columns);
}

/** 轮流分配：第 i 项进第 i % columnCount 列，保证追加时已有项不换列。 */
export function distributeToColumns<T>(items: T[], columnCount: number): Array<Array<{ item: T; index: number }>> {
  const count = Math.max(1, columnCount);
  const columns: Array<Array<{ item: T; index: number }>> = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    columns[index % count].push({ item, index });
  });
  return columns;
}

export function MasonryColumns<T>({
  items,
  getKey,
  renderItem,
  breakpoints,
  gap = 16,
  className,
}: MasonryColumnsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(() =>
    resolveMasonryColumnCount(typeof window === "undefined" ? 0 : window.innerWidth, breakpoints)
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setColumnCount(resolveMasonryColumnCount(el.clientWidth, breakpoints));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
    // breakpoints 通常是模块级常量；序列化后比较，避免调用方内联数组导致反复重建观察器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(breakpoints)]);

  const columns = distributeToColumns(items, columnCount);

  return (
    <div
      ref={containerRef}
      data-masonry-columns={columnCount}
      className={className}
      style={{ display: "flex", alignItems: "flex-start", gap }}
    >
      {columns.map((column, columnIndex) => (
        <div
          key={columnIndex}
          style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap }}
        >
          {column.map(({ item, index }) => (
            <div key={getKey(item, index)}>{renderItem(item, index)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
