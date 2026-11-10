import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../shared/strip-source-comments";

const raw = readFileSync(resolve(__dirname, "WorkspaceDashboard.tsx"), "utf8");
const source = stripSourceComments(raw);

function slice(from: string, to: string): string {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + from.length);
  expect(a, `找不到起点 ${from}`).toBeGreaterThan(-1);
  expect(b, `找不到终点 ${to}`).toBeGreaterThan(a);
  return source.slice(a, b);
}

/** 只切 CardMenu 自身，避免整文件 toContain 恒绿。 */
const cardMenu = slice("function CardMenu(", "function EmptyCover(");

describe("工作台画板卡片「…」菜单", () => {
  it("剥注释没有把源码吃掉（检测器自检）", () => {
    assertStripKeptSource(raw, source, 0.3);
  });

  /**
   * 2026-11-10 用户报「未归类画板菜单被截断，放置在容器上层」。
   * 原实现是卡片内的 absolute + bottom:100%，被卡片 / 封面 / 滚动区
   * 的 overflow 裁掉顶部；z-index 救不了 overflow 裁剪。
   */
  it("菜单 portal 到 body 并用 fixed 视口坐标，不再当卡片子元素", () => {
    expect(cardMenu).toContain("createPortal(menu, document.body)");
    expect(cardMenu).toContain('position: "fixed"');
    expect(cardMenu).toContain("zIndex: 9999");
    expect(cardMenu).not.toContain('bottom: "calc(100% + 6px)"');
    expect(cardMenu).not.toContain('className="absolute z-[60]');
  });

  /** fixed 不跟随滚动；capture=true 才能收到内部滚动容器的 scroll。 */
  it("滚动 / 窗口变化时重新定位，首帧量到尺寸前先不显示", () => {
    expect(cardMenu).toContain('addEventListener("scroll", place, true)');
    expect(cardMenu).toContain('addEventListener("resize", place)');
    expect(cardMenu).toContain("getBoundingClientRect()");
    expect(cardMenu).toContain("visibility: position ?");
    expect(cardMenu).toContain("fitsAbove");
  });

  /** portal 后 DOM 上不再是父子，点外部关闭必须同时认按钮和菜单。 */
  it("点外部关闭与冒泡拦截在 portal 后仍然成立", () => {
    expect(cardMenu).toContain("triggerRef.current?.contains(target)");
    expect(cardMenu).toContain("menuRef.current?.contains(target)");
    // React portal 的事件沿 React 树冒泡，仍会冒到画板卡片的 onClick 上。
    expect(cardMenu).toContain("onMouseDown={event => event.stopPropagation()}");
    expect(cardMenu).toContain("onClick={event => event.stopPropagation()}");
  });
});
