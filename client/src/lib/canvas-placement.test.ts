import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_CANVAS_STAGGER_OFFSET,
  ensureCanvasStaggerOffset,
  getCanvasNodeCenter,
  isCanvasPositionFullyOverlapping,
} from "./canvas-placement";
// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import { stripSourceComments } from "../../../shared/strip-source-comments";

/**
 * 【2026-09-13】用户三条画布规则：
 *   1. 生成图片时视角自动居中到新图（生成中也要居中）
 *   2. 新图置顶，不被已有图覆盖
 *   3. 新图与已有图不能完全重叠，横纵各错开 ≥10px
 *
 * ⚠️ 纯函数测试只能证明「算法对」，证明不了「有没有被接上」。
 * 所以下半部分必须有源码接线断言 + 变异验证。
 */

/**
 * ⚠️⚠️ 这里原本自己抄了一份贪心的块注释正则，它会把 InfiniteCanvas.tsx 里
 * `"image/*"` 的 /* 当成块注释开头，一口吞掉 3.7% 的源码（约 4.4 万字符）。
 * 被吞掉的部分对断言而言不存在 → 扫到那段的反向断言恒绿。
 * 📌 判据：检测器坏掉时和「没问题」长得一模一样。统一走 shared 唯一事实源。
 */
function stripComments(source: string): string {
  return stripSourceComments(source).replace(/\{\s*\}/g, "");
}

function readCanvasSource(): string {
  return readFileSync(
    resolve(__dirname, "../components/canvas/InfiniteCanvas.tsx"),
    "utf-8"
  );
}

describe("stripComments 自证", () => {
  it("确实剥掉了注释，而不是原样返回", () => {
    const sample =
      'const a = 1; // ensureCanvasStaggerOffset\n/* ensureCanvasStaggerOffset */\nconst b = 2;';
    const stripped = stripComments(sample);
    expect(stripped.length).toBeLessThan(sample.length);
    expect(stripped).not.toContain("ensureCanvasStaggerOffset");
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });

  it("对真实画布源码也有效（含 JSX 注释）", () => {
    const raw = readCanvasSource();
    const stripped = stripComments(raw);
    expect(stripped.length).toBeLessThan(raw.length);
  });
});

