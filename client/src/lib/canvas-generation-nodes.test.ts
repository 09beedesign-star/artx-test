import { describe, expect, it } from "vitest";
import {
  isGenerationPlaceholder,
  removeGenerationPlaceholders,
} from "./canvas-generation-nodes";

/**
 * 计费拦截时「撤掉空占位框」的回归测试。
 *
 * ## 为什么这段逻辑值得单独测
 *
 * 缺积分的用户点一次生成，画布上会先出现占位框（请求发出前就插进去了），
 * 402 回来后才撤。撤得准不准有两种翻车方式，而且都不报错：
 *
 * - **撤多了**：连用户已有的图一起删掉 —— 用户会认为图丢了，比原来的
 *   「留个失败框」严重得多。原地复活的「再次生成」链路最危险：
 *   它不新建节点，是把已有节点改造成生成中。
 * - **撤少了**：残留空白失败节点，也就是本次要修的问题本身。
 *
 * 所以下面既有「该撤」的用例，也有成组的「不该撤」用例。
 */

type NodeLike = { id: string; data: Record<string, unknown> };

/** 本次生成插进画布的空占位框（请求发出前创建）。 */
function placeholder(
  id: string,
  generationId: string,
  extra: Record<string, unknown> = {}
): NodeLike {
  return {
    id,
    data: {
      generationId,
      placeholderForGeneration: true,
      isGeneratingImage: true,
      ...extra,
    },
  };
}

/** 已经出图的节点：仍留着占位标记，但已经有了 localSrc。 */
function generatedNode(id: string, generationId: string): NodeLike {
  return {
    id,
    data: {
      generationId,
      placeholderForGeneration: true,
      isGeneratingImage: false,
      localSrc: "https://cdn.example.com/a.png",
    },
  };
}

/** 「再次生成」原地改造的节点：旧 id、是生成中，但**没有**占位标记。 */
function regeneratingNode(id: string, generationId: string): NodeLike {
  return {
    id,
    data: { generationId, isGeneratingImage: true },
  };
}

describe("isGenerationPlaceholder", () => {
  it("认得出本次生成的空占位框", () => {
    expect(isGenerationPlaceholder(placeholder("n1", "gen-1"), "gen-1")).toBe(true);
  });

  it("有图的节点不算占位框 —— 哪怕它还带着占位标记", () => {
    expect(isGenerationPlaceholder(generatedNode("n1", "gen-1"), "gen-1")).toBe(false);
  });

  it("别的 generationId 不算", () => {
    expect(isGenerationPlaceholder(placeholder("n1", "gen-1"), "gen-2")).toBe(false);
  });

  it("没有占位标记的节点不算 —— 这是原地复活链路与新建链路的唯一区分点", () => {
    expect(isGenerationPlaceholder(regeneratingNode("n1", "gen-1"), "gen-1")).toBe(false);
  });

  it("data 缺失时不抛错", () => {
    expect(isGenerationPlaceholder({ id: "n1" }, "gen-1")).toBe(false);
  });
});

describe("removeGenerationPlaceholders", () => {
  it("批量 4 张被拦时，4 个占位框一次撤干净（用户截图的场景）", () => {
    const nodes = [
      placeholder("generated-gen-1-0", "gen-1"),
      placeholder("generated-gen-1-1", "gen-1"),
      placeholder("generated-gen-1-2", "gen-1"),
      placeholder("generated-gen-1-3", "gen-1"),
    ];
    const pruned = removeGenerationPlaceholders(nodes, "gen-1");
    expect(pruned).not.toBeNull();
    expect(pruned).toEqual([]);
  });

  it("同画布上别的生成任务、以及用户的普通节点都原样留着", () => {
    const otherTask = placeholder("generated-gen-2-0", "gen-2");
    const userNode: NodeLike = { id: "asset-1", data: { localSrc: "x.png" } };
    const nodes = [
      userNode,
      placeholder("generated-gen-1-0", "gen-1"),
      otherTask,
    ];
    const pruned = removeGenerationPlaceholders(nodes, "gen-1");
    expect(pruned).toEqual([userNode, otherTask]);
  });

  it("已经出图的节点不会被撤，即使它以前是占位框", () => {
    const done = generatedNode("generated-gen-1-0", "gen-1");
    const nodes = [done, placeholder("generated-gen-1-1", "gen-1")];
    const pruned = removeGenerationPlaceholders(nodes, "gen-1");
    expect(pruned).toEqual([done]);
  });

  it("没有占位框时返回 null —— 调用方据此退回失败态标记，避免把原地复活的图删掉", () => {
    const nodes = [regeneratingNode("asset-9", "gen-1")];
    expect(removeGenerationPlaceholders(nodes, "gen-1")).toBeNull();
    expect(nodes).toHaveLength(1);
  });

  it("原地复活 + 同批还有别的任务时，也只返回 null，绝不动那些节点", () => {
    const nodes = [
      regeneratingNode("asset-9", "gen-1"),
      placeholder("generated-gen-2-0", "gen-2"),
    ];
    expect(removeGenerationPlaceholders(nodes, "gen-1")).toBeNull();
  });

  it("返回新数组，不改动入参（setNodes 的 updater 会被调用两次）", () => {
    const nodes = [placeholder("generated-gen-1-0", "gen-1")];
    const snapshot = [...nodes];
    const pruned = removeGenerationPlaceholders(nodes, "gen-1");
    expect(pruned).not.toBe(nodes);
    expect(nodes).toEqual(snapshot);
    // 二次调用必须得到同样结果，否则 React 严格模式下会抖
    expect(removeGenerationPlaceholders(nodes, "gen-1")).toEqual([]);
  });
});
