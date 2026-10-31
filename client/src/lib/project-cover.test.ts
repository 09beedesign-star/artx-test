import { describe, expect, it } from "vitest";

import { resolveCanvasCoverSource } from "./project-cover";

const img = (id: string, localSrc?: string) => ({
  id,
  type: "asset",
  data: localSrc ? { localSrc } : {},
});

describe("resolveCanvasCoverSource", () => {
  it("没有手动封面时取第一张有图的图片节点", () => {
    const nodes = [
      { id: "t1", type: "text", data: { localSrc: "x" } },
      img("a"),
      img("b", "data:b"),
      img("c", "data:c"),
    ];
    expect(resolveCanvasCoverSource(nodes)).toEqual({
      src: "data:b",
      coverNodeId: null,
    });
  });

  it("手动设为封面的节点优先于第一张图（自动刷新不会冲掉手动封面）", () => {
    const nodes = [img("b", "data:b"), img("c", "data:c")];
    expect(resolveCanvasCoverSource(nodes, "c")).toEqual({
      src: "data:c",
      coverNodeId: "c",
    });
  });

  it("手动封面节点被删除后退回自动封面，并返回 coverNodeId=null 以清掉失效标记", () => {
    const nodes = [img("b", "data:b")];
    expect(resolveCanvasCoverSource(nodes, "deleted")).toEqual({
      src: "data:b",
      coverNodeId: null,
    });
  });

  it("手动封面节点还在但图片尚未 hydrate 时保留手动选择、本轮不刷新", () => {
    const nodes = [img("b", "data:b"), img("c")];
    expect(resolveCanvasCoverSource(nodes, "c")).toEqual({
      src: null,
      coverNodeId: "c",
    });
  });

  it("画布上没有图片时返回空", () => {
    expect(resolveCanvasCoverSource([])).toEqual({
      src: null,
      coverNodeId: null,
    });
  });
});
