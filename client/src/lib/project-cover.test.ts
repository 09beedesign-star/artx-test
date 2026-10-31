import { describe, expect, it } from "vitest";

import { resolveCanvasCoverSource } from "./project-cover";

const img = (id: string, localSrc?: string) => ({
  id,
  type: "asset",
  data: localSrc ? { localSrc } : {},
});

describe("resolveCanvasCoverSource", () => {
  it("没有手动封面时取最后一张有图的图片节点", () => {
    const nodes = [
      img("b", "data:b"),
      img("c", "data:c"),
      img("d"),
      { id: "t1", type: "text", data: { localSrc: "x" } },
    ];
    expect(resolveCanvasCoverSource(nodes)).toEqual({
      src: "data:c",
      coverNodeId: null,
    });
  });

  it("按节点 id 里的生成时间取最新一张，置顶等操作改变数组顺序也不乱跳", () => {
    const nodes = [
      img("image-gen-1761900000000-new", "data:new"),
      // 老节点被「置于顶层」挪到了数组末尾
      img("asset-1761800000000", "data:old"),
    ];
    expect(resolveCanvasCoverSource(nodes).src).toBe("data:new");
  });

  it("带时间戳的新图优先于没有时间戳的初始节点", () => {
    const nodes = [
      img("asset-1761800000000", "data:gen"),
      img("demo-asset", "data:demo"),
    ];
    expect(resolveCanvasCoverSource(nodes).src).toBe("data:gen");
  });

  it("手动设为封面的节点优先于默认的最后一张图（自动刷新不会冲掉手动封面）", () => {
    const nodes = [img("b", "data:b"), img("c", "data:c")];
    expect(resolveCanvasCoverSource(nodes, "b")).toEqual({
      src: "data:b",
      coverNodeId: "b",
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
