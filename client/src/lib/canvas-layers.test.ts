import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { applyLayerDrop, buildLayerRows } from "./canvas-layers";

const n = (id: string, type: string, zIndex?: number, data: Record<string, unknown> = {}): Node =>
  ({ id, type, position: { x: 0, y: 0 }, data, ...(zIndex === undefined ? {} : { zIndex }) }) as Node;

describe("buildLayerRows", () => {
  it("最上层排最前，画板子项紧随画板且 depth=1", () => {
    const rows = buildLayerRows(
      [
        n("f1", "canvasFrame", 0, { title: "画板A" }),
        n("a1", "asset", 1, { embeddedInFrame: "f1" }),
        n("t1", "text", 2, { text: "你好" }),
      ],
      ["a1"]
    );
    expect(rows.map(r => [r.id, r.depth])).toEqual([
      ["t1", 0],
      ["f1", 0],
      ["a1", 1],
    ]);
    expect(rows.find(r => r.id === "a1")?.selected).toBe(true);
    expect(rows[0].name).toBe("你好");
  });

  it("无 zIndex 时按数组下标排序（与绘制顺序一致）", () => {
    const rows = buildLayerRows([n("x", "asset"), n("y", "asset"), n("z", "asset")], []);
    expect(rows.map(r => r.id)).toEqual(["z", "y", "x"]);
  });

  it("隐藏/锁定从 data 读出，幽灵节点不进列表", () => {
    const rows = buildLayerRows(
      [n("a", "asset", 0, { layerHidden: true, layerLocked: true }), n("__ghost__a", "asset", 1)],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hidden: true, locked: true });
  });
});

describe("applyLayerDrop", () => {
  const base = [n("a", "asset", 0), n("b", "asset", 1), n("c", "asset", 2)];

  it("拖到某行 = 排在它下面一格（面板顺序）", () => {
    // 面板顺序 c,b,a；把 c 拖到 a 上 → b,a,c
    const { nodes, changed } = applyLayerDrop(base, "c", "a");
    expect(changed).toBe(true);
    const panel = buildLayerRows(nodes, []).map(r => r.id);
    expect(panel).toEqual(["b", "a", "c"]);
  });

  it("拖到画板 → 嵌入", () => {
    const { nodes } = applyLayerDrop([n("f", "canvasFrame", 0), n("a", "asset", 1)], "a", "f");
    expect((nodes[1].data as Record<string, unknown>).embeddedInFrame).toBe("f");
  });

  it("拖到画板内的图片 → 加入同一画板；拖到根级 → 移出", () => {
    const nodes0 = [
      n("f", "canvasFrame", 0),
      n("in", "asset", 1, { embeddedInFrame: "f" }),
      n("out", "asset", 2),
    ];
    const joined = applyLayerDrop(nodes0, "out", "in").nodes;
    expect((joined.find(x => x.id === "out")!.data as Record<string, unknown>).embeddedInFrame).toBe("f");
    const left = applyLayerDrop(nodes0, "in", "out").nodes;
    expect((left.find(x => x.id === "in")!.data as Record<string, unknown>).embeddedInFrame).toBeUndefined();
  });

  it("无变化返回 changed=false（不入撤销栈）", () => {
    // 面板 c,b,a：把 b 放到 c 下面 = 原位
    expect(applyLayerDrop(base, "b", "c").changed).toBe(false);
    expect(applyLayerDrop(base, "a", "a").changed).toBe(false);
  });
});
