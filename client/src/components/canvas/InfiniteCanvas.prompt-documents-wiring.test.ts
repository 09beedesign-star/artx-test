import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { assertStripKeptSource, stripSourceComments } from "../../../../shared/strip-source-comments";
import { validatePromptDocuments } from "../../../../shared/prompt-documents";
import { getExplicitReferenceSearchDecision } from "../../lib/ai-intent";

const raw = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");
const code = stripSourceComments(raw);
assertStripKeptSource(raw, code);
function section(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`接线锚点失效：${start} / ${end}`);
  return source.slice(a, b);
}
const submit = section(code, "  async function handleSubmit()", "  return (\n    <>");
const prepare = section(submit, "  async function handleSubmit()", '    if (assistantModelPanelCategory === "3d" && !explicitReferenceDecision)');
const node = section(code, "  const handleAssetEditSubmit = useCallback(", "  const handleNodeComposerSubmit = useCallback(");
const home = section(code, "    const payload = peekHomePromptHandoff(projectId)", "  async function handleSubmit()");
const bar = section(code, "function AssetEditPromptBar(", "function ZoomControlBar(");

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function eventBus() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
    dispatchEvent: vi.fn((event: { type: string }) => {
      listeners.get(event.type)?.forEach(listener => listener());
      return true;
    }),
  };
}

function mountLayoutEffect(source: string, env: Record<string, unknown>) {
  let cleanup: (() => void) | undefined;
  let dependencies: unknown[] = [];
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("useLayoutEffect", ...Object.keys(env), js)((effect: () => (() => void) | void, deps: unknown[]) => {
    cleanup = effect() || undefined;
    dependencies = deps;
  }, ...Object.values(env));
  return { cleanup: () => cleanup?.(), dependencies };
}

const assistantScopeEffect = section(code, "  useLayoutEffect(() => {\n    if (documentSubmitLockRef.current)", "  const messagesConversationRef");
const nodeScopeEffect = section(code, "  useLayoutEffect(() => {\n    const reset = () => {\n      assetDocumentEpochRef", "  const handleAssetEditSubmit");
const barScopeEffect = section(bar, "  useLayoutEffect(() => {", "  useEffect(() => {");

