import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_CANVAS_STAGGER_OFFSET,
  ensureCanvasStaggerOffset,
  isCanvasPositionFullyOverlapping,
} from "./canvas-placement";

/**
 * 【2026-09-13】用户三条画布规则：
 *   1. 生成图片时视角自动居中到新图（生成中也要居中）
 *   2. 新图置顶，不被已有图覆盖
 *   3. 新图与已有图不能完全重叠，横纵各错开 ≥10px
 *
 * ⚠️ 纯函数测试只能证明「算法对」，证明不了「有没有被接上」。
 * 所以下半部分必须有源码接线断言 + 变异验证。
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
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

  it("规则1：pending 占位阶段就居中，不等出图", () => {
    const source = stripComments(readCanvasSource());
    expect(source).toContain("const focusGeneratedImageNodes = useCallback");
    expect(source).toContain("fitView({");
    // 占位节点的 id 规则必须和居中时构造的 id 一致，否则 fitView 找不到目标。
    expect(source).toContain("`generated-${generationId}-${index}`");
    /*
     * 匹配「带左括号」的出现：定义处 `= useCallback(` 不带、依赖数组里也不带，
     * 所以这里数到的就是**两个真实调用点**：
     *   pending 占位插入后 1 次、completed 出图后 1 次。
     * 出图后必须再对一次焦，因为节点尺寸从占位框变成了图片实际尺寸。
     */
    const calls = source.match(/focusGeneratedImageNodes\(\s*\n?\s*(?!\))/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("规则1：居中函数进了 useEffect 依赖数组", () => {
    const source = stripComments(readCanvasSource());
    const effectTail = source.match(
      /window\.removeEventListener\("image-generator-submit"[\s\S]{0,400}/
    )?.[0];
    expect(effectTail).toBeTruthy();
    // 漏掉依赖 → 闭包捕获旧函数 → 自动居中静默失效且零报错。
    expect(effectTail).toContain("focusGeneratedImageNodes");
  });

  it("规则1：自动居中只移视角，不抢用户的选中状态", () => {
    const source = stripComments(readCanvasSource());
    const focusFn = source.match(
      /const focusGeneratedImageNodes = useCallback[\s\S]*?\n  \);/
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
