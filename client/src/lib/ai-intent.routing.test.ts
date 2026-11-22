import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * auto 模式意图路由的回归测试。
 *
 * 【为什么有这个文件】
 * 用户反馈：「有的时候我只是提一个简单的问题，他也给我输出图片」。
 * 根因是 DIRECT_IMAGE_PATTERN 匹配的是**名词**（图片/海报/logo/banner），
 * 于是任何谈论视觉话题的句子都被判成要出图，而且生图分支排在文本分支前面，
 * 同时命中时先 return 生图 —— 大模型根本没机会读这句话。
 *
 * 实测 12 句普通提问有 10 句被误判成生图。下面把这批句子全部钉成用例。
 */

const callLLM = vi.fn();

vi.mock("@/lib/ai", () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
  generateImages: vi.fn(),
}));

const { routeCreativeIntent, inferCreativeIntentDecision } = await import("./ai-intent");

/** 走正则短路的场景不应该调用 LLM；这里统一给个安全兜底值。 */
const mockLLMText = () => {
  callLLM.mockResolvedValue({
    text: JSON.stringify({ mode: "text", reply: "ok", confidence: "high" }),
  });
};

const route = (prompt: string, extra: Record<string, unknown> = {}) =>
  routeCreativeIntent({ module: "test", prompt, referencedAssets: [], ...extra });

beforeEach(() => {
  callLLM.mockReset();
  mockLLMText();
});

describe("普通提问不得被误判为生图", () => {
  /**
   * 这 9 句在修复前**全部**被判成 image。
   * 它们的共同点：句子里出现了视觉名词，但用户的动作诉求是「问」而不是「画」。
   */
  const QUESTIONS = [
    "这张图片是什么意思",
    "什么是 logo 设计的基本原则",
    "banner 一般用什么尺寸",
    "图片模型怎么收费",
    "解释一下主视觉和辅助图形的区别",
    "详情页一般包含哪些模块",
    // 下面三句连视觉名词都没有，纯粹是被 SIMPLE_IMAGE_OBJECT_PATTERN
    // 的 `.{1,24}$` 无限制尾部吃掉的
    "一个星期有几天",
    "一张 A4 纸有多大",
    "一个人如何提高审美",
  ];

  it.each(QUESTIONS)("「%s」→ 文字回复", async (prompt) => {
    const decision = await route(prompt);
    expect(decision.mode).toBe("text");
  });

  it("纯提问不需要惊动大模型，正则直接裁决即可", async () => {
    await route("一个星期有几天");
    expect(callLLM).not.toHaveBeenCalled();
  });
});

describe("明确的生图诉求必须仍然出图（防止过度收紧）", () => {
  const IMAGE_REQUESTS = [
    "帮我画一张夏日促销海报",
    "生成一张产品主图",
    "做个618大促banner",
    "设计一个咖啡品牌logo",
    "画一只戴帽子的橘猫",
    "把这张图的背景换成海边",
    "帮我扩图",
    "抠图",
  ];

  it.each(IMAGE_REQUESTS)("「%s」→ 出图", async (prompt) => {
    const decision = await route(prompt);
    expect(decision.mode).toBe("image");
  });

  it("纯名词短语「一只戴礼帽的橘猫」仍视为生图，但置信度只给 medium", async () => {
    const decision = await route("一只戴礼帽的橘猫");
    expect(decision.mode).toBe("image");
    expect(decision.confidence).toBe("medium");
  });
});

