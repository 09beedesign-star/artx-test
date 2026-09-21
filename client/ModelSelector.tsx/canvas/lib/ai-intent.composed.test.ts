import { beforeEach, describe, expect, it, vi } from "vitest";

const callLLM = vi.fn();

vi.mock("@/lib/ai", () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
  generateImages: vi.fn(),
}));

const { routeCreativeIntent } = await import("./ai-intent");
const { normalizeImageModelId } = await import("../../../shared/image-models");
const { DEFAULT_TEXT_MODEL } = await import("../../../shared/text-models");

const REFERENCE = { title: "产品主图", src: "data:image/png;base64,AAAA" };

describe("图文混排提示词的意图路由", () => {
  beforeEach(() => {
    callLLM.mockReset();
    callLLM.mockResolvedValue({
      text: JSON.stringify({
        mode: "image",
        imagePrompt: "A red sneaker on a marble podium, studio lighting",
        reason: "用户想基于引用图出新图",
        confidence: "high",
      }),
    });
  });

  it("默认链路在有引用图时也会交给大模型判断，不再无条件出图", async () => {
    /**
     * 【2026-09-11 行为变更】
     *
     * 改动前：只要有引用图，preferImageWhenReferences 就直接 early return
     * mode:"image"，**一次大模型都不调**，imagePrompt 原封不动带着
     * 「引用图 1：xxx」这种占位编号扔给图片模型，图文关系从未被理解过。
     * 副作用是用户贴张图随便问一句也会被重画一张。
     *
     * 改动后：这一步交给大模型读图 + 读文案后裁决，
     * 于是 forceModelDecision 不再是「唯一能让模型读图」的开关，
     * 而只是「跳过全部正则短路」的强制手段。
     */
    const decision = await routeCreativeIntent({
      module: "test",
      prompt: "引用图 1：产品主图\n换成大理石背景",
      referencedAssets: [REFERENCE],
      preferImageWhenReferences: true,
    });

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(decision.mode).toBe("image");
    // 既然走了模型，产出的就是整合后的描述，不该再残留占位编号
    expect(decision.imagePrompt).toBe(
      "A red sneaker on a marble podium, studio lighting"
    );
    expect(decision.imagePrompt).not.toContain("引用图 1");
  });

  it("forceModelDecision 打开后，必须把图和文案一起交给大模型判断", async () => {
    const decision = await routeCreativeIntent({
      module: "test",
      prompt: "引用图 1：产品主图\n换成大理石背景",
      referencedAssets: [REFERENCE],
      preferImageWhenReferences: true,
      forceModelDecision: true,
    });

    expect(callLLM).toHaveBeenCalledTimes(1);
    const payload = callLLM.mock.calls[0][0] as {
      model: string;
      images: Array<{ src: string }>;
      prompt: string;
    };

    // 图必须真的随请求送进去，否则模型只能看见文字，谈不上「理解图文关系」
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].src).toBe(REFERENCE.src);

    // 必须显式告诉模型「编号 = 输入框中的真实位置」，否则顺序信息白给
    expect(payload.prompt).toContain("就是这张图在输入框里的真实位置");
    expect(payload.prompt).toContain("不要在 imagePrompt 里保留");

    // 产出的 imagePrompt 应当是整合后的完整描述，不再含占位编号
    expect(decision.mode).toBe("image");
    expect(decision.imagePrompt).toBe(
      "A red sneaker on a marble podium, studio lighting"
    );
    expect(decision.imagePrompt).not.toContain("引用图");
  });

  it("默认使用 claude 文本模型做这个判断", async () => {
    await routeCreativeIntent({
      module: "test",
      prompt: "引用图 1：产品主图\n换个背景",
      referencedAssets: [REFERENCE],
      forceModelDecision: true,
    });

    const payload = callLLM.mock.calls[0][0] as { model: string };
    expect(payload.model).toBe(DEFAULT_TEXT_MODEL);
    expect(DEFAULT_TEXT_MODEL).toBe("claude-opus-5");
  });

  it("即便强制走大模型，明确的「找参考图」仍然优先走搜索", async () => {
    // forceModelDecision 不能把 reference_search 也吃掉 ——
    // 「帮我找参考图」和「理解图文混排后出图」是两件事。
    const decision = await routeCreativeIntent({
      module: "test",
      prompt: "帮我找一些赛博朋克海报参考图",
      referencedAssets: [],
      allowReferenceSearch: true,
      forceModelDecision: true,
    });

    expect(callLLM).not.toHaveBeenCalled();
    expect(decision.mode).toBe("reference_search");
  });

  it("没有引用图时，提示词里不应混入图文混排的说明", async () => {
    callLLM.mockResolvedValue({
      text: JSON.stringify({ mode: "text", reply: "好的" }),
    });
    await routeCreativeIntent({
      module: "test",
      prompt: "随便聊聊",
      referencedAssets: [],
      forceModelDecision: true,
    });

    const payload = callLLM.mock.calls[0][0] as { prompt: string };
    expect(payload.prompt).not.toContain("真实位置");
  });
});

