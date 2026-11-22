import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { assertUserCanUseSelectableModel, resolveRequestAccessModel } from "./user-model-access";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";
import { DEFAULT_IMAGE_MODEL_ID } from "../shared/image-models";

describe("user selectable model access", () => {
  it("rejects a disabled frontend-selectable model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: ["gpt-5.4-mini"],
    }, "og-image2-medium", "text_to_image")).toThrow("当前账号无权使用该模型");
  });

  it("does not restrict fixed backend function models", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [],
    }, "picwish-scale", "image_enhance")).not.toThrow();
  });

  it("treats a historical GPT text model as the locked Luna text model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: ["gpt-4o"],
    }, "gpt-4o", "text_generation")).not.toThrow();
  });

  it("does not restrict a fixed legacy image model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [],
    }, "gpt-image-2", "image_edit")).not.toThrow();
  });

  it("resolves auto and unknown image requests to the default selectable model before checking access", () => {
    const user = { allowedAiModels: ["gpt-5.4-mini"] };

    expect(() => assertUserCanUseSelectableModel(user, "auto", "text_to_image"))
      .toThrow("当前账号无权使用该模型");
    expect(() => assertUserCanUseSelectableModel(user, "unrecognized-image-model", "image_edit"))
      .toThrow("当前账号无权使用该模型");
  });

  it("allows the canonical fallback when it is enabled", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [DEFAULT_IMAGE_MODEL_ID],
    }, "auto", "text_to_image")).not.toThrow();
  });

  it("allows a user whose allowlist still holds a retired relay image model", () => {
    /**
     * 存量账号保护：白名单里存的是已下线的中转站 id。
     *
     * 实际运行时 auth-store 读盘就会把它迁移成 vod-* ，
     * 但这里直接传未迁移的原始值，确保鉴权本身也扛得住
     * （例如管理后台直接写入、或历史 API 调用传入旧 id 的场景）。
     */
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [DEFAULT_IMAGE_MODEL_ID],
    }, "og-image2-medium", "text_to_image")).not.toThrow();
  });

  it("allows a user with no explicit allowlist to use every selectable model", () => {
    expect(() => assertUserCanUseSelectableModel({}, "vod-mj", "text_to_image")).not.toThrow();
    expect(() => assertUserCanUseSelectableModel({}, DEFAULT_TEXT_MODEL, "text_generation")).not.toThrow();
  });

  it("honors any historical text allowlist after the switch to gpt-6-luna", () => {
    // 存量账号的 allowedAiModels 里可能存着 Claude / 旧 GPT / DeepSeek id。
    // 若不做新旧互认，这些账号在切换当天会集体拿到「当前账号无权使用该模型」。
    for (const legacy of ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5", "gpt-4o", "claude-opus-5", "claude-sonnet-5", "deepseek-v4-flash"]) {
      expect(() => assertUserCanUseSelectableModel(
        { allowedAiModels: [legacy] },
        DEFAULT_TEXT_MODEL,
        "text_generation",
      )).not.toThrow();
    }
  });

  it("does not let a legacy text allowlist unlock image models", () => {
    // 新旧互认必须严格限定在文本模型内部：
    // 只授权过文本模型的账号，不能因此拿到图片模型的使用权。
    expect(() => assertUserCanUseSelectableModel(
      { allowedAiModels: ["gpt-5.4-mini"] },
      "vod-mj",
      "text_to_image",
    )).toThrow("当前账号无权使用该模型");
  });
});

const exactTextModels = ["claude-opus-5-5", "gpt-6-luna", "deepseek-v4-flash"] as const;
const invalidManualModels = [undefined, null, "", "auto", "unknown", "claude-opus-5", "gpt-image-2", "vod-mj", 42, {}, []];

describe("本次请求的鉴权型号", () => {
  it.each(exactTextModels)("仅显式 manual 的合法型号 %s 替换鉴权参数", (model) => {
    expect(resolveRequestAccessModel({ model: ` ${model} `, modelSelection: "manual" }, DEFAULT_TEXT_MODEL, "text_generation"))
      .toBe(model);
    expect(() => assertUserCanUseSelectableModel({ allowedAiModels: [model] }, model, "text_generation")).not.toThrow();
    expect(() => assertUserCanUseSelectableModel({ allowedAiModels: [] }, model, "text_generation"))
      .toThrow("当前账号无权使用该模型");
  });

  it.each(invalidManualModels.map(model => [model]))("非法 manual 型号 %j 保留原 tracking，而非映射为新授权", (model) => {
    expect(resolveRequestAccessModel({ model, modelSelection: "manual" }, "original-tracking", "text_generation"))
      .toBe("original-tracking");
  });

  it.each([undefined, "auto", "MANUAL", true])("标记 %j 不改变自动请求鉴权", (modelSelection) => {
    expect(resolveRequestAccessModel({ model: "claude-opus-5-5", modelSelection }, "original-tracking", "text_generation"))
      .toBe("original-tracking");
  });

  it.each(["text_to_image", "image_edit", "image_ocr", "text_to_mindmap", undefined] as const)(
    "能力 %s 不使用文本手选覆盖鉴权", (capability) => {
      expect(resolveRequestAccessModel({ model: "claude-opus-5-5", modelSelection: "manual" }, DEFAULT_IMAGE_MODEL_ID, capability))
        .toBe(DEFAULT_IMAGE_MODEL_ID);
    },
  );

  it.each([undefined, null, 42, "manual", []].map(request => [request]))("无有效请求对象 %j 时保留原值", (request) => {
    expect(resolveRequestAccessModel(request, undefined, "text_generation")).toBeUndefined();
  });
});

