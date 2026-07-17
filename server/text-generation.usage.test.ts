import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_TEXT_API_KEY;
  delete process.env.AI_TEXT_BASE_URL;
});

describe("text generation usage", () => {
  it("returns token usage exactly as supplied by the chat provider", async () => {
    process.env.AI_TEXT_API_KEY = "test-key";
    process.env.AI_TEXT_BASE_URL = "https://provider.example";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "已生成文案" } }],
      usage: { prompt_tokens: 812, completion_tokens: 216 },
    }), { status: 200 })));
    vi.resetModules();
    const { generateText } = await import("./text-generation");

    await expect(generateText({ prompt: "生成产品文案" })).resolves.toEqual({
      text: "已生成文案",
      model: "gpt-4o",
      usage: { promptTokens: 812, completionTokens: 216 },
    });
  });
});
