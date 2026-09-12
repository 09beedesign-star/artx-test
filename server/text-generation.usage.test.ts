import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.AI_TEXT_API_KEY;
  delete process.env.AI_TEXT_BASE_URL;
});

describe("text generation usage", () => {
  it("returns token usage exactly as supplied by the chat provider", async () => {
    process.env.AI_TEXT_API_KEY = "test-key";
    process.env.AI_TEXT_BASE_URL = "https://provider.example";
    // 显式清空 AI_TEXT_MODEL，断言的是「无环境变量时的代码内默认值」，
    // 否则本地 .env.local 一改，这条用例的结果就会跟着漂。
    vi.stubEnv("AI_TEXT_MODEL", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "已生成文案" } }],
      usage: { prompt_tokens: 812, completion_tokens: 216 },
    }), { status: 200 })));
    vi.resetModules();
    const { generateText } = await import("./text-generation");

    await expect(generateText({ prompt: "生成产品文案" })).resolves.toEqual({
      text: "已生成文案",
      model: DEFAULT_TEXT_MODEL,
      usage: { promptTokens: 812, completionTokens: 216 },
    });
  });

  it("omits temperature for claude models and keeps it for gpt models", async () => {
    // 回归防护：中转站的 claude 系列对 temperature 返回
    // 400 "`temperature` is deprecated for this model."。
    // 而 generateText 的降级链会静默吞掉这个 400 并退到 gpt-5.5，
    // 表面上功能正常，实际首选模型 100% 失效、全站文本仍跑在 GPT 上。
    // 2026-09-10 的切换就踩过这个坑，这条用例专门锁死它。
    process.env.AI_TEXT_API_KEY = "test-key";
    process.env.AI_TEXT_BASE_URL = "https://provider.example";
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }), { status: 200 });
    }));
    vi.resetModules();
    const { generateText } = await import("./text-generation");

    await generateText({ prompt: "x", model: DEFAULT_TEXT_MODEL });
    expect(bodies.at(-1)).not.toHaveProperty("temperature");
    expect(bodies.at(-1)).toMatchObject({ model: DEFAULT_TEXT_MODEL });

    await generateText({ prompt: "x", model: "gpt-5.5" });
    expect(bodies.at(-1)).toMatchObject({ model: "gpt-5.5", temperature: 0.7 });
  });
});

describe("多轮上下文里的历史图片", () => {
  /** 取出请求体里真正发给模型的 messages。 */
  const captureMessages = async (
    input: Parameters<
      Awaited<ReturnType<typeof importGenerateText>>["generateText"]
    >[0]
  ) => {
    const bodies: Array<{ messages?: Array<Record<string, unknown>> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200 }
        );
      })
    );
    vi.resetModules();
    const { generateText } = await importGenerateText();
    await generateText(input);
    return bodies.at(-1)?.messages || [];
  };

  const importGenerateText = () => import("./text-generation");

  it("历史消息自带的图要就地展开成多模态 content", async () => {
    // 【2026-09-11】原先 message.images 会被整个忽略，
    // 「上一轮那张图」永远传不到模型面前，
    // 用户说「这张再暗一点」时它只看得见文字、看不见图。
    process.env.AI_TEXT_API_KEY = "test-key";
    process.env.AI_TEXT_BASE_URL = "https://provider.example";

    const messages = await captureMessages({
      messages: [
        { role: "user", content: "画一只橘猫" },
        {
          role: "assistant",
          content: "已生成图片",
          images: [{ src: "https://cdn.example.com/cat.png" }],
        },
        { role: "user", content: "这张再暗一点" },
      ],
    });

    const assistantTurn = messages.find(
      (item) => item.role === "assistant"
    ) as { content: Array<Record<string, unknown>> };

    expect(Array.isArray(assistantTurn.content)).toBe(true);
    // 文本必须排在图片前面，顺序反了模型会把图当成新指令的主体
    expect(assistantTurn.content[0]).toEqual({
      type: "text",
      text: "已生成图片",
    });
    expect(assistantTurn.content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://cdn.example.com/cat.png" },
    });
  });

  it("没带图的历史消息保持原样，不做任何包装", async () => {
    // 零回归防护：纯文字对话的请求体必须与改动前完全一致
    process.env.AI_TEXT_API_KEY = "test-key";
    process.env.AI_TEXT_BASE_URL = "https://provider.example";

    const messages = await captureMessages({
      messages: [
        { role: "user", content: "你好" },
        { role: "assistant", content: "你好，有什么可以帮你" },
      ],
    });

    const userTurn = messages.find((item) => item.role === "user");
    expect(userTurn?.content).toBe("你好");
  });
});