describe("规则3：最小错开偏移（纯函数）", () => {
  it("阈值就是用户要求的 10 像素", () => {
    expect(MIN_CANVAS_STAGGER_OFFSET).toBe(10);
  });

  it("完全重叠判定是 AND 不是 OR", () => {
    // 两轴都不足 10px → 完全重叠
    expect(
      isCanvasPositionFullyOverlapping({ x: 100, y: 100 }, { x: 105, y: 103 })
    ).toBe(true);
    /*
     * ⚠️⚠️ 这条是本模块最关键的反向断言：
     * 只有 y 轴重合、x 轴差得很远时**不算**完全重叠。
     * 若判定写成 OR，多图生成的横排（刻意共用同一个 y）会被逐个往下推，
     * 整排布局直接被毁。
     */
    expect(
      isCanvasPositionFullyOverlapping({ x: 600, y: 100 }, { x: 100, y: 100 })
    ).toBe(false);
    expect(
      isCanvasPositionFullyOverlapping({ x: 100, y: 600 }, { x: 100, y: 100 })
    ).toBe(false);
  });

  it("恰好差 10px 不算重叠（边界）", () => {
    expect(
      isCanvasPositionFullyOverlapping({ x: 110, y: 110 }, { x: 100, y: 100 })
    ).toBe(false);
    expect(
      isCanvasPositionFullyOverlapping({ x: 109, y: 109 }, { x: 100, y: 100 })
    ).toBe(true);
  });

  it("空画布时落点原样返回", () => {
    expect(ensureCanvasStaggerOffset({ x: 42, y: 24 }, [])).toEqual({
      x: 42,
      y: 24,
    });
  });

  it("落点正好压在已有图上时，横纵各推开 10px", () => {
    const result = ensureCanvasStaggerOffset({ x: 100, y: 100 }, [
      { x: 100, y: 100 },
    ]);
    expect(result).toEqual({ x: 110, y: 110 });
    expect(Math.abs(result.x - 100)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(result.y - 100)).toBeGreaterThanOrEqual(10);
  });

  it("同一落点连续生成多次会阶梯式错开，不会叠成一摞", () => {
    const placed: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 5; i += 1) {
      placed.push(ensureCanvasStaggerOffset({ x: 100, y: 100 }, [...placed]));
    }
    expect(placed).toEqual([
      { x: 100, y: 100 },
      { x: 110, y: 110 },
      { x: 120, y: 120 },
      { x: 130, y: 130 },
      { x: 140, y: 140 },
    ]);
    // 任意两张图都不得完全重叠。
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(isCanvasPositionFullyOverlapping(placed[i], placed[j])).toBe(
          false
        );
      }
    }
  });

  it("多图横排布局不被误伤（共用 y、x 按步长排开）", () => {
    const step = 200;
    const placed: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4; i += 1) {
      const desired = { x: i * step, y: 0 };
      const actual = ensureCanvasStaggerOffset(desired, [...placed]);
      // 关键：横排的每一张都必须落在原本算好的位置，一毫米都不能挪。
      expect(actual).toEqual(desired);
      placed.push(actual);
    }
  });

  it("即使 occupied 有脏数据也会终止，不死循环", () => {
    const occupied = Array.from({ length: 200 }, () => ({ x: 0, y: 0 }));
    const result = ensureCanvasStaggerOffset({ x: 0, y: 0 }, occupied);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe("三条规则在画布里真的被接上了（接线断言）", () => {
  /*
   * ⚠️ 测纯函数 ≠ 测修复。下面断言的是「函数有没有被调用到正确的位置」，
   * 变异测试要能因为这些断言而变红。
   */

  it("规则3：生成链路的两个插入点都调用了 ensureCanvasStaggerOffset", () => {
    const source = stripComments(readCanvasSource());
    expect(source).toContain('from "@/lib/canvas-placement"');
    const calls = source.match(/ensureCanvasStaggerOffset\(/g) || [];
    /*
     * 生成链路有且只有两个插入点：
     *   :27047 pending 占位节点、:27270 completed 兜底新建。
     * 少于 2 说明漏接了一个出口 —— 本项目「同一份数据多个出口」的老毛病。
     */
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("规则3：写死 placement 的分支也必须过错开保护，不能直接用 desired", () => {
    const source = stripComments(readCanvasSource());
    /*
     * ⚠️⚠️ 核心反向断言。
     * 原代码是：
     *   const position = shouldUseFixedGeneratedPlacement ? desired : resolveNonOverlapping(...)
     * 只要带了 placement 或生成多于 1 张就完全绕过避让 ——
     * 而引申图/文案编辑/快捷编辑/图层分离全都带 placement。
     * 现在改成先算 basePosition，再统一过一层 ensureCanvasStaggerOffset。
     */
    expect(source).toContain("const basePosition =");
    expect(source).not.toMatch(
      /const position =\s*shouldUseFixedGeneratedPlacement\s*\?\s*desired/
    );
  });

  it("规则1：提交那一刻就居中，且**绝不能用 fitView**", () => {
    const source = stripComments(readCanvasSource());
    const focusFn = source.match(
      /const focusGeneratedImageCenter = useCallback[\s\S]*?\n  \);/
    )?.[0];
    expect(focusFn).toBeTruthy();

    /*
     * ⚠️⚠️ 本文件最重要的一条反向断言，锁的是一个**静默失效**的真实事故：
     *
     * `@xyflow/system` 的 getFitViewNodes() 里写着
     *     const isVisible = n.measured.width && n.measured.height && (...)
     * → fitView **只认已被浏览器测量过的节点**。
     *
     * 占位节点是刚 setNodes 插进去的，这一帧 measured 还是 undefined，
     * 会被整个过滤掉；而空集合在 getInternalNodesBounds() 里返回
     *     { x: 0, y: 0, width: 0, height: 0 }
     * fitView 于是「成功」执行、Promise 正常 resolve、不抛错不告警，
     * 但视角**根本没移到新图上** —— 用户看到的就是「提交没反应，
     * 等图出来了才跳过去」。
     *
     * requestAnimationFrame 救不了：rAF 早于 ResizeObserver 回调。
     * 所以这条链路必须用坐标驱动的 setCenter，不许退回 fitView。
     */
    expect(focusFn).not.toContain("fitView");
    expect(focusFn).toContain("setCenter(");
  });

  it("规则1：保持用户当前缩放，不擅自改变倍率", () => {
    const source = stripComments(readCanvasSource());
    const focusFn = source.match(
      /const focusGeneratedImageCenter = useCallback[\s\S]*?\n  \);/
    )?.[0];
    // 用户拍板：只平移、不缩放。手动调好的倍率不该被覆盖。
    expect(focusFn).toContain("zoom: getViewport().zoom");
  });

  it("规则1：中心点由坐标算出，不按 id 去查节点尺寸", () => {
    const source = stripComments(readCanvasSource());
    /*
     * 中心点必须来自「插入时已经算好的 position + size」。
     * 任何 getNode(id).measured 之类的做法在 pending 那一帧同样拿不到值。
     */
    const calls = source.match(/getCanvasNodeCenter\(/g) || [];
    /*
     * 三个对焦点：
     *   ① pending 新建占位节点后
     *   ② pending 复用已有占位节点时（刷新页面后重新挂载）
     *   ③ completed 出图后（尺寸从占位框变成图片实际尺寸，需重对）
     * 再加 completed 里「占位节点已不存在」的兜底新建分支，共 4 处。
     */
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("规则1：居中函数进了 useEffect 依赖数组", () => {
    const source = stripComments(readCanvasSource());
    const effectTail = source.match(
      /window\.removeEventListener\("image-generator-submit"[\s\S]{0,400}/
    )?.[0];
    expect(effectTail).toBeTruthy();
    // 漏掉依赖 → 闭包捕获旧函数 → 自动居中静默失效且零报错。
    expect(effectTail).toContain("focusGeneratedImageCenter");
  });

  it("规则1：自动居中只移视角，不抢用户的选中状态", () => {
    const source = stripComments(readCanvasSource());
    const focusFn = source.match(
      /const focusGeneratedImageCenter = useCallback[\s\S]*?\n  \);/
    )?.[0];
    expect(focusFn).toBeTruthy();
    /*
     * 生成是异步的，用户等待期间可能在操作别的节点，
     * 强行切走选中会打断他。这与「找回备份图」（用户主动点击，
     * 选中它才符合预期）语义不同，故刻意不复用 focusGeneratedImageNode。
     */
    expect(focusFn).not.toContain("setSelectedNodeIds");
    expect(focusFn).not.toContain("selected:");
  });

  it("规则1：pending 分支的对焦必须在 setNodes 之外执行", () => {
    const source = stripComments(readCanvasSource());
    /*
     * setNodes 的 updater 在 React 严格模式下会被调用两次，
     * 里面做副作用（移视角）会触发两次动画。
     * 所以中心点在 updater 内算好带出来，调用放在外面。
     */
    expect(source).toContain(
      "let pendingFocusCenter: { x: number; y: number } | null = null"
    );
    expect(source).toMatch(
      /if \(pendingFocusCenter\) \{\s*\n\s*focusGeneratedImageCenter\(pendingFocusCenter\);/
    );
  });
});

describe("规则1：中心点计算（纯函数）", () => {
  it("中心点 = 左上角 + 半个宽高", () => {
    expect(getCanvasNodeCenter({ x: 100, y: 200 }, { w: 400, h: 600 })).toEqual({
      x: 300,
      y: 500,
    });
  });

  it("负坐标同样正确（画布可以向左上无限延伸）", () => {
    expect(getCanvasNodeCenter({ x: -80, y: -40 }, { w: 160, h: 80 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("9:16 竖图的中心点按实际宽高算，不假设是方图", () => {
    // auto 比例现在默认 9:16，宽高不等，写死方图会算偏。
    const center = getCanvasNodeCenter({ x: 0, y: 0 }, { w: 360, h: 640 });
    expect(center).toEqual({ x: 180, y: 320 });
    expect(center.x).not.toBe(center.y);
  });

  it("规则2：新生成节点的 zIndex 取自 nextCanvasTopZ，保证在最上层", () => {
    const source = stripComments(readCanvasSource());
    const helper = source.match(/function nextCanvasTopZ[\s\S]*?\n}/)?.[0];
    expect(helper).toBeTruthy();
    // max(现有 zIndex) + 1 → 严格大于画布上任何已有节点。
    expect(helper).toContain("Math.max(");
    expect(helper).toContain(") + 1");

    // 生成链路三处（pending 占位 / 就地更新 / 兜底新建）都要置顶。
    const topZCalls = source.match(/nextCanvasTopZ\(nds\)/g) || [];
    expect(topZCalls.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("zIndex: topZ + index");
  });

  it("规则2：选中节点不自动提升层级的既有约定没被破坏", () => {
    const source = stripComments(readCanvasSource());
    // 这是刻意设计，改动本次规则时不能顺手打破。
    expect(source).toContain("elevateNodesOnSelect={false}");
  });
});
