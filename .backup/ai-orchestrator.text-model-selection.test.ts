import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEXT_MODEL, TEXT_MODEL_FALLBACK_CHAIN, getTextModelDisplayName } from "../shared/text-models";

vi.mock("./brand-kit", () => ({
  brandKitToPrompt: () => "",
  getBrandKit: vi.fn(),
}));
vi.mock("./skill-registry", () => ({
  getSkill: vi.fn(),
  matchSkill: vi.fn(),
}));
vi.mock("./image-generation", () => ({
  editImageWithPrompt: vi.fn(),
  eraseImageObjects: vi.fn(),
  expandImageWithVodKling: vi.fn(),
  generateImages: vi.fn(),
  removeImageBackground: vi.fn(),
}));

import { AIOrchestrator } from "./ai-orchestrator";

beforeEach(() => {
  vi.stubEnv("AI_TEXT_API_KEY", "mock-text-key");
  vi.stubEnv("AI_TEXT_API_KEY_OVERRIDE", "");
  vi.stubEnv("AI_DEEPSEEK_API_KEY", "mock-deepseek-key");
  vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example/v1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function captureRequests(successAt = 0) {
  const bodies: Array<{ model: string; messages: unknown[] }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return bodies.length <= successAt
      ? new Response(JSON.stringify({ error: { message: "上游失败" } }), { status: 503 })
      : new Response(JSON.stringify({
          choices: [{ message: { content: "完成" } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }), { status: 200 });
  }));
  return bodies;
}

const manualChains = [
  ["claude-opus-5-5", ["claude-opus-5-5", "gpt-6-luna", "deepseek-v4-flash"]],
  ["gpt-6-luna", ["gpt-6-luna", "claude-opus-5-5", "deepseek-v4-flash"]],
  ["deepseek-v4-flash", ["deepseek-v4-flash", "claude-opus-5-5", "gpt-6-luna"]],
] as const;

describe("编排器身份回复", () => {
  it.each(manualChains)("手选 %s 失败后按实际成功候选回复名称", async (model, chain) => {
    const bodies = captureRequests(1);
    const result = await new AIOrchestrator().run({
      capability: "chat", prompt: "你是谁？", model, modelSelection: "manual",
      messages: [{ role: "assistant", content: "我是 Kiro" }, { role: "user", content: "你是谁？" }],
    });
    expect(result).toMatchObject({ type: "text", model: chain[1], text: getTextModelDisplayName(chain[1]) });
    expect(bodies.map(body => body.model)).toEqual(chain.slice(0, 2));
  });
});

describe.each(["chat", "brand_kit_parse"] as const)("编排器 %s 手动文本型号优先", (capability) => {
  describe.each(manualChains)("手动选择 %s", (model, chain) => {
    it.each([0, 1, 2])("第 %i 个候选成功时返回实际型号及 usage，图片消息不丢失", async (successAt) => {
      const bodies = captureRequests(successAt);
      const result = await new AIOrchestrator().run({
        capability,
        prompt: "理解图片",
        model: ` ${model} `,
        modelSelection: "manual",
        images: [{ src: "data:image/png;base64,current" }],
        messages: [{ role: "user", content: "历史问题" }],
      });

      expect(bodies.map(body => body.model)).toEqual(chain.slice(0, successAt + 1));
      expect(result).toMatchObject({
        type: "text", capability, route: "text", model: chain[successAt], text: "完成",
        usage: { promptTokens: 12, completionTokens: 3 },
      });
      for (const body of bodies) {
        expect(body.messages.slice(1)).toEqual(bodies[0].messages.slice(1));
        expect(body.messages[0]).toMatchObject({
          role: "system", content: expect.stringContaining(`本次实际执行的模型名称是：${getTextModelDisplayName(body.model)}`),
        });
        expect(body.messages[2]).toEqual({ role: "user", content: [
          { type: "text", text: "以下是当前引用/选中的视觉素材，请结合它们理解用户意图。" },
          { type: "image_url", image_url: { url: "data:image/png;base64,current" } },
        ] });
        expect(body.messages[3]).toEqual({ role: "user", content: "历史问题" });
      }
    });
  });

  it.each([undefined, "auto", "", "claude-opus-5", "unknown", "vod-jimeng"])(
    "manual 的原始型号 %s 无效时，不将路由默认 Luna 误当手动选择", async (model) => {
      const bodies = captureRequests(2);
      await new AIOrchestrator().run({ capability, prompt: "测试", model, modelSelection: "manual" });
      expect(bodies.map(body => body.model)).toEqual(TEXT_MODEL_FALLBACK_CHAIN);
    },
  );

  it.each(TEXT_MODEL_FALLBACK_CHAIN)("无标记型号 %s 仍默认 Claude 首跳", async (model) => {
    const bodies = captureRequests();
    await expect(new AIOrchestrator().run({ capability, prompt: "测试", model }))
      .resolves.toMatchObject({ model: TEXT_MODEL_FALLBACK_CHAIN[0] });
    expect(bodies.map(body => body.model)).toEqual([TEXT_MODEL_FALLBACK_CHAIN[0]]);
  });

  it("显式 DEFAULT_TEXT_MODEL 的旧内部调用仍保留原三级链", async () => {
    const bodies = captureRequests(2);
    await new AIOrchestrator().run({ capability, prompt: "测试", model: DEFAULT_TEXT_MODEL });
    expect(bodies.map(body => body.model)).toEqual(TEXT_MODEL_FALLBACK_CHAIN);
  });
});
