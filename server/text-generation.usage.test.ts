import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEXT_MODEL,
  FALLBACK_TEXT_MODEL,
  HISTORICAL_TEXT_MODEL_IDS,
  PRIMARY_TEXT_MODEL,
  SELECTABLE_TEXT_MODEL_IDS,
  SUPPORTED_TEXT_MODEL_IDS,
  TEXT_MODEL_FALLBACK_CHAIN,
  isKnownTextModelId,
} from "../shared/text-models";

const C = "claude-opus-5-5";
const L = "gpt-6-luna";
const D = "deepseek-v4-flash";
const TEXT_KEYS = [C, L]; // 共用 AI_TEXT_API_KEY 的前两个候选

const ENV_KEYS = [
  "AI_TEXT_API_KEY", "AI_TEXT_API_KEY_OVERRIDE", "AI_TEXT_MODEL", "AI_TEXT_BASE_URL",
  "AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "AI_DEEPSEEK_API_KEY", "AI_TEXT_CANDIDATE_TIMEOUT_MS", "OTHER_API_KEY",
];

beforeEach(() => {
  for (const name of ENV_KEYS) {
    vi.stubEnv(name, "");
    delete process.env[name];
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function loadGenerateText() {
  vi.resetModules();
  return (await import("./text-generation")).generateText;
}

function respond(content = "完成", extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], ...extra }), { status: 200 });
}
function fail(status = 503, message = "上游暂不可用") {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

function setupFetch(handler?: (url: string, init: RequestInit, model: string) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (handler) {
      const model = JSON.parse(String(init.body)).model as string;
      return handler(url, init, model);
    }
    return respond();
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    calls,
    body: (call: { init: RequestInit }) => JSON.parse(String(call.init.body)),
    models: () => calls.map((call) => JSON.parse(String(call.init.body)).model as string),
  };
}

function configureTextKeys() {
  vi.stubEnv("AI_TEXT_API_KEY", "mock-text-key");
  vi.stubEnv("AI_DEEPSEEK_API_KEY", "mock-deepseek-key");
  vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example");
}