const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const orchestratorSource = readFileSync(new URL("./ai-orchestrator.ts", import.meta.url), "utf8");

function parseSource(source: string) {
  return ts.createSourceFile("production.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function productionDeclaration(source: string, name: string) {
  const file = parseSource(source);
  const matches = file.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && declaration.name.text === name)),
  );
  expect(matches, `生产声明 ${name} 必须唯一`).toHaveLength(1);
  return matches[0].getText(file).replace(/^export\s+/, "");
}

function productionRoute(source: string, route: string) {
  const file = parseSource(source);
  const matches: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(file) === "app" && node.expression.name.text === "post"
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === route) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(matches, `生产路由 ${route} 必须唯一`).toHaveLength(1);
  return `${matches[0].getText(file)};`;
}

// 只编译实际生产声明和两个路由；不加载 index 的启动副作用，所有 IO 均由 mock 接管。
function createProductionAccessHarness(route: string, allowedAiModels: string[], source = indexSource) {
  const functions = [
    "handleTrackedAiRequest", "getRouteModel", "capabilityFromOrchestrator",
    "requestedOrchestratorCapability", "resolveProviderByCapability", "aiRequestErrorStatus", "aiBillingErrorBody",
  ].map(name => productionDeclaration(source, name));
  const auth = vi.fn(assertUserCanUseSelectableModel);
  const reserve = vi.fn(async (_input: Record<string, unknown>) => ({ taskId: "mock-reservation", active: true }));
  const record = vi.fn(async (_input: Record<string, unknown>) => undefined);
  const release = vi.fn(async () => undefined);
  const execute = vi.fn(async (body: Record<string, unknown>) => ({
    text: "完成", capability: body.capability || "chat", model: "claude-opus-5-5",
  }));
  const user = { id: "mock-user", username: "mock-user", allowedAiModels };
  let handler!: (req: unknown, res: unknown) => Promise<void>;
  const code = ts.transpileModule([
    ...functions,
    productionDeclaration(orchestratorSource, "AI_CAPABILITIES"),
    productionDeclaration(orchestratorSource, "inferAiCapability"),
    productionRoute(source, route),
  ].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  runInNewContext(code, {
    app: { post: (_path: string, callback: typeof handler) => { handler = callback; } },
    DEFAULT_TEXT_MODEL,
    Error,
    TEXT_PROVIDER_BKEEL: "BKEEL",
    resolveRequestAccessModel,
    assertUserCanUseSelectableModel: auth,
    requireSessionUser: async () => user,
    resolveClientIp: () => "127.0.0.1",
    trustProxyHeaders: false,
    aiRateLimiter: { check: () => ({ allowed: true, remaining: 100 }) },
    withUserMemory: async (_user: unknown, body: unknown) => body,
    rememberPromptQuietly: vi.fn(async () => undefined),
    reserveAiRouteUsage: reserve,
    recordAiRouteUsage: record,
    releaseAiRouteUsage: release,
    generateText: execute,
    orchestrator: { run: execute },
    resolveImageProviderLabel: () => "mock-image-provider",
    AiBillingError: class extends Error {},
  });
  return {
    auth, reserve, record, release, execute,
    async request(body: Record<string, unknown>) {
      const res = {
        statusCode: 200, headersSent: false, body: undefined as unknown,
        setHeader: vi.fn(),
        status(status: number) { this.statusCode = status; return this; },
        json(payload: unknown) { this.body = payload; this.headersSent = true; return this; },
      };
      await handler({ body, headers: {}, socket: { remoteAddress: "127.0.0.1" } }, res);
      return res;
    },
  };
}

const productionExits = [
  ["/api/llm", {}],
  ["/api/ai/orchestrate", { capability: "chat" }],
  ["/api/ai/orchestrate", { capability: "brand_kit_parse" }],
] as const;

describe.each(productionExits)("真实生产出口 %s %j 的请求鉴权", (route, capabilityBody) => {
  it.each(exactTextModels)("只授权 %s 即可手选，不需要额外授权 Luna", async (model) => {
    const harness = createProductionAccessHarness(route, [model]);
    const body = { ...capabilityBody, prompt: "测试", model: ` ${model} `, modelSelection: "manual" };
    const res = await harness.request(body);
    expect(res.statusCode).toBe(200);
    expect(harness.auth).toHaveBeenCalledOnce();
    expect(harness.auth).toHaveBeenCalledWith(expect.anything(), model, "text_generation");
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.execute).toHaveBeenCalledWith(body);
    expect(harness.reserve).toHaveBeenCalledOnce();
    expect(harness.reserve.mock.calls[0][0]).toMatchObject({
      tracking: { model: DEFAULT_TEXT_MODEL, capabilityKey: "text_generation", provider: route === "/api/llm" ? "AI_TEXT" : "BKEEL" },
      request: body,
    });
    expect(harness.record).toHaveBeenCalledOnce();
    expect(harness.record.mock.calls[0][0]).toMatchObject({
      status: "success", tracking: { model: route === "/api/llm" ? DEFAULT_TEXT_MODEL : "claude-opus-5-5" },
    });
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.auth.mock.invocationCallOrder[0]).toBeLessThan(harness.reserve.mock.invocationCallOrder[0]);
    expect(harness.reserve.mock.invocationCallOrder[0]).toBeLessThan(harness.execute.mock.invocationCallOrder[0]);
  });

  it.each(exactTextModels)("无授权时手选 %s 返回 403，不能进入预留或上游", async (model) => {
    const harness = createProductionAccessHarness(route, []);
    const res = await harness.request({ ...capabilityBody, model, modelSelection: "manual" });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "当前账号无权使用该模型" });
    expect(harness.auth).toHaveBeenCalledOnce();
    expect(harness.auth).toHaveBeenCalledWith(expect.anything(), model, "text_generation");
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.record).toHaveBeenCalledOnce();
    expect(harness.record.mock.calls[0][0]).toMatchObject({ status: "failed", tracking: { model: DEFAULT_TEXT_MODEL } });
  });

  it.each(exactTextModels)("只有其他非历史型号授权不能手选 %s", async (model) => {
    const harness = createProductionAccessHarness(route, [model === "claude-opus-5-5" ? DEFAULT_TEXT_MODEL : "claude-opus-5-5"]);
    const res = await harness.request({ ...capabilityBody, model, modelSelection: "manual" });
    expect(res.statusCode).toBe(403);
    expect(harness.auth).toHaveBeenCalledOnce();
    expect(harness.auth).toHaveBeenCalledWith(expect.anything(), model, "text_generation");
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it.each([undefined, "auto", "MANUAL", true])("非 manual 标记 %j 仍按原 Luna 鉴权", async (modelSelection) => {
    for (const [allowed, expectedStatus] of [[["claude-opus-5-5"], 403], [[DEFAULT_TEXT_MODEL], 200]] as const) {
      const harness = createProductionAccessHarness(route, [...allowed]);
      const res = await harness.request({ ...capabilityBody, model: "claude-opus-5-5", modelSelection });
      expect(res.statusCode).toBe(expectedStatus);
      expect(harness.auth).toHaveBeenCalledOnce();
      expect(harness.auth).toHaveBeenCalledWith(expect.anything(), DEFAULT_TEXT_MODEL, "text_generation");
      expect(harness.execute).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
    }
  });

  it.each(invalidManualModels.map(model => [model]))("非法手选 %j 不借固定后端模型或历史型号绕过原鉴权", async (model) => {
    for (const [allowed, expectedStatus] of [[["claude-opus-5-5"], 403], [[DEFAULT_TEXT_MODEL], 200]] as const) {
      const harness = createProductionAccessHarness(route, [...allowed]);
      const res = await harness.request({ ...capabilityBody, model, modelSelection: "manual" });
      expect(res.statusCode).toBe(expectedStatus);
      expect(harness.auth).toHaveBeenCalledOnce();
      expect(harness.auth).toHaveBeenCalledWith(expect.anything(), DEFAULT_TEXT_MODEL, "text_generation");
      expect(harness.reserve).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
      expect(harness.execute).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
    }
  });

  it("保留 DeepSeek 历史授权对自动 Luna 的互认", async () => {
    const harness = createProductionAccessHarness(route, ["deepseek-v4-flash"]);
    const res = await harness.request({ ...capabilityBody, model: "auto" });
    expect(res.statusCode).toBe(200);
    expect(harness.auth).toHaveBeenCalledOnce();
    expect(harness.auth).toHaveBeenCalledWith(expect.anything(), DEFAULT_TEXT_MODEL, "text_generation");
  });
});

it("编排图片出口仍校验原图片型号权限", async () => {
  const harness = createProductionAccessHarness("/api/ai/orchestrate", ["claude-opus-5-5"]);
  const res = await harness.request({ capability: "text_to_image", model: "vod-mj", modelSelection: "manual" });
  expect(res.statusCode).toBe(403);
  expect(harness.auth).toHaveBeenCalledOnce();
  expect(harness.auth).toHaveBeenCalledWith(expect.anything(), "vod-mj", "text_to_image");
  expect(harness.reserve).not.toHaveBeenCalled();
  expect(harness.execute).not.toHaveBeenCalled();
});
