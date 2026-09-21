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

const { routeCreativeIntent } = await import("./ai-intent");

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

describe("交给大模型时的提示词约束", () => {
  it("必须告诉模型「看动作诉求而不是名词」，并在不确定时倾向文字", async () => {
    await route("帮我分析一下这张海报，然后帮我重新画一张");
    const payload = callLLM.mock.calls[0][0] as { prompt: string };

    // 这三条是防误判的核心指令，掉任何一条都会让模型退回「见名词就出图」
    expect(payload.prompt).toContain("不是句子里出现了什么名词");
    expect(payload.prompt).toContain("一律返回 text");
    expect(payload.prompt).toContain("无法确信用户想要图片");
  });
});