describe("三级降级链与可选列表", () => {
  it("Claude 第一、Luna 第二、DS 第三；UI 仍仅 Luna", () => {
    expect(PRIMARY_TEXT_MODEL).toBe(C);
    expect(DEFAULT_TEXT_MODEL).toBe(L);
    expect(FALLBACK_TEXT_MODEL).toBe(D);
    expect(TEXT_MODEL_FALLBACK_CHAIN).toEqual([C, L, D]);
    expect(SELECTABLE_TEXT_MODEL_IDS).toEqual([L]);
    expect(SUPPORTED_TEXT_MODEL_IDS).toEqual([C, L, D]);
    expect(HISTORICAL_TEXT_MODEL_IDS).toContain("claude-opus-5");
    expect(isKnownTextModelId(C)).toBe(true);
    expect(isKnownTextModelId(L)).toBe(true);
    expect(isKnownTextModelId(D)).toBe(true);
  });

  it("历史 model 参数与旧 AI_TEXT_MODEL 都不能改变上游首选型号", async () => {
    configureTextKeys();
    vi.stubEnv("AI_TEXT_MODEL", "gpt-6-luna");
    const { calls, body } = setupFetch();
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "你好", model: D })).resolves.toMatchObject({ model: C });
    expect(calls).toHaveLength(1);
    expect(body(calls[0]).model).toBe(C);
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer mock-text-key" });
    expect(String(calls[0].url)).toContain("/v1/chat/completions");
  });

  it.each(["claude-opus-5", "claude-sonnet-5", "gpt-5.5", L, D, "unknown", "", " responses-only "])(
    "input.model 和 AI_TEXT_MODEL 均为 %s 时健康链首个候选仍是 Claude",
    async (model) => {
      configureTextKeys();
      vi.stubEnv("AI_TEXT_MODEL", model);
      const { calls, body } = setupFetch();
      const generateText = await loadGenerateText();

      await generateText({ prompt: "测试", model });
      expect(body(calls[0]).model).toBe(C);
      expect(calls).toHaveLength(1);
    },
  );

  it("首个候选保留 usage 与 temperature", async () => {
    configureTextKeys();
    const { calls, body } = setupFetch((_u, _i, model) => model === C
      ? respond("已生成文案", { usage: { prompt_tokens: 812, completion_tokens: 216 } })
      : respond());
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "生成产品文案" })).resolves.toEqual({
      text: "已生成文案",
      model: C,
      usage: { promptTokens: 812, completionTokens: 216 },
    });
    expect(body(calls[0])).toMatchObject({ model: C, temperature: 0.7 });
  });

  it("全缺凭据时明确失败，不借用图片或 OpenAI 凭据", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "mock-image-key");
    vi.stubEnv("OPENAI_API_KEY", "mock-openai-key");
    const { fetchMock } = setupFetch();
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试" })).rejects.toThrow("Missing AI_TEXT_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 429, 503])("未配置 DS 时 HTTP %s 只尝试共用文本 key 的两次候选", async (status) => {
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example");
    const { fetchMock, models } = setupFetch(() => fail(status));
    const generateText = await loadGenerateText();

    const error = await generateText({ prompt: "测试" }).catch((error: Error) => error);
    expect(String(error)).toContain("文本请求失败");
    expect(String(error)).toContain(`Chat HTTP ${status}`);
    expect(String(error)).toContain("上游暂不可用");
    expect(models()).toEqual([C, L]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["empty", "reasoning-only", "network"])("未配置 DS 时 %s 不借用其他凭据", async (failure) => {
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_IMAGE_API_KEY", "mock-image-key");
    vi.stubEnv("OPENAI_API_KEY", "mock-openai-key");
    const { models } = setupFetch((_u, _i, model) => {
      if (failure === "network") throw new TypeError("network unavailable");
      return new Response(JSON.stringify({ choices: [{ message: failure === "reasoning-only" ? { reasoning_content: "只有推理" } : { content: "" } }] }), { status: 200 });
    });
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试" })).rejects.toThrow(failure === "network" ? "network unavailable" : "文本模型未返回正文");
    expect(models()).toEqual([C, L]);
  });

  it("空正文不触发协议兜底，也不换模型", async () => {
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example");
    const { calls, models } = setupFetch(() => new Response(
      JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 },
    ));
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试" })).rejects.toThrow("文本模型未返回正文");
    expect(models()).toEqual([C, L]);
    expect(String(calls[0].url)).not.toContain("/responses");
  });

  it("凭据脱敏、限长，不回传原始响应体", async () => {
    vi.stubEnv("AI_TEXT_API_KEY", "mock-text-key");
    vi.stubEnv("AI_TEXT_API_KEY_OVERRIDE", "mock-override-key");
    vi.stubEnv("AI_IMAGE_API_KEY", "mock-image-key");
    vi.stubEnv("OPENAI_API_KEY", "mock-openai-key");
    vi.stubEnv("OTHER_API_KEY", "mock-other-key");
    const keys = ["mock-text-key", "mock-override-key", "mock-image-key", "mock-openai-key", "mock-other-key"];
    const { fetchMock } = setupFetch(() => new Response(JSON.stringify({
      error: { message: `鉴权失败 ${keys.join(" ")} ${"长".repeat(2000)}` },
      raw: "不得抛出整个body",
    }), { status: 401 }));
    const generateText = await loadGenerateText();

    const error = await generateText({ prompt: "测试" }).catch((error: Error) => error);
    expect(String(error)).toContain("[REDACTED]");
    for (const key of keys) expect(String(error)).not.toContain(key);
    expect(String(error)).not.toMatch(/raw-only|不得抛出整个body/);
    expect(String(error).length).toBeLessThan(1200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("降级切换与凭据边界", () => {
  it.each([
    ["https://provider.example", "https://provider.example/v1/chat/completions"],
    ["https://provider.example/v1/", "https://provider.example/v1/chat/completions"],
  ])("三级共用 baseURL %s；文本候选共用 override、DS 用独立 key，返回 DS 的 usage", async (baseUrl, endpoint) => {
    vi.stubEnv("AI_TEXT_API_KEY", "mock-text-key");
    vi.stubEnv("AI_TEXT_API_KEY_OVERRIDE", "mock-override-key");
    vi.stubEnv("AI_DEEPSEEK_API_KEY", "mock-deepseek-key");
    vi.stubEnv("AI_TEXT_BASE_URL", baseUrl);
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example");
    vi.stubEnv("OPENAI_BASE_URL", "https://openai.example");
    const { calls, body, models } = setupFetch((_u, _i, model) => model === D
      ? respond("备用完成", { usage: { prompt_tokens: 123, completion_tokens: 45 } })
      : fail(503, "主服务不可用"));
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试", model: "unknown" })).resolves.toEqual({
      text: "备用完成", model: D, usage: { promptTokens: 123, completionTokens: 45 },
    });
    expect(models()).toEqual([C, L, D]);
    expect(calls.map((call) => call.url)).toEqual([endpoint, endpoint, endpoint]);
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer mock-override-key" });
    expect(calls[1].init.headers).toMatchObject({ Authorization: "Bearer mock-override-key" });
    expect(calls[2].init.headers).toMatchObject({ Authorization: "Bearer mock-deepseek-key" });
    expect(body(calls[2])).toEqual({ ...body(calls[0]), model: D });
  });

  it.each(["仅文本 key", "仅 DS", "仅 DS 且不借用图片 base", "仅 DS 且不借用 OpenAI base"])(
    "%s 凭据配置可用，不向缺 key 的候选发请求", async (configured) => {
      const textOnly = configured === "仅文本 key";
      vi.stubEnv(textOnly ? "AI_TEXT_API_KEY" : "AI_DEEPSEEK_API_KEY", "mock-only-key");
      vi.stubEnv(configured.includes("图片") ? "AI_IMAGE_BASE_URL" : configured.includes("OpenAI") ? "OPENAI_BASE_URL" : "AI_TEXT_BASE_URL", "https://provider.example/v1");
      const { calls, body } = setupFetch();
      const generateText = await loadGenerateText();
      const model = textOnly ? C : D;

      await expect(generateText({ prompt: "测试" })).resolves.toMatchObject({ text: "完成", model });
      expect(calls).toHaveLength(1);
      expect(body(calls[0]).model).toBe(model);
      expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer mock-only-key" });
      expect(calls[0].url).toBe(configured.includes("base")
        ? "https://token.bkeel.com/v1/chat/completions"
        : "https://provider.example/v1/chat/completions");
    },
  );

  it.each([401, 429, 503, "network", "body", "empty", "whitespace", "reasoning-only"])(
    "文本候选 %s 后切到 DS，不调用 responses 协议", async (failure) => {
      configureTextKeys();
      const { calls, body, models } = setupFetch((_u, _i, model) => {
        if (model === D) return respond("备用正文");
        if (failure === "network") throw new TypeError("fetch failed");
        if (failure === "body") return { ok: true, status: 200, text: async () => { throw new Error("body interrupted"); } } as Response;
        if (typeof failure === "number") return fail(failure, "上游失败");
        return new Response(JSON.stringify({ choices: [{ message: failure === "reasoning-only" ? { reasoning_content: "只有推理不是正文" } : { content: failure === "empty" ? "" : " \n\t " } }] }), { status: 200 });
      });
      const generateText = await loadGenerateText();

      const result = await generateText({ prompt: "测试" });
      expect(result).toMatchObject({ text: "备用正文", model: D });
      expect(result.usage).toBeUndefined();
      expect(models()).toEqual([C, L, D]);
      expect(calls.every((call) => call.url === "https://provider.example/v1/chat/completions")).toBe(true);
      expect(body(calls[2]).messages).toEqual(body(calls[0]).messages);
      expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer mock-text-key" });
      expect(calls[2].init.headers).toMatchObject({ Authorization: "Bearer mock-deepseek-key" });
    },
  );

  it.each(["HTTP", "network", "reasoning-only"])("三级全 %s 失败最多三次，错误聚合、限长并脱敏", async (failure) => {
    const secrets = ["mock-text-key", "mock-override-key", "mock-deepseek-key", "mock-image-key", "mock-openai-key", "mock-other-key"];
    for (const [index, name] of ["AI_TEXT_API_KEY", "AI_TEXT_API_KEY_OVERRIDE", "AI_DEEPSEEK_API_KEY", "AI_IMAGE_API_KEY", "OPENAI_API_KEY", "OTHER_API_KEY"].entries()) {
      vi.stubEnv(name, secrets[index]);
    }
    vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example");
    const { models } = setupFetch((_u, _i, model) => {
      const detail = `${model} 错误 ${secrets.join(" ")} ${"长".repeat(2000)} 不应保留的错误尾部`;
      if (failure === "network") throw new Error(detail);
      if (failure === "reasoning-only") return new Response(JSON.stringify({ choices: [{ message: { reasoning_content: detail } }] }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: detail }, raw: "不得抛出整个body" }), { status: 401 });
    });
    const generateText = await loadGenerateText();

    const error = await generateText({ prompt: "测试" }).catch((error: Error) => error);
    const message = String(error);
    for (const model of [C, L, D]) expect(message).toContain(model);
    if (failure !== "reasoning-only") {
      expect(message).toContain("[REDACTED]");
    } else {
      expect(message).toContain("文本模型未返回正文");
    }
    for (const secret of secrets) expect(message).not.toContain(secret);
    expect(message).not.toMatch(/不得抛出整个body|不应保留的错误尾部/);
    for (const detail of message.match(/长+/g) ?? []) expect(detail.length).toBeLessThanOrEqual(400);
    expect(message.length).toBeLessThan(1500);
    expect(models()).toEqual([C, L, D]);
  });

  it("文本 key 缺失但 DS 失败时只请求一次 DS，不借用其他 key 或模型", async () => {
    vi.stubEnv("AI_DEEPSEEK_API_KEY", "mock-deepseek-key");
    vi.stubEnv("AI_IMAGE_API_KEY", "mock-image-key");
    vi.stubEnv("OPENAI_API_KEY", "mock-openai-key");
    const { calls, body } = setupFetch(() => fail(503));
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试" })).rejects.toThrow("Chat HTTP 503");
    expect(calls).toHaveLength(1);
    expect(body(calls[0]).model).toBe(D);
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer mock-deepseek-key" });
  });

  it("业务结构校验不合格逐级触发备用，校验函数不下发上游", async () => {
    configureTextKeys();
    const { calls, body } = setupFetch((_u, _i, model) => respond(model === D ? '{"ok":true}' : "not-json"));
    const generateText = await loadGenerateText();
    const validateOutput = (text: string) => { try { return JSON.parse(text).ok === true; } catch { return false; } };

    await expect(generateText({ prompt: "严格JSON", validateOutput })).resolves.toMatchObject({ model: D, text: '{"ok":true}' });
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(body(call)).not.toHaveProperty("validateOutput");
  });

  it.each([
    undefined, "general", "chat", "brand_kit_parse", "brand-kit-parse", "multimodal-text-extraction",
    "mindmap", "workspace-chat-generation", "home-prompt-chat", "home-prompt-canvas-router",
    "home-prompt-documents", "bottom-global-prompt-router", "bottom-global-prompt-chat",
    "right-ai-assistant", "right-ai-assistant-chat", "right-ai-assistant-documents",
    "node-composer-chat", "node-composer-documents", "chat-node", "prompt-node-generation",
    "image-quick-edit-prompt", "model3d-view-render-prompt", "image-prompt-reverse-engineering",
    "commercial-ocr-copy-structure", "帮助与反馈", "帮助弹窗", "unknown-module",
  ])("模块 %s 均走相同的 Claude → Luna → DS 链", async (module) => {
    configureTextKeys();
    const { calls, body, models } = setupFetch((_u, _i, model) => model === D ? respond() : fail(503));
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "测试", module })).resolves.toMatchObject({ model: D });
    expect(models()).toEqual([C, L, D]);
    expect(body(calls[1]).messages).toEqual(body(calls[0]).messages);
    expect(body(calls[1]).messages[1]).toEqual({ role: "system", content: `当前能力模块：${module || "general"}` });
  });
});