function changeConversation(env: Record<string, unknown>, bus = eventBus(), source = assistantScopeEffect) {
  const stop = section(code, "  const stopAssistantSubmission = useCallback(", "  useEffect(\n    () => () => {");
  const js = ts.transpileModule(stop, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const stopAssistantSubmission = new Function("useCallback", ...Object.keys(env), `${js}; return stopAssistantSubmission;`)(
    (callback: unknown) => callback, ...Object.values(env),
  );
  const scope = mountLayoutEffect(source, {
    ...env, stopAssistantSubmission, window: bus, Event, projectId: "same-canvas", activeConversationId: "new-conversation",
  });
  return { bus, scope };
}

function preparationHarness(overrides: Record<string, unknown> = {}, source = prepare) {
  const docs = [{ id: "d1", name: "brief.txt", format: "txt", size: 5, text: "正文", structure: "段落" }];
  const env = {
    isSubmitting: false, documentSubmitLockRef: { current: false }, documentSubmissionEpochRef: { current: 0 },
    promptDocuments: { assertReady: vi.fn(() => docs), clear: vi.fn() }, assistantAbortRef: { current: null },
    assistantModelPanelCategory: "image", isAuthenticated: true,
    onLoginRequest: vi.fn(), toast: vi.fn(), notifyAiFailure: vi.fn(), hasPrompt: false, hasContext: false,
    hasActiveSkill: false, assistantModelOptions: [{}], composerPrompt: "", contextLabel: "", activeSkill: null,
    activeSkillContext: "", composerText: "", composerImages: [], composerAnnotations: [], composerSegments: [],
    getAssistantComposerVisualReferences: () => [], setIsSubmitting: vi.fn(), setSubmittingKind: vi.fn(),
    resolvePromptDocumentIntent: vi.fn(async () => ({ mode: "text", reply: "总结" })), assistantAutoMode: true,
    assistantModelTab: "image", assistantTextModel: { id: "gpt-6-luna" },
    getExplicitReferenceSearchDecision, setAssistantAutoMode: vi.fn(), setAssistantModelPanelCategory: vi.fn(),
    buildAssistantContext: vi.fn(() => []), messages: [], ...overrides,
  };
  const js = ts.transpileModule(`${source}\nreturn { documentDecision, submittedDocuments };\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const run = new Function(...Object.keys(env), `${js}; return handleSubmit;`)(...Object.values(env)) as () => Promise<unknown>;
  return { env, run };
}

describe("文档提交准备行为", () => {
  it("纯文档保留原始空意图，并在等待前同步加锁", async () => {
    let finish!: (value: unknown) => void;
    const resolver = vi.fn((_input: unknown) => new Promise(resolve => { finish = resolve; }));
    const { env, run } = preparationHarness({ resolvePromptDocumentIntent: resolver });
    const first = run();
    expect(env.documentSubmitLockRef.current).toBe(true);
    expect(env.setIsSubmitting).toHaveBeenCalledWith(true);
    await run();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0][0]).toMatchObject({ prompt: "", mode: "auto" });
    finish({ mode: "text", reply: "总结" });
    expect(await first).toMatchObject({ documentDecision: { mode: "text" } });
  });
  it.each(["text", "image"])("仅历史文档的 %s 追问仍走权威文档决策", async tab => {
    const historical = [{ role: "user", content: "旧资料", documents: [{ id: "old" }] }];
    const { env, run } = preparationHarness({
      promptDocuments: { assertReady: () => [] }, hasPrompt: true, composerPrompt: "文档中的价格是多少？",
      assistantAutoMode: false, assistantModelTab: tab, buildAssistantContext: () => historical,
    });
    expect(await run()).toMatchObject({ documentDecision: { mode: "text" } });
    expect(env.resolvePromptDocumentIntent).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "文档中的价格是多少？", documents: [], recentMessages: historical, mode: tab,
    }));
  });
  it.each(["解析中", "解析失败"])("%s 时函数硬闸，不调用理解", async message => {
    const { env, run } = preparationHarness({ promptDocuments: { assertReady: () => { throw new Error(message); } } });
    await run();
    expect(env.resolvePromptDocumentIntent).not.toHaveBeenCalled();
    expect(env.notifyAiFailure).toHaveBeenCalledWith("文档附件尚未就绪", message);
  });
  it("理解失败不清输入、不生成，并释放准备锁", async () => {
    const { env, run } = preparationHarness({ resolvePromptDocumentIntent: vi.fn(async () => { throw new Error("拒绝无效 JSON"); }) });
    await run();
    expect(env.documentSubmitLockRef.current).toBe(false);
    expect(env.setIsSubmitting).toHaveBeenLastCalledWith(false);
    expect(env.notifyAiFailure).toHaveBeenCalledWith("文档理解失败", "拒绝无效 JSON");
    expect(prepare).not.toContain("setMessages(");
    expect(prepare).not.toContain("promptDocuments.clear(");
    expect(prepare).not.toContain("dispatchImageGenerationTask(");
  });
  it.each([[false, "text", "text"], [false, "image", "image"], [true, "image", "auto"]])("模型模式 %s/%s 直接交给文档理解", async (auto, tab, mode) => {
    const { env, run } = preparationHarness({ assistantAutoMode: auto, assistantModelTab: tab });
    await run();
    expect(env.resolvePromptDocumentIntent).toHaveBeenCalledWith(expect.objectContaining({
      mode, model: mode === "text" ? "gpt-6-luna" : undefined,
    }));
  });
  it.each(["text", "image", "error"])("同画布换会话后旧 %s 理解不得继续提交或解开新请求锁", async mode => {
    const old = deferred();
    const current = deferred();
    const resolver = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { env, run } = preparationHarness({ resolvePromptDocumentIntent: resolver });
    const pending = run();
    const { scope } = changeConversation(env);
    expect(scope.dependencies).toContain("new-conversation");
    expect(scope.dependencies).toContain("same-canvas");
    expect(scope.dependencies).toContain(env.promptDocuments.clear);
    expect(env.promptDocuments.clear).toHaveBeenCalledTimes(1);
    expect(env.documentSubmitLockRef.current).toBe(false);
    env.setIsSubmitting.mockClear();
    const next = run();
    if (mode === "error") old.reject(new Error("旧会话理解失败"));
    else old.resolve({ mode, reply: "旧回复", imagePrompt: "旧生图要求" });
    expect(await pending).toBeUndefined();
    expect(env.documentSubmitLockRef.current).toBe(true);
    expect(env.setIsSubmitting).not.toHaveBeenCalledWith(false);
    expect(env.notifyAiFailure).not.toHaveBeenCalled();
    current.resolve({ mode: "text", reply: "新会话回复" });
    expect(await next).toMatchObject({ documentDecision: { reply: "新会话回复" } });
  });
  it("停止后的过期理解结果不能继续提交", async () => {
    let finish!: (value: unknown) => void;
    const { env, run } = preparationHarness({ resolvePromptDocumentIntent: () => new Promise(resolve => { finish = resolve; }) });
    const pending = run();
    env.documentSubmissionEpochRef.current++;
    finish({ mode: "image", imagePrompt: "不应出图" });
    expect(await pending).toBeUndefined();
  });
});

function verifyDecisionWiring(source: string) {
  const s = section(source, "  async function handleSubmit()", "  return (\n    <>");
  expect(s).toContain('if (documentDecision?.mode === "text")');
  expect(s.indexOf('if (documentDecision?.mode === "text")')).toBeLessThan(s.indexOf("if (activeSkill && !documentDecision)"));
  expect(s).toContain("const isSameStyle = !documentDecision && isSameStyleGeneration(");
  expect(s).toContain("!documentDecision && !isSameStyle &&");
  expect(s).toContain("const decision = documentDecision ?? (hasExplicitImageModel");
  expect(s).toContain('!documentDecision && assistantModelTab === "text"');
}

describe("图片节点文档准备行为", () => {
  const nodePrepare = section(node, "      const target = targetOverride || editAsset;", "      const selectedTextModel =");
  function harness(decision: unknown, model = "image-model", overrides: Record<string, unknown> = {}) {
    const env = {
      targetOverride: { nodeId: "node", title: "主图", src: "source.png" }, editAsset: null,
      requireAiAccess: () => true, nodesRef: { current: [{ id: "node", type: "asset", data: {} }] },
      payload: { prompt: "", model, references: [], documents: [{ id: "d", name: "a.txt", format: "txt", size: 3, text: "要求", structure: "段落" }] },
      getExplicitReferenceSearchDecision, validatePromptDocuments, assetEditInFlightRef: { current: new Set<string>() }, getAssetBusyState: () => ({ busy: false }),
      getVisibleAssetImageSource: async () => "latest.png", resolvePromptDocumentIntent: vi.fn(async () => {
        if (decision instanceof Error) throw decision;
        return decision;
      }), TEXT_AI_MODELS: [{ id: "text-model" }], AUTO_AI_MODEL: { id: "auto" },
      getCanvasAssistantRecentContext: () => [{ role: "user", content: "历史追问" }],
      window: { dispatchEvent: vi.fn() }, CustomEvent: class { constructor(public type: string, public init: unknown) {} },
      notifyAiFailure: vi.fn(), assetDocumentEpochRef: { current: 0 },
      assetDocumentInFlightRef: { current: new Set<string>() }, ...overrides,
    };
    const js = ts.transpileModule(`async function run() { ${nodePrepare} return "继续图片编辑"; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return { env, run: new Function(...Object.keys(env), `${js}; return run;`)(...Object.values(env)) as () => Promise<unknown> };
  }
  it.each(["text", "image", "error"])("节点旧 %s 理解在换会话后不发消息、不编辑、不释放新节点锁", async mode => {
    const old = deferred();
    const current = deferred();
    const resolver = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const bus = eventBus();
    const { env, run } = harness(null, "image-model", { resolvePromptDocumentIntent: resolver, window: bus });
    mountLayoutEffect(nodeScopeEffect, { ...env, projectId: "same-canvas" });
    const pending = run();
    await Promise.resolve();
    expect(resolver).toHaveBeenCalledTimes(1);
    changeConversation(preparationHarness().env, bus);
    expect(env.assetEditInFlightRef.current.size).toBe(0);
    const next = run();
    await Promise.resolve();
    bus.dispatchEvent.mockClear();
    if (mode === "error") old.reject(new Error("旧理解失败"));
    else old.resolve({ mode, reply: "旧回复", imagePrompt: "不能编辑" });
    expect(await pending).toBe(false);
    expect(bus.dispatchEvent).not.toHaveBeenCalled();
    expect(env.notifyAiFailure).not.toHaveBeenCalled();
    expect(env.assetEditInFlightRef.current.has("node")).toBe(true);
    expect(env.assetDocumentInFlightRef.current.has("node")).toBe(true);
    current.resolve({ mode: "text", reply: "新回复" });
    expect(await next).toBe(true);
    expect(bus.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(env.assetEditInFlightRef.current.size).toBe(0);
  });
  it("文档理解后准备编辑期间换会话，旧请求不派发占位且不释放新节点锁", async () => {
    const size = deferred();
    const bus = eventBus();
    const { env } = harness(null, "image-model", { window: bus });
    mountLayoutEffect(nodeScopeEffect, { ...env, projectId: "same-canvas" });
    const preparation = section(node, "      assetEditInFlightRef.current.add(target.nodeId);\n      if (documentDecision)", "      const sourceSize =");
    const guard = section(node, "      if (documentDecision && documentEpoch !== assetDocumentEpochRef.current) return false;\n      documentGenerationStarted", "      dispatchImageGenerationTask(");
    const dispatch = vi.fn();
    const runtime = {
      ...env, target: { nodeId: "node", src: "image.png" }, documentDecision: { mode: "image" }, documentEpoch: 0,
      getImageNaturalSize: () => size.promise, resolveEditAspectLock: () => ({}), dispatch,
    };
    const js = ts.transpileModule(`async function run() { ${preparation} ${guard} dispatch(); releaseInFlight(); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = new Function(...Object.keys(runtime), `${js}; return run;`)(...Object.values(runtime));
    const pending = run();
    await Promise.resolve();
    changeConversation(preparationHarness().env, bus);
    env.assetEditInFlightRef.current.add("node");
    env.assetDocumentInFlightRef.current.add("node");
    size.resolve({ width: 100, height: 100 });
    await pending;
    expect(dispatch).not.toHaveBeenCalled();
    expect(env.assetEditInFlightRef.current.has("node")).toBe(true);
    expect(env.assetDocumentInFlightRef.current.has("node")).toBe(true);
  });
  it("取底图期间换会话不再启动旧文档理解，且保留非文档节点锁", async () => {
    const image = deferred<string>();
    const bus = eventBus();
    const { env, run } = harness(null, "image-model", { getVisibleAssetImageSource: () => image.promise, window: bus });
    mountLayoutEffect(nodeScopeEffect, { ...env, projectId: "same-canvas" });
    env.assetEditInFlightRef.current.add("non-document-node");
    const pending = run();
    changeConversation(preparationHarness().env, bus);
    image.resolve("latest.png");
    expect(await pending).toBe(false);
    expect(env.resolvePromptDocumentIntent).not.toHaveBeenCalled();
    expect([...env.assetEditInFlightRef.current]).toEqual(["non-document-node"]);
  });
  it.each(["auto", "text-model", "image-model"])("%s 的 text 决策直接回复，不走图片编辑", async model => {
    const { env, run } = harness({ mode: "text", reply: "澄清需求" }, model);
    expect(await run()).toBe(true);
    expect(env.window.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(env.assetEditInFlightRef.current.size).toBe(0);
    expect(env.resolvePromptDocumentIntent).toHaveBeenCalledTimes(1);
  });
  it("理解失败返回未受理且不写用户消息", async () => {
    const { env, run } = harness(new Error("严格 JSON 校验失败"));
    expect(await run()).toBe(false);
    expect(env.window.dispatchEvent).not.toHaveBeenCalled();
    expect(env.assetEditInFlightRef.current.size).toBe(0);
  });
  it("image 决策继续进入唯一的图片编辑消费者", async () => {
    const { env, run } = harness({ mode: "image", imagePrompt: "理解完成的图片要求" });
    expect(await run()).toBe("继续图片编辑");
    expect(env.resolvePromptDocumentIntent).toHaveBeenCalledTimes(1);
    expect(env.window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe("文档会话清理行为", () => {
  it("无文档请求时切换会话不停止原有非文档请求", () => {
    const abort = vi.fn();
    const { env } = preparationHarness({ assistantAbortRef: { current: { abort } } });
    changeConversation(env);
    expect(abort).not.toHaveBeenCalled();
    expect(env.setIsSubmitting).not.toHaveBeenCalled();
  });
  it("移除提交成功守卫的变异会恢复旧生图决策，行为测试能区分", async () => {
    const anchor = "if (documentEpoch !== documentSubmissionEpochRef.current) return;";
    expect(prepare.split(anchor)).toHaveLength(3);
    const old = deferred();
    const { env, run } = preparationHarness({ resolvePromptDocumentIntent: () => old.promise }, prepare.replace(anchor, ""));
    const pending = run();
    changeConversation(env);
    old.resolve({ mode: "image", imagePrompt: "旧生图决策" });
    expect(await pending).toMatchObject({ documentDecision: { imagePrompt: "旧生图决策" } });
  });
  it("文档理解后取图片尺寸时换会话，不得继续派发图片任务", async () => {
    const size = deferred();
    const dispatchImageGenerationTask = vi.fn();
    const branch = section(submit, "        const targetReferenceNaturalSize = targetReference", "        const referenceEditAspectLock");
    const env = {
      targetReference: { src: "image.png" }, getImageNaturalSize: () => size.promise,
      documentDecision: { mode: "image" }, documentEpoch: 1, documentSubmissionEpochRef: { current: 1 },
      dispatchImageGenerationTask,
    };
    const js = ts.transpileModule(`async function run() { ${branch} dispatchImageGenerationTask(); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = new Function(...Object.keys(env), `${js}; return run;`)(...Object.values(env));
    const pending = run();
    changeConversation({ ...preparationHarness().env, documentSubmissionEpochRef: env.documentSubmissionEpochRef });
    size.resolve({ width: 100, height: 100 });
    await pending;
    expect(dispatchImageGenerationTask).not.toHaveBeenCalled();
  });
  it.each([
    ["首页", home, '            if (documentDecision && homeDocumentEpoch !== documentSubmissionEpochRef.current) return;', "homeDocumentEpoch"],
    ["助手", submit, '        if (documentDecision && documentEpoch !== documentSubmissionEpochRef.current) return;\n        setMessages', "documentEpoch"],
  ])("%s 已启动生图完成后不向新会话写消息", (_name, source, anchor, epochName) => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(0);
    const end = source.indexOf("setMessages", start);
    expect(end).toBeGreaterThan(start);
    const guard = source.slice(start, end);
    const setMessages = vi.fn();
    const js = ts.transpileModule(`function finish() { ${guard} setMessages(); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const env = { documentDecision: { mode: "image" }, documentSubmissionEpochRef: { current: 2 }, [epochName]: 1, setMessages };
    new Function(...Object.keys(env), `${js}; finish();`)(...Object.values(env));
    expect(setMessages).not.toHaveBeenCalled();
  });
  it("附件重置调用真实 hook clear，使旧解析成功和失败都不能回填", async () => {
    const hookSource = readFileSync(resolve(__dirname, "../../hooks/usePromptDocuments.ts"), "utf8");
    const hook = hookSource.slice(hookSource.indexOf("export function usePromptDocuments()"));
    const js = ts.transpileModule(hook.replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const success = deferred();
    const failure = deferred();
    const parser = vi.fn().mockReturnValueOnce(success.promise).mockReturnValueOnce(failure.promise);
    const published = vi.fn();
    const usePromptDocuments = new Function("useState", "useRef", "useEffect", "useCallback", "parsePromptDocument", "validatePromptDocuments", "MAX_PROMPT_DOCUMENTS", `${js}; return usePromptDocuments;`)(
      () => [[], published], (value: unknown) => ({ current: value }), (effect: () => void) => effect(),
      (callback: unknown) => callback, parser, validatePromptDocuments, 4,
    );
    const documents = usePromptDocuments();
    const parsing = documents.addFiles([{ name: "success.txt" }, { name: "failure.txt" }]);
    expect(() => documents.assertReady()).toThrow("解析");
    changeConversation({ ...preparationHarness().env, promptDocuments: documents });
    expect(documents.assertReady()).toEqual([]);
    published.mockClear();
    success.resolve({ id: "old", name: "success.txt", format: "txt", size: 1, text: "旧资料", structure: "段落" });
    failure.reject(new Error("旧解析失败"));
    await parsing;
    expect(published).not.toHaveBeenCalled();
    expect(documents.assertReady()).toEqual([]);
  });

  it("不支持文档的 3D 浮动框不注册会话清理，不改变既有发送状态", () => {
    const bus = eventBus();
    const clear = vi.fn();
    mountLayoutEffect(barScopeEffect, { documentsEnabled: false, promptDocuments: { clear }, window: bus });
    bus.dispatchEvent({ type: "canvas-prompt-documents-reset" });
    expect(clear).not.toHaveBeenCalled();
  });
  it.each([true, false, "error"])("浮动框旧请求返回 %s 不清新附件、不解新发送锁", async result => {
    const bus = eventBus();
    const old = deferred();
    const current = deferred();
    const documents = { assertReady: () => [], clear: vi.fn() };
    const env = {
      window: bus, promptDocuments: documents, sendingRef: { current: false }, sendingEpochRef: { current: 0 },
      sending: false, setSending: vi.fn(), setAttachmentDragOver: vi.fn(), documentsEnabled: true,
      isTargetBusy: false, busyState: undefined, canSendPrompt: true, prompt: "草稿", imageCount: 1, imageRatio: "auto",
      resolveImageCountFromPromptAndSelector: () => ({ count: 1 }), onSubmit: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise),
      getExplicitReferenceSearchDecision, AUTO_AI_MODEL: { id: "auto" }, setModel: vi.fn(),
      model: "image-model", uploadedRefs: [], regionRef: null, setPrompt: vi.fn(), setUploadedRefs: vi.fn(),
      setImageCount: vi.fn(), setImageRatio: vi.fn(), setRegionRef: vi.fn(), setRegionSelectMode: vi.fn(),
      anchor: {}, onClose: vi.fn(), toast: vi.fn(), notifyAiFailure: vi.fn(),
    };
    mountLayoutEffect(barScopeEffect, env);
    const send = section(bar, "  const handleSend = async () => {", "  const handleUploadRefs");
    const js = ts.transpileModule(send, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = new Function(...Object.keys(env), `${js}; return handleSend;`)(...Object.values(env));
    const pending = run();
    changeConversation(preparationHarness().env, bus);
    expect(documents.clear).toHaveBeenCalledTimes(1);
    expect(env.sendingRef.current).toBe(false);
    documents.clear.mockClear();
    env.setSending.mockClear();
    const next = run();
    if (result === "error") old.reject(new Error("旧提交失败")); else old.resolve(result);
    await pending;
    expect(env.sendingRef.current).toBe(true);
    expect(env.setSending).not.toHaveBeenCalledWith(false);
    expect(documents.clear).not.toHaveBeenCalled();
    expect(env.setPrompt).not.toHaveBeenCalled();
    expect(env.notifyAiFailure).not.toHaveBeenCalled();
    current.resolve(true);
    await next;
    expect(documents.clear).toHaveBeenCalledTimes(1);
    expect(env.sendingRef.current).toBe(false);
  });

  it.each(["text", "image", "error"])("首页旧 %s 理解返回不写新会话、不继续处理、不释放新锁", async mode => {
    const old = deferred();
    const env = {
      ...preparationHarness().env, homeDocumentEpoch: 1, hasDocumentContext: true, handoffReferences: [],
      handoffDocuments: [], originalPrompt: "原需求", payload: { model: "auto" }, TEXT_AI_MODELS: [],
      isSupportedImageModelId: () => false, userMessage: {}, submittedText: "需求",
      resolvePromptDocumentIntent: vi.fn(() => old.promise), setMessages: vi.fn(),
      setComposerSegments: vi.fn(), syncedReferenceIdsRef: { current: { clear: vi.fn() } }, onMergeReferences: vi.fn(),
      dispatchImageGenerationTask: vi.fn(), generateAiImages: vi.fn(), routeCreativeIntent: vi.fn(),
    };
    env.documentSubmissionEpochRef.current = 1;
    env.documentSubmitLockRef.current = true;
    const callback = section(home, "        if (homeDocumentEpoch !== documentSubmissionEpochRef.current) return;", "      }, 360);");
    const js = ts.transpileModule(`async function run() { ${callback} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = new Function(...Object.keys(env), `${js}; return run;`)(...Object.values(env));
    const pending = run();
    changeConversation(env);
    env.documentSubmitLockRef.current = true;
    env.promptDocuments.clear.mockClear();
    env.setIsSubmitting.mockClear();
    if (mode === "error") old.reject(new Error("旧首页理解失败"));
    else old.resolve({ mode, reply: "旧回复", imagePrompt: "旧生图" });
    await pending;
    expect(env.setMessages).not.toHaveBeenCalled();
    expect(env.generateAiImages).not.toHaveBeenCalled();
    expect(env.dispatchImageGenerationTask).not.toHaveBeenCalled();
    expect(env.notifyAiFailure).not.toHaveBeenCalled();
    expect(env.promptDocuments.clear).not.toHaveBeenCalled();
    expect(env.documentSubmitLockRef.current).toBe(true);
    expect(env.setIsSubmitting).not.toHaveBeenCalled();
  });
  it("助手旧 finally 在新请求开始理解但尚无 controller 时也不释放新锁", () => {
    const cleanup = section(code, "      if (assistantAbortRef.current === submissionAbortController)", "  return (\n    <>");
    const controller = new AbortController();
    const { env } = preparationHarness({ assistantAbortRef: { current: controller } });
    env.documentSubmitLockRef.current = true;
    changeConversation(env);
    env.documentSubmitLockRef.current = true;
    env.setIsSubmitting.mockClear();
    const js = ts.transpileModule(`function finish() { ${cleanup.slice(0, cleanup.lastIndexOf("    }"))}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function(...Object.keys(env), "submissionAbortController", `${js}; finish();`)(...Object.values(env), controller);
    expect(env.documentSubmitLockRef.current).toBe(true);
    expect(env.setIsSubmitting).not.toHaveBeenCalled();
  });
  it("首页旧 finally 不能清新草稿或释放新文档请求锁", () => {
    const cleanup = section(home, "          if (homeDocumentEpoch !== documentSubmissionEpochRef.current) return;\n          if (homeDocumentsAccepted)", "      }, 360);");
    const js = ts.transpileModule(`function finish() { ${cleanup.slice(0, cleanup.lastIndexOf("}"))} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const env = {
      ...preparationHarness().env, homeDocumentEpoch: 1, homeDocumentsAccepted: true,
      setComposerSegments: vi.fn(), createAssistantTextSegment: (text: string) => text,
      syncedReferenceIdsRef: { current: { clear: vi.fn() } }, onMergeReferences: vi.fn(),
    };
    env.documentSubmissionEpochRef.current = 1;
    changeConversation(env);
    env.documentSubmitLockRef.current = true;
    env.setIsSubmitting.mockClear();
    new Function(...Object.keys(env), `${js}; finish();`)(...Object.values(env));
    expect(env.documentSubmitLockRef.current).toBe(true);
    expect(env.setIsSubmitting).not.toHaveBeenCalled();
    expect(env.setComposerSegments).not.toHaveBeenCalled();
    expect(env.onMergeReferences).not.toHaveBeenCalled();
  });
});

describe("文档附件定向接线", () => {
  it("文档决策绕过 Skill、同款、第二次路由与图片强钳", () => verifyDecisionWiring(code));
  it.each([
    ["if (activeSkill && !documentDecision)", "if (activeSkill)"],
    ["const isSameStyle = !documentDecision &&", "const isSameStyle ="],
    ["!documentDecision && !isSameStyle &&", "!isSameStyle &&"],
    ["const decision = documentDecision ?? (hasExplicitImageModel", "const decision = (hasExplicitImageModel"],
    ['!documentDecision && assistantModelTab === "text"', 'assistantModelTab === "text"'],
  ])("检测器能抓住决策旁路变异 %s", (before, after) => {
    expect(code).toContain(before);
    expect(() => verifyDecisionWiring(code.replace(before, after))).toThrow();
  });
  it("首页恢复严格验证，非自动放草稿，自动只理解一次且失败不清稿", () => {
    expect(home).toContain("validatePromptDocuments(payload.documents === undefined ? [] : payload.documents)");
    expect(home).toContain("promptDocuments.setDocuments(handoffDocuments)");
    expect(home).toContain("if (!payload.shouldAutoRun)");
    expect(home).toContain("const decision = documentDecision ?? (homeSelectedImageModel");
    expect(home).toContain("if (homeSelectedTextModel && !documentDecision)");
    expect(home).toContain("if (homeDocumentsAccepted) setComposerSegments(");
    expect(home).toContain('notifyAiFailure("首页文档交接失败"');
  });
  it("drop 同步快照，文档先登记，图片仍交给原消费者", () => {
    const drop = section(code, "  const handleComposerImageDropEvent = useCallback(", "  const handleComposerTextKeyDown");
    expect(drop).toContain("const files = Array.from(event.dataTransfer.files || [])");
    expect(drop.indexOf("promptDocuments.addFiles(documentFiles)")).toBeLessThan(drop.indexOf("void onDropImages("));
    expect(drop).toContain("!isPromptDocumentFile(file) && fileLooksLikeImage(file)");
    const leave = section(code, "  const handleComposerImageDragLeaveEvent", "  const handleComposerImageDropEvent");
    expect(leave).not.toContain("stopPropagation(");
    const predicate = section(code, "function dataTransferHasExternalImage(", "function dataTransferMayContainExternalDrop(");
    const js = ts.transpileModule(predicate, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const accepts = new Function("clipboardPayloadHasDirectImageContent", `${js}; return dataTransferHasExternalImage;`)(() => false);
    expect(accepts({ types: ["text/plain"], items: [] })).toBe(false);
    expect(accepts({ types: ["Files"], items: [] })).toBe(true);
    expect(accepts({ types: ["application/x-artx-composer-token"], items: [] })).toBe(false);
  });
  it("节点文档必需理解早于 edit 占位；文本不编辑，图片不重复理解", () => {
    expect(node.indexOf("resolvePromptDocumentIntent({")).toBeLessThan(node.indexOf("dispatchImageGenerationTask("));
    expect(node.indexOf('resolvedDocumentDecision.mode === "text"')).toBeLessThan(node.indexOf("createRegionSelectMask("));
    expect(node).toContain("const optimizedText = documentDecision ? documentDecision.imagePrompt! : await optimizeImageEditPromptWithFallback(");
    expect(node).toContain("prompt: payload.prompt,");
    expect(node).toContain("recentMessages: recentDocumentMessages");
    expect(node).toContain("documents.length > 0 || recentDocumentMessages.some");
    expect(home).toContain("prompt: originalPrompt,");
    expect(node).not.toContain('prompt: payload.prompt.trim() || "请理解并总结所附文档。"');
    expect(node).toContain("contextDocuments: documents");
  });
  it("浮动框等待消费者返回再清文档，双击和节点均透传 Promise，3D 明确关闭", () => {
    expect(bar).toContain("promptDocuments.assertReady()");
    expect(bar).toContain("const accepted = await onSubmit({");
    const send = section(bar, "  const handleSend = async () => {", "  const handle");
    expect(send.indexOf("accepted === false) return")).toBeGreaterThan(0);
    expect(send.indexOf("accepted === false) return")).toBeLessThan(send.indexOf("promptDocuments.clear()"));
    expect(bar).toContain('window.addEventListener("drop", reset, true)');
    expect(bar).toContain('window.addEventListener("dragend", reset, true)');
    expect(code).toContain("return handleNodeComposerSubmit(selectedImageNode.id, payload)");
    expect(code).toContain("return handleAssetEditSubmit(payload)");
    expect(code).toContain("documentsEnabled={false}");
  });
  it("用户消息保留全文附件属性但不拼入显示正文", () => {
    expect(submit).toContain("contextDocuments: submittedDocuments.length ? submittedDocuments : undefined");
    expect(submit).not.toContain("submittedDocuments.map(");
    const serialize = section(code, "function serializeCanvasAssistantMessages(", "function createCanvasAssistantSeedMessage(");
    expect(serialize).toContain("...message,");
    expect(serialize).toContain("...item,");
    expect(code).toContain("contextDocuments: detail.contextDocuments");
    expect(code).toContain("仅提取文本与结构，未理解文档内图像或视觉版式");
    const js = ts.transpileModule(serialize, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const functions = new Function("getCanvasRenderableImageSrc", "validatePromptDocuments", `${js}; return { serializeCanvasAssistantMessages, deserializeCanvasAssistantMessages };`)((src: string) => src, validatePromptDocuments);
    const contextDocuments = [{ id: "d", name: "brief.txt", format: "txt", size: 10, text: "不能丢失的文档正文", structure: "段落" }];
    const result = functions.deserializeCanvasAssistantMessages(JSON.stringify(functions.serializeCanvasAssistantMessages([{ id: "m", role: "user", content: "总结一下", contextDocuments, timestamp: new Date() }])));
    expect(result[0].contextDocuments).toEqual(contextDocuments);
    expect(result[0].content).toBe("总结一下");
  });
});
