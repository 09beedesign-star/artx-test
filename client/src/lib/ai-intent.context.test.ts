import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 多轮上下文关联的回归测试。
 *
 * 【为什么有这个文件】
 * 用户反馈：「每个循环问答只有一问一答，我需要关联上下文」。
 * 根因是三处叠加：
 *   1. 出图成功只写回一句「已根据你的请求生成图片：xxx」，图没进历史；
 *   2. 联网搜到的参考图只存在 referenceOptions 字段里，从不进上下文；
 *   3. LLMMessage.content 原本只能是纯字符串，历史根本装不下图。
 * 于是模型每轮只看得见干巴巴的文字，「这张再暗一点」无从指代。
 */

const callLLM = vi.fn();

vi.mock("@/lib/ai", () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
  generateImages: vi.fn(),
}));

const { buildAssistantContext, routeCreativeIntent, MAX_CONTEXT_IMAGES } =
  await import("./ai-intent");

const img = (name: string) => ({ src: `data:image/png;base64,${name}`, title: name });

describe("buildAssistantContext 把图沉淀进对话历史", () => {
  it("保留消息顺序，并把图挂在对应的那一轮上", () => {
    const context = buildAssistantContext([
      { role: "user", content: "画一只橘猫" },
      { role: "assistant", content: "已生成图片", contextImages: [img("cat")] },
      { role: "user", content: "这张再暗一点" },
    ]);

    expect(context).toHaveLength(3);
    expect(context[0]).toEqual({ role: "user", content: "画一只橘猫" });
    // 图必须挂在助手那一轮，而不是笼统地堆在最前面 ——
    // 否则模型分不清哪张图属于哪一轮
    expect(context[1].images).toEqual([img("cat")]);
    expect(context[2].images).toBeUndefined();
  });

  it("把生图用的完整提示词写进上下文，供后续增量追改", () => {
    // imagePrompt 可能已被大模型改写过，与用户原话不同。
    // 后续「再暗一点」要在这一版基础上改，不能从用户原话重写。
    const context = buildAssistantContext([
      {
        role: "assistant",
        content: "已生成图片",
        contextImages: [img("cat")],
        contextImagePrompt: "An orange tabby cat wearing a straw hat, studio light",
      },
    ]);

    expect(context[0].content).toContain("An orange tabby cat wearing a straw hat");
  });

  it("图片数量超过上限时，只保留最近的几张", () => {
    const context = buildAssistantContext([
      { role: "assistant", content: "第一轮", contextImages: [img("a1"), img("a2")] },
      { role: "assistant", content: "第二轮", contextImages: [img("b1"), img("b2")] },
      { role: "assistant", content: "第三轮", contextImages: [img("c1")] },
    ]);

    const total = context.reduce((sum, item) => sum + (item.images?.length || 0), 0);
    expect(total).toBe(MAX_CONTEXT_IMAGES);

    // 配额必须从最近的往回发：用户说「这张」时指的几乎总是最近那张
    expect(context[2].images).toEqual([img("c1")]);
    expect(context[1].images).toEqual([img("b1"), img("b2")]);
    expect(context[0].images).toBeUndefined();
  });

  it("被挤掉的图降级成文字说明，而不是凭空消失", () => {
    const context = buildAssistantContext([
      { role: "assistant", content: "第一轮", contextImages: [img("a1"), img("a2")] },
      { role: "assistant", content: "第二轮", contextImages: [img("b1")] },
      { role: "assistant", content: "第三轮", contextImages: [img("c1"), img("c2")] },
    ]);

    // 第一轮的两张图都没配额了，但模型至少要"知道存在过"
    expect(context[0].content).toContain("2 张图未随上下文回传");
  });

  it("只回溯最近 8 条消息", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `第 ${i} 条`,
    }));
    const context = buildAssistantContext(many);

    expect(context).toHaveLength(8);
    expect(context[0].content).toBe("第 12 条");
    expect(context[7].content).toBe("第 19 条");
  });

  it("没有图的纯文字对话不应多出 images 字段", () => {
    // 保证零回归：纯文字场景的请求体应与改动前完全一致
    const context = buildAssistantContext([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你" },
    ]);

    expect(context.every((item) => !("images" in item))).toBe(true);
  });

  it("上限可按调用方需要调整", () => {
    const context = buildAssistantContext(
      [{ role: "assistant", content: "一轮", contextImages: [img("a"), img("b")] }],
      { maxImages: 1 }
    );
    expect(context[0].images).toHaveLength(1);
  });
});

describe("意图路由把历史里的图一并交给大模型", () => {
  beforeEach(() => {
    callLLM.mockReset();
    callLLM.mockResolvedValue({
      text: JSON.stringify({
        mode: "image",
        imagePrompt: "A darker version of the orange tabby cat",
      }),
    });
  });

  it("历史图随请求送出，并在提示词里说明可被指代", async () => {
    await routeCreativeIntent({
      module: "test",
      // 「这张再暗一点」既无疑问词也无明确创作祈使，会落到大模型裁决
      prompt: "这张再暗一点",
      referencedAssets: [],
      recentMessages: [
        { role: "user", content: "画一只橘猫" },
        { role: "assistant", content: "已生成图片", images: [img("cat")] },
      ],
    });

    expect(callLLM).toHaveBeenCalledTimes(1);
    const payload = callLLM.mock.calls[0][0] as {
      images: Array<{ src: string }>;
      prompt: string;
    };

    // 图必须真的送进去，否则「这张」永远无从指代
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].src).toBe(img("cat").src);

    // 必须显式告诉模型这些图可被指代，且要做增量修改
    expect(payload.prompt).toContain("「这张」");
    expect(payload.prompt).toContain("增量修改");

    // 历史文本里要标注哪几轮带图
    expect(payload.prompt).toContain("［附 1 张图］");
  });

  it("当前引用素材排在历史图之前", async () => {
    // 用户正在操作的主体优先，历史图是补充语境
    const current = img("current");
    await routeCreativeIntent({
      module: "test",
      prompt: "按这个感觉调整",
      referencedAssets: [current],
      recentMessages: [
        { role: "assistant", content: "上一轮", images: [img("history")] },
      ],
    });

    const payload = callLLM.mock.calls[0][0] as { images: Array<{ src: string }> };
    expect(payload.images[0].src).toBe(current.src);
    expect(payload.images[1].src).toBe(img("history").src);
  });

  it("没有历史图时不应出现相关提示词", async () => {
    callLLM.mockResolvedValue({
      text: JSON.stringify({ mode: "text", reply: "好的" }),
    });
    await routeCreativeIntent({
      module: "test",
      prompt: "随便聊聊",
      referencedAssets: [],
      recentMessages: [{ role: "user", content: "你好" }],
      forceModelDecision: true,
    });

    const payload = callLLM.mock.calls[0][0] as { prompt: string };
    expect(payload.prompt).not.toContain("张此前生成或选用过的图");
  });
});