describe("语义混合的句子必须交给大模型裁决", () => {
  it("「帮我分析一下这张海报有什么问题」两边都命中 → 走 LLM", async () => {
    // 「分析」是文本信号，「海报…设计」是生图信号。
    // 正则在这里已经无法可靠裁决，硬判必错一半，所以交给模型读全句。
    callLLM.mockResolvedValue({
      text: JSON.stringify({ mode: "text", reply: "这张海报的问题是…" }),
    });
    const decision = await route("帮我分析一下这张海报，然后帮我重新画一张");
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(decision.mode).toBe("text");
  });

  const REF = [{ title: "参考", src: "data:image/png;base64,AAAA" }];

  it("贴图提问「这是什么风格」→ 文字回复，且正则直接裁决无需调用大模型", async () => {
    // 【修复前】preferImageWhenReferences 直接 early return mode:"image"，
    // 用户贴张图提问也会被重画一张。
    // 现在文本信号优先级最高，连大模型都不用问就能判对，顺带省一次调用。
    const decision = await route("这是什么风格", {
      referencedAssets: REF,
      preferImageWhenReferences: true,
    });

    expect(decision.mode).toBe("text");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("有引用图且文案模糊（两边正则都不命中）时，交给大模型读图裁决", async () => {
    // 「按这个感觉来」既没有疑问词也没有创作动词，正则无从判断。
    // 这正是必须让大模型看图 + 看文案的场景。
    callLLM.mockResolvedValue({
      text: JSON.stringify({
        mode: "image",
        imagePrompt: "A poster in the same visual style",
      }),
    });
    const decision = await route("按这个感觉来", {
      referencedAssets: REF,
      preferImageWhenReferences: true,
    });

    expect(callLLM).toHaveBeenCalledTimes(1);
    // 图必须真的送进去，否则模型只能看见文字，谈不上「读图裁决」
    const payload = callLLM.mock.calls[0][0] as { images: unknown[] };
    expect(payload.images).toHaveLength(1);
    expect(decision.mode).toBe("image");
  });
});

describe("Auto 按动作分流，而不是按问句形式分流", () => {
  it.each([
    "你能给我一些天空的图片吗？",
    "能不能给我几张天空照片？",
    "请帮我找一些天空图片",
    "可以提供几张天空参考图吗？",
    "给我一些蓝天白云的图片",
    "帮我搜天空的照片",
  ])("「%s」→ 实际找参考图，不反问要不要生成", async prompt => {
    const decision = await route(prompt, { allowReferenceSearch: true });
    expect(decision.mode).toBe("reference_search");
    expect(decision.searchQuery).toContain(prompt.includes("蓝天") ? "蓝天" : "天空");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it.each([
    "你能帮我生成一张天空图片吗？",
    "能不能画一张天空的图片？",
    "能不能画一只橘猫？",
    "可以帮我把这张图的背景换成海边吗？",
  ])("「%s」→ 生成或改图", async prompt => {
    expect((await route(prompt, { allowReferenceSearch: true })).mode).toBe("image");
  });

  it.each([
    "你能解释这张天空图片为什么偏蓝吗？",
    "能不能告诉我图片模型怎么收费？",
    "如何找天空图片？",
    "给我一些天空图片的拍摄建议",
    "不要给我图片，只解释天空为什么是蓝色",
    "解释一下‘给我一些天空图片’是什么意思",
    "我想知道你能不能生成图片，而不是现在生成",
    "分析这些参考图片，不要生成新图",
  ])("「%s」→ 文字，不误搜图或生图", async prompt => {
    expect((await route(prompt, { allowReferenceSearch: true })).mode).toBe("text");
  });

  it.each([
    "生成图片需要付费吗？",
    "生成一张图片要花积分吗？",
    "生成图片支持透明背景吗？",
    "可以不生成图片吗？",
    "给我解释一下这张图片",
    "给我分析一下这些天空图片",
    "给我总结一下这些照片",
    "请给我对比一下这两张图片",
  ])("反例「%s」→ 文字，不执行图片任务", async prompt => {
    const decision = await route(prompt, { allowReferenceSearch: true });
    expect(decision.mode).toBe("text");
  });

  it.each([
    "我在搜集天空主题的视觉参考，想看看现成照片，不要新画。",
    "不要生成，只想看看现成的照片。",
  ])("现成素材诉求「%s」不能被否定生图信号短路", async prompt => {
    callLLM.mockResolvedValue({ text: JSON.stringify({ mode: "reference_search", searchQuery: "天空 照片", confidence: "high" }) });
    const decision = await route(prompt, { allowReferenceSearch: true });
    expect(callLLM).toHaveBeenCalledOnce();
    expect(callLLM.mock.calls[0][0].prompt).toContain(prompt);
    expect(decision.mode).toBe("reference_search");
    expect(decision.searchQuery).toBe("天空 照片");
  });

  it("现成素材仅交模型判断，模型裁决为咨询时仍返回文字", async () => {
    const decision = await route("我想知道现成照片素材如何授权，不要搜图。", { allowReferenceSearch: true });
    expect(callLLM).toHaveBeenCalledOnce();
    expect(decision.mode).toBe("text");
  });

  it("不支持搜索时，现成照片诉求不打开额外路由", async () => {
    const decision = await route("想看看现成照片，不要新画。", { allowReferenceSearch: false });
    expect(decision.mode).toBe("text");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("有引用图且强制模型裁决时，明确搜图也必须先读图裁决", async () => {
    callLLM.mockResolvedValue({ text: JSON.stringify({ mode: "reference_search", searchQuery: "天空" }) });
    const decision = await route("帮我找天空参考图", {
      allowReferenceSearch: true,
      referencedAssets: [{ src: "data:image/png;base64,AAAA" }],
      forceModelDecision: true,
    });
    expect(decision.mode).toBe("reference_search");
    expect(callLLM).toHaveBeenCalledOnce();
    expect(callLLM.mock.calls[0][0].images).toHaveLength(1);
  });

  it("语义不明确时仍由模型读上下文，不把图片名词当动作", async () => {
    callLLM.mockResolvedValue({ text: JSON.stringify({ mode: "reference_search", searchQuery: "天空 参考图" }) });
    const decision = await route("想看看类似的方向", { allowReferenceSearch: true, forceModelDecision: true });
    expect(callLLM).toHaveBeenCalledOnce();
    expect(decision.mode).toBe("reference_search");
    const { prompt } = callLLM.mock.calls[0][0];
    expect(prompt).toContain('text|image|reference_search');
    expect(prompt).toContain("你能给我一些天空的图片吗");
    expect(prompt).not.toContain("凡是疑问句");
  });

  it("未支持搜索的调用方不能收到无法消费的搜索决策", async () => {
    callLLM.mockResolvedValue({ text: JSON.stringify({ mode: "reference_search", searchQuery: "天空" }) });
    const decision = await route("想看看类似的方向", { allowReferenceSearch: false, forceModelDecision: true });
    expect(decision.mode).toBe("text");
    expect(decision.reply).not.toContain('"mode"');
  });
});

describe("动作边界与回退保护", () => {
  it.each([
    "生成图片需要付费吗？",
    "生成一张图片要花积分吗？",
    "生成图片支持透明背景吗？",
    "可以不生成图片吗？",
    "能不能生成图片而不扣积分？",
    "生成图片支持透明背景",
    "给我鉴赏一下这些天空图片",
    "给我判断一下这些照片",
  ])("「%s」不明确时必须交给模型，而非正则直接执行", async prompt => {
    expect((await route(prompt, { allowReferenceSearch: true })).mode).toBe("text");
    expect(callLLM).toHaveBeenCalledOnce();
    expect(callLLM.mock.calls[0][0].prompt).toContain(`当前用户输入：${prompt}`);
  });

  it.each([
    "生成图片需要付费吗？",
    "生成一张图片要花积分吗？",
    "生成图片支持透明背景吗？",
    "可以不生成图片吗？",
    "给我解释一下这张图片",
    "给我分析一下这些天空图片",
    "给我总结一下这些照片",
    "请给我对比一下这两张图片",
    "你能给我一些天空的图片吗？",
    "帮我找天空参考图",
  ])("有引用图+forceModelDecision：「%s」不得被索图正则抢跑", async prompt => {
    const refs = [{ src: "data:image/png;base64,AAAA" }];
    const decision = await route(prompt, {
      allowReferenceSearch: true,
      forceModelDecision: true,
      referencedAssets: refs,
    });
    expect(callLLM).toHaveBeenCalledOnce();
    expect(callLLM.mock.calls[0][0].images).toEqual(refs);
    expect(decision.mode).toBe("text");
  });

  it.each([
    "生成图片需要付费吗？",
    "生成一张图片要花积分吗？",
    "生成图片支持透明背景吗？",
    "可以不生成图片吗？",
    "生成图片支持透明背景",
    "帮我分析这张图，然后重新生成图片",
  ])("模型建议切换时「%s」不能绕过咨询/混合保护", prompt => {
    for (const raw of ["请切换到图片模型", JSON.stringify({ mode: "text", reply: "请切换到图片模型" })]) {
      const decision = inferCreativeIntentDecision(raw, prompt);
      expect(decision.mode).toBe("text");
      expect(decision.imagePrompt).toBeUndefined();
    }
  });

  it.each(["生成一张天空图片", "你能帮我生成一张天空图片吗？", "能不能画一只橘猫？"])("模型切换回退仍能执行完整创作动作「%s」", prompt => {
    expect(inferCreativeIntentDecision("请切换到图片模型", prompt).mode).toBe("image");
    expect(inferCreativeIntentDecision(JSON.stringify({ mode: "text", reply: "请切换到图片模型" }), prompt).mode).toBe("image");
  });
});

describe("交给大模型时的提示词约束", () => {
  it("必须告诉模型「看动作诉求而不是名词」，并在不确定时倾向文字", async () => {
    await route("帮我分析一下这张海报，然后帮我重新画一张");
    const payload = callLLM.mock.calls[0][0] as { prompt: string };

    // 这三条是防误判的核心指令，掉任何一条都会让模型退回「见名词就出图」
    expect(payload.prompt).toContain("不是句子里出现了什么名词");
    expect(payload.prompt).not.toContain("凡是疑问句");
    expect(payload.prompt).toContain("礼貌疑问句不等于知识问答");
    expect(payload.prompt).toContain("无法确信用户想要图片");
  });
});