describe("多模态与超时保护", () => {
  it.each([false, true])("当前图、历史 images 与历史内联图全部保留原顺序（降级：%s）", async (degrade) => {
    configureTextKeys();
    const { calls, body, models } = setupFetch((_u, _i, model) => degrade && model === C ? fail(503) : respond());
    const generateText = await loadGenerateText();
    const inline = [
      { type: "image_url" as const, image_url: { url: "data:image/png;base64,inline-first" } },
      { type: "text" as const, text: "中间文字" },
      { type: "image_url" as const, image_url: { url: "https://cdn.example/inline-second.png" } },
    ];

    const result = await generateText({
      images: [{ src: "https://cdn.example/current-a.png" }, { src: "https://cdn.example/current-b.png" }],
      messages: [
        { role: "assistant", content: inline, images: [{ src: "https://cdn.example/history-a.png" }] },
        { role: "user", content: "第二轮图片", images: [{ src: "https://cdn.example/history-b.png" }, { src: "https://cdn.example/history-c.png" }] },
        { role: "assistant", content: "第二轮回复" },
        { role: "user", content: "理解全部图片" },
      ],
    });
    expect(result.model).toBe(degrade ? L : C);

    const messages = body(calls[0]).messages;
    expect(messages[2].content.slice(1)).toEqual([
      { type: "image_url", image_url: { url: "https://cdn.example/current-a.png" } },
      { type: "image_url", image_url: { url: "https://cdn.example/current-b.png" } },
    ]);
    expect(messages[3].content).toEqual([
      ...inline,
      { type: "image_url", image_url: { url: "https://cdn.example/history-a.png" } },
    ]);
    expect(messages[4]).toEqual({ role: "user", content: [
      { type: "text", text: "第二轮图片" },
      { type: "image_url", image_url: { url: "https://cdn.example/history-b.png" } },
      { type: "image_url", image_url: { url: "https://cdn.example/history-c.png" } },
    ] });
    expect(messages.slice(5)).toEqual([
      { role: "assistant", content: "第二轮回复" },
      { role: "user", content: "理解全部图片" },
    ]);
    expect(models()).toEqual(degrade ? [C, L] : [C]);
    for (const call of calls) {
      expect(body(call).messages).toEqual(messages);
      expect(String(call.url)).not.toContain("/responses");
    }
  });

  it.each(["fetch", "body"])("首个候选 %s 超时后切下一个，旧 timer 已清理", async (stage) => {
    configureTextKeys();
    vi.stubEnv("AI_TEXT_CANDIDATE_TIMEOUT_MS", "40");
    vi.useFakeTimers();
    const { calls, body } = setupFetch((_u, _i, model) => {
      if (model === C) return stage === "fetch"
        ? new Promise<Response>(() => {})
        : { ok: true, status: 200, text: () => new Promise<string>(() => {}) } as Response;
      return respond();
    });
    const generateText = await loadGenerateText();
    const pending = generateText({ prompt: "测试" }).catch((error: Error) => error);

    await vi.advanceTimersByTimeAsync(39);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toMatchObject({ model: L });
    expect(calls.map((call) => body(call).model)).toEqual([C, L]);
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(calls[1].init.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("文本候选超时、Luna HTTP 失败后 DS 有独立预算并成功", async () => {
    configureTextKeys();
    vi.stubEnv("AI_TEXT_CANDIDATE_TIMEOUT_MS", "40");
    vi.useFakeTimers();
    const { calls, body } = setupFetch((_u, _i, model) => {
      if (model === C) return new Promise<Response>(() => {});
      if (model === L) return fail(503);
      return new Promise<Response>((resolve) => setTimeout(() => resolve(
        respond("备用完成", { usage: { prompt_tokens: 12, completion_tokens: 3 } }), 30,
      )));
    });
    const generateText = await loadGenerateText();
    const pending = generateText({ prompt: "测试" }).catch((error: Error) => error);

    await vi.advanceTimersByTimeAsync(40);
    expect(calls.map((call) => body(call).model)).toEqual([C, L, D]);
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(calls[1].init.signal).not.toBe(calls[0].init.signal);
    expect(calls[2].init.signal).not.toBe(calls[1].init.signal);
    await vi.advanceTimersByTimeAsync(30);
    expect(await pending).toEqual({ text: "备用完成", model: D, usage: { promptTokens: 12, completionTokens: 3 } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["fetch", "body"])("三级全 %s 超时，各自完整预算且最多三请求", async (stage) => {
    configureTextKeys();
    vi.stubEnv("AI_TEXT_CANDIDATE_TIMEOUT_MS", "40");
    vi.useFakeTimers();
    const { calls, body } = setupFetch(() => stage === "fetch"
      ? new Promise<Response>(() => {})
      : { ok: true, status: 200, text: () => new Promise<string>(() => {}) } as Response);
    const generateText = await loadGenerateText();
    const pending = generateText({ prompt: "测试" }).catch((error: Error) => error);

    // 每推进一个完整预算，超时候选立即发起下一个：1→2→3 个请求。
    await vi.advanceTimersByTimeAsync(40);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(40);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(40);
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    for (const model of [C, L, D]) expect(String(error)).toContain(model);
    expect(String(error).match(/文本请求超时（40ms）/g)).toHaveLength(3);
    expect(calls.map((call) => body(call).model)).toEqual([C, L, D]);
    expect(calls.every((call) => call.init.signal?.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([["首候选", false], ["末候选", true]])("%s 的 fetch 与 body 共用一个 timeout 预算", async (_label, useDs) => {
    vi.stubEnv("AI_TEXT_API_KEY", "mock-text-key");
    if (useDs) vi.stubEnv("AI_DEEPSEEK_API_KEY", "mock-deepseek-key");
    vi.stubEnv("AI_TEXT_CANDIDATE_TIMEOUT_MS", "40");
    vi.useFakeTimers();
    const target = useDs ? D : C;
    const { calls } = setupFetch((_u, _i, model) => {
      if (model === target) {
        // 25ms 时 fetch resolve，但 body 永久 pending；若预算独立则 40ms 不会到期。
        return new Promise<Response>((resolve) => setTimeout(() => resolve({
          ok: true, status: 200, text: () => new Promise<string>(() => {}),
        } as Response), 25));
      }
      return useDs ? fail(503) : respond();
    });
    const generateText = await loadGenerateText();
    const pending = generateText({ prompt: "测试" }).catch((error: Error) => error);

    if (useDs) {
      // C、L 立即 HTTP 失败，D 进入 body pending。
      await vi.advanceTimersByTimeAsync(39);
      expect(calls).toHaveLength(3);
      expect(calls[2].init.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await pending;
      expect(String(error)).toContain("文本请求超时（40ms）");
      expect(calls[2].init.signal?.aborted).toBe(true);
    } else {
      await vi.advanceTimersByTimeAsync(39);
      expect(calls).toHaveLength(1);
      expect(calls[0].init.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      // C 超时后 L 快速成功，链路结束。
      expect(await pending).toMatchObject({ model: L });
      expect(calls[0].init.signal?.aborted).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["", 30_000], ["NaN", 30_000], ["0", 30_000], ["-1", 30_000], ["Infinity", 30_000], ["999999999", 120_000],
  ])("超时配置 %s 使用有界预算 %i ms", async (configured, expected) => {
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_CANDIDATE_TIMEOUT_MS", String(configured));
    vi.useFakeTimers();
    const { calls, body } = setupFetch((_u, _i, model) => model === C
      ? new Promise<Response>(() => {})
      : respond());
    const generateText = await loadGenerateText();
    const pending = generateText({ prompt: "测试" });

    await vi.advanceTimersByTimeAsync(expected - 1);
    expect(calls).toHaveLength(1);
    expect(body(calls[0]).model).toBe(C);
    expect(calls[0].init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // C 恰在 expected 到期被取消，随后 L 快速成功，验证预算值被正确有界化。
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(await pending).toMatchObject({ model: L });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("严格业务 JSON 仍由调用方解析", async () => {
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://provider.example");
    const { fetchMock } = setupFetch(() => respond("```json\n{invalid}\n```"));
    const generateText = await loadGenerateText();

    await expect(generateText({ prompt: "返回 JSON" })).resolves.toMatchObject({
      text: "```json\n{invalid}\n```",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("缺少提示词时即使全链配置也直接失败", async () => {
    configureTextKeys();
    const { fetchMock } = setupFetch();
    const generateText = await loadGenerateText();

    await expect(generateText({})).rejects.toThrow("Missing prompt");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
