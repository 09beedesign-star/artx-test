import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeFrameAutoArrange,
  pickGridColumns,
  sortNodesByReadingOrder,
  type FrameArrangeNode,
} from "../shared/frame-auto-arrange";

const FRAME = { x: 1000, y: 2000, width: 800, height: 600 };

function node(
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 150
): FrameArrangeNode {
  return { id, x, y, width, height };
}

/** 画板内边界（含默认 padding），用于断言"没有一张图越出画板" */
function frameBounds(padding: number) {
  return {
    left: FRAME.x + padding,
    top: FRAME.y + padding,
    right: FRAME.x + FRAME.width - padding,
    bottom: FRAME.y + FRAME.height - padding,
  };
}

describe("computeFrameAutoArrange", () => {
  it("把随手散落的图片排成规整网格：同一行 y 相同、同一列 x 相同", () => {
    const nodes = [
      node("a", 1234, 2456),
      node("b", 1701, 2033),
      node("c", 1050, 2333),
      node("d", 1600, 2500),
    ];
    const result = computeFrameAutoArrange(FRAME, nodes);

    expect(result.items).toHaveLength(4);
    expect(result.columns * result.rows).toBeGreaterThanOrEqual(4);

    // 按输出顺序切行：每 columns 个一行
    for (let row = 0; row < result.rows; row += 1) {
      const rowItems = result.items.slice(
        row * result.columns,
        (row + 1) * result.columns
      );
      const ys = new Set(rowItems.map(item => item.y));
      expect(ys.size).toBe(1); // 同一行严格等高对齐
    }
    for (let col = 0; col < result.columns; col += 1) {
      const colItems = result.items.filter(
        (_, index) => index % result.columns === col
      );
      const xs = new Set(colItems.map(item => item.x));
      expect(xs.size).toBe(1); // 同一列严格等左对齐
    }
  });

  it("规整前后不是恒等变换 —— 至少有一个节点真的被挪动了", () => {
    // 变异自证：如果实现被改成"原样返回"，上面的对齐断言可能仍然偶然通过，
    // 这一条专门挡住"什么都没做"这个满分解。
    const nodes = [
      node("a", 1234, 2456),
      node("b", 1701, 2033),
      node("c", 1050, 2333),
    ];
    const result = computeFrameAutoArrange(FRAME, nodes);
    const moved = result.items.filter(item => {
      const source = nodes.find(n => n.id === item.id)!;
      return item.x !== source.x || item.y !== source.y;
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it("所有节点排完后都落在画板内（不越界）", () => {
    const nodes = Array.from({ length: 9 }, (_, index) =>
      node(`n${index}`, 1000 + index * 37, 2000 + index * 53, 300, 240)
    );
    const result = computeFrameAutoArrange(FRAME, nodes, {
      padding: 20,
      gap: 10,
    });
    const bounds = frameBounds(20);
    for (const item of result.items) {
      expect(item.x).toBeGreaterThanOrEqual(bounds.left - 1);
      expect(item.y).toBeGreaterThanOrEqual(bounds.top - 1);
      expect(item.x + item.width).toBeLessThanOrEqual(bounds.right + 1);
      expect(item.y + item.height).toBeLessThanOrEqual(bounds.bottom + 1);
    }
  });

  it("padding 入参真的生效：留白越大，整体占用区域越小", () => {
    /*
     * 变异自证补漏：忽略 options.padding 直接用默认值时，坐标只是"更保守"，
     * 越界断言抓不到，测试会恒绿。
     *
     * ⚠️ 这里刻意**不**断言"padding 大则第一张图 x 更大"——那条不成立：
     * padding 变大 → 可用区变小 → 格子变小 → 图片在格内的居中偏移也变小，
     * 两个方向互相抵消，x 可能反而变小（实测 padding=4 得 1300、padding=120 得 1159）。
     * 真正单调的是**整体包围盒**：留白越大，所有图占用的矩形越小。
     */
    // 用超出格子的大图，保证尺寸被格子而不是原始尺寸决定
    const nodes = Array.from({ length: 4 }, (_, index) =>
      node(`n${index}`, 1000 + index * 29, 2000 + index * 37, 2000, 1500)
    );
    const boundingWidth = (padding: number) => {
      const result = computeFrameAutoArrange(FRAME, nodes, { padding, gap: 4 });
      const left = Math.min(...result.items.map(item => item.x));
      const right = Math.max(...result.items.map(item => item.x + item.width));
      return right - left;
    };
    const tight = boundingWidth(4);
    const loose = boundingWidth(120);
    expect(loose).toBeLessThan(tight);
    // 同时钉死绝对位置：没有任何一张图侵入 padding 留白区
    const result = computeFrameAutoArrange(FRAME, nodes, {
      padding: 120,
      gap: 4,
    });
    expect(Math.min(...result.items.map(item => item.x))).toBeGreaterThanOrEqual(
      FRAME.x + 120
    );
  });

  it("网格形状跟着图片宽高比走：全横图的列数少于全竖图", () => {
    /*
     * 变异自证补漏：把平均宽高比写死成 1 时，排布仍然整齐、仍然不越界，恒绿，
     * 但 6 张 16:9 的横图会被塞进 3 列窄格里，每张都被缩得很小 —— 用户看到的是
     * "规整了但图全变小了"。这条断言钉死"宽高比参与了列数决策"。
     */
    const wideNodes = Array.from({ length: 6 }, (_, index) =>
      node(`w${index}`, 1000 + index * 17, 2000 + index * 19, 640, 360)
    );
    const tallNodes = Array.from({ length: 6 }, (_, index) =>
      node(`t${index}`, 1000 + index * 17, 2000 + index * 19, 360, 640)
    );
    const wide = computeFrameAutoArrange(FRAME, wideNodes);
    const tall = computeFrameAutoArrange(FRAME, tallNodes);
    expect(wide.columns).toBeLessThan(tall.columns);
  });

  it("gap 入参真的生效：间距越大，单张图被压得越小", () => {
    // 变异自证补漏：忽略 options.gap 时结果仍然对齐、仍然不越界，恒绿。
    // 可用区固定，gap 越大留给图片的格子越小 —— 这是 gap 唯一可观测的后果。
    const nodes = Array.from({ length: 6 }, (_, index) =>
      node(`n${index}`, 1000 + index * 23, 2000 + index * 31, 2000, 2000)
    );
    const widthAt = (gap: number) =>
      computeFrameAutoArrange(FRAME, nodes, { padding: 20, gap }).items[0].width;
    expect(widthAt(80)).toBeLessThan(widthAt(4));
  });

  it("多张图必须分多列，不能退化成一条竖列", () => {
    // 变异自证补漏：列数恒为 1 时，"同一行 y 相同"这类对齐断言恒成立，
    // 但结果是一条又窄又长的竖列，用户看到的不是"规整"。
    const nodes = Array.from({ length: 9 }, (_, index) =>
      node(`n${index}`, 1000 + index * 31, 2000 + index * 41, 200, 200)
    );
    const result = computeFrameAutoArrange(FRAME, nodes);
    expect(result.columns).toBeGreaterThan(1);
    expect(result.rows).toBeGreaterThan(1);
    // 同一行内至少存在两个不同的 x（真的横向铺开了）
    const firstRow = result.items.slice(0, result.columns);
    expect(new Set(firstRow.map(item => item.x)).size).toBe(result.columns);
  });

  it("装得下的小图保持原尺寸，不会被放大撑满格子", () => {
    const nodes = [node("small", 1010, 2010, 60, 40), node("b", 1500, 2400)];
    const result = computeFrameAutoArrange(FRAME, nodes);
    const small = result.items.find(item => item.id === "small")!;
    expect(small.width).toBe(60);
    expect(small.height).toBe(40);
  });

  it("装不下的大图等比缩小（宽高比保持）", () => {
    const nodes = [
      node("huge", 1000, 2000, 2000, 1000),
      node("b", 1500, 2400),
      node("c", 1200, 2100),
      node("d", 1300, 2200),
    ];
    const result = computeFrameAutoArrange(FRAME, nodes);
    const huge = result.items.find(item => item.id === "huge")!;
    expect(huge.width).toBeLessThan(2000);
    // 原比例 2:1，允许 round 造成的 ±0.05 偏差
    expect(huge.width / huge.height).toBeCloseTo(2, 1);
  });

  it("保留阅读顺序：左上角的图规整后仍在左上角", () => {
    const nodes = [
      node("bottom-right", 1600, 2450),
      node("top-left", 1030, 2030),
      node("top-right", 1580, 2040),
      node("bottom-left", 1040, 2440),
    ];
    const result = computeFrameAutoArrange(FRAME, nodes);
    expect(result.items[0].id).toBe("top-left");
    expect(result.items[result.items.length - 1].id).toBe("bottom-right");
  });

  it("空画板返回空结果，调用方据此提示用户", () => {
    expect(computeFrameAutoArrange(FRAME, [])).toEqual({
      items: [],
      columns: 0,
      rows: 0,
    });
  });

  it("尺寸缺失/非法的节点被忽略，不会产出 NaN 坐标", () => {
    const nodes: FrameArrangeNode[] = [
      { id: "bad", x: 1, y: 2, width: 0, height: 0 },
      { id: "nan", x: 1, y: 2, width: Number.NaN, height: 100 },
      node("ok", 1100, 2100),
    ];
    const result = computeFrameAutoArrange(FRAME, nodes);
    expect(result.items.map(item => item.id)).toEqual(["ok"]);
    for (const item of result.items) {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
    }
  });

  it("单张图也能工作：居中在画板可用区域内", () => {
    const result = computeFrameAutoArrange(FRAME, [node("only", 1111, 2222)]);
    expect(result.columns).toBe(1);
    expect(result.rows).toBe(1);
    const item = result.items[0];
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    expect(centerX).toBeCloseTo(FRAME.x + FRAME.width / 2, 0);
    expect(centerY).toBeCloseTo(FRAME.y + FRAME.height / 2, 0);
  });

  it("画板尺寸缺失时回落到 800x600，不产出越界坐标", () => {
    const result = computeFrameAutoArrange(
      { x: 0, y: 0, width: 0, height: 0 },
      [node("a", 10, 10), node("b", 20, 20)]
    );
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x + item.width).toBeLessThanOrEqual(800);
      expect(item.y + item.height).toBeLessThanOrEqual(600);
    }
  });
});

describe("pickGridColumns", () => {
  it("横图为主时列数更少（避免把宽图塞进竖长条）", () => {
    const wide = pickGridColumns(6, 800, 600, 2);
    const tall = pickGridColumns(6, 800, 600, 0.5);
    expect(wide).toBeLessThan(tall);
  });

  it("列数始终在 1..count 之间", () => {
    for (const count of [1, 2, 5, 13, 40]) {
      const columns = pickGridColumns(count, 800, 600, 1);
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(columns).toBeLessThanOrEqual(count);
    }
  });
});

describe("sortNodesByReadingOrder", () => {
  it("y 只差几像素的两张图算同一行，按 x 排序", () => {
    const sorted = sortNodesByReadingOrder([
      node("right", 500, 103),
      node("left", 100, 100),
    ]);
    expect(sorted.map(n => n.id)).toEqual(["left", "right"]);
  });

  it("y 差距超过半个身高算换行，先上后下", () => {
    const sorted = sortNodesByReadingOrder([
      node("lower", 100, 400),
      node("upper", 500, 100),
    ]);
    expect(sorted.map(n => n.id)).toEqual(["upper", "lower"]);
  });
});

/*
 * ⚠️ 测纯函数 ≠ 测修复。
 *
 * 算法再对，只要按钮没挂上、或者挂上了但掉进「画布节点暂不支持」的兜底 toast，
 * 用户点下去就是没反应 —— 而且**零报错**。本项目已因「函数对了但没接上」踩过多次。
 * 下面这组扫的是接线，不是算法。
 */
describe("一键规整已真正接到画板命令条上", () => {
  const CANVAS_PATH = path.resolve(
    __dirname,
    "../client/src/components/canvas/InfiniteCanvas.tsx"
  );
  /** 只剥「整行都是注释」的行，避免贪婪正则吃掉真实代码。 */
  function stripLineComments(source: string) {
    return source
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
  }
  const raw = readFileSync(CANVAS_PATH, "utf8");
  const source = stripLineComments(raw);

  it("剥注释确实生效（自证，防止断言守着一份残缺源码）", () => {
    expect(raw.length).toBeGreaterThan(source.length);
  });

  it("画板命令条里有 arrange-frame 按钮", () => {
    const frameToolsBlock = source.slice(
      source.indexOf("const frameTools"),
      source.indexOf("const tools = mode ===")
    );
    expect(frameToolsBlock.length).toBeGreaterThan(0);
    expect(frameToolsBlock).toContain("arrange-frame");
    expect(frameToolsBlock).toContain("一键规整");
  });

  it("画板分支里有 arrange-frame 的处理，且排在兜底提示之前", () => {
    const handlerIndex = source.indexOf('action === "arrange-frame"');
    const fallbackIndex = source.indexOf("画布节点暂不支持该 AI 图片处理");
    expect(handlerIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(-1);
    // 顺序判据：处理分支必须先命中，否则按钮会被兜底 toast 吃掉
    expect(handlerIndex).toBeLessThan(fallbackIndex);
  });

  it("排布坐标来自共享算法，不是组件里另写一套", () => {
    expect(source).toContain(
      'import { computeFrameAutoArrange } from "@shared/frame-auto-arrange"'
    );
    expect(source).toContain("computeFrameAutoArrange(");
    // 组件里不应出现第二套网格计算（列数/单元格），否则就是双出口
    expect(source).not.toContain("Math.ceil(Math.sqrt(embedded.length))");
  });

  it("写回时同时更新 position 与 imgW/imgH（只改 style 会被尺寸归一化弹回）", () => {
    const handlerStart = source.indexOf('action === "arrange-frame"');
    const block = source.slice(handlerStart, handlerStart + 3000);
    expect(block).toContain("position: { x: layout.x, y: layout.y }");
    expect(block).toContain("imgW: layout.width");
    expect(block).toContain("imgH: layout.height");
  });

  it("规整会清掉越界裁剪状态，避免图挪回画板后还挂着 clipPath", () => {
    const handlerStart = source.indexOf('action === "arrange-frame"');
    const block = source.slice(handlerStart, handlerStart + 3000);
    expect(block).toContain("frameClipActive: false");
    expect(block).toContain("frameClipInsets: undefined");
  });

  it("改动前先入历史栈，用户能一步 Ctrl+Z 退回随手摆放", () => {
    const handlerStart = source.indexOf('action === "arrange-frame"');
    const block = source.slice(handlerStart, handlerStart + 3000);
    const historyIndex = block.indexOf("pushHistory(");
    const setNodesIndex = block.indexOf("setNodes(");
    expect(historyIndex).toBeGreaterThan(-1);
    expect(setNodesIndex).toBeGreaterThan(-1);
    expect(historyIndex).toBeLessThan(setNodesIndex);
  });

  it("画板里没有图片时给出明确提示，而不是静默无反应", () => {
    const handlerStart = source.indexOf('action === "arrange-frame"');
    const block = source.slice(handlerStart, handlerStart + 3000);
    expect(block).toContain("embedded.length === 0");
    expect(block).toContain("画板内没有图片");
  });
});