describe("多图融合时的底图裁决（targetImageIndex）", () => {
  const FOOT = { title: "脚部特写", src: "data:image/png;base64,Rk9PVA==" };
  const SHOE = { title: "红色球鞋", src: "data:image/png;base64,U0hPRQ==" };

  beforeEach(() => {
    callLLM.mockReset();
  });

  const mockDecision = (extra: Record<string, unknown>) => {
    callLLM.mockResolvedValue({
      text: JSON.stringify({
        mode: "image",
        imagePrompt: "The same bare foot now wearing the red sneaker",
        ...extra,
      }),
    });
  };

  it("≥2 张引用图时，提示词必须要求模型指认底图", async () => {
    mockDecision({ targetImageIndex: 1 });
    await routeCreativeIntent({
      module: "test",
      prompt: "引用图 1：脚部特写\n引用图 2：红色球鞋\n让脚穿上这双鞋",
      referencedAssets: [FOOT, SHOE],
      forceModelDecision: true,
    });

    const payload = callLLM.mock.calls[0][0] as { prompt: string };
    expect(payload.prompt).toContain("另外必须返回 targetImageIndex");
    // 必须讲清判断依据是语义而非顺序，否则模型会退化成「取最后一张」
    expect(payload.prompt).toContain("判断依据是语义而不是顺序");
    // JSON 示例里也要带上该字段，否则模型可能认为它不是合法键
    expect(payload.prompt).toContain('"targetImageIndex":1');
  });

  it("只有 1 张引用图时不应索要 targetImageIndex", () => {
    // 单图场景没有「选哪张」的问题，多说只会污染提示词。
    mockDecision({});
    return routeCreativeIntent({
      module: "test",
      prompt: "引用图 1：脚部特写\n换个背景",
      referencedAssets: [FOOT],
      forceModelDecision: true,
    }).then(() => {
      const payload = callLLM.mock.calls[0][0] as { prompt: string };
      expect(payload.prompt).not.toContain("targetImageIndex");
    });
  });

  it("模型指认第 1 张为底图时，决策里如实带回", async () => {
    // 用户 bug 的正解：脚是底图，鞋只是素材。
    mockDecision({ targetImageIndex: 1 });
    const decision = await routeCreativeIntent({
      module: "test",
      prompt: "让脚穿上这双鞋",
      referencedAssets: [FOOT, SHOE],
      forceModelDecision: true,
    });

    expect(decision.mode).toBe("image");
    expect(decision.targetImageIndex).toBe(1);
  });

  it("模型回字符串数字也能正确解析", async () => {
    // 大模型返回 JSON 时把数字写成字符串是常见现象，不能因此丢掉裁决。
    mockDecision({ targetImageIndex: "2" });
    const decision = await routeCreativeIntent({
      module: "test",
      prompt: "让脚穿上这双鞋",
      referencedAssets: [FOOT, SHOE],
      forceModelDecision: true,
    });

    expect(decision.targetImageIndex).toBe(2);
  });

  it("模型没给或给了非法值时，字段为 undefined 交由调用方兜底", async () => {
    for (const bad of [undefined, 0, -1, null, "abc"]) {
      callLLM.mockReset();
      mockDecision(bad === undefined ? {} : { targetImageIndex: bad });
      const decision = await routeCreativeIntent({
        module: "test",
        prompt: "让脚穿上这双鞋",
        referencedAssets: [FOOT, SHOE],
        forceModelDecision: true,
      });
      expect(decision.targetImageIndex).toBeUndefined();
    }
  });
});

describe("图文混排出图使用的图片模型", () => {
  it("「gem」归一化后必须是一个真实存在的通道 id", () => {
    // InfiniteCanvas 里的 COMPOSED_REFERENCE_IMAGE_MODEL_ID 就取自这里。
    // 一旦 gem 的通道 id 变了，这条会先炸，而不是等到线上出图失败。
    expect(normalizeImageModelId("gem")).toBe("vod-gem");
  });

  it("gem 不是默认图片模型，所以必须显式指定才会生效", async () => {
    const { DEFAULT_IMAGE_MODEL_ID } = await import(
      "../../../shared/image-models"
    );
    // 这条断言的意义：说明「不改代码就能用上 gem」是不成立的。
    expect(DEFAULT_IMAGE_MODEL_ID).not.toBe("vod-gem");
  });
});
