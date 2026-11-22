/**
 * 🔒 2026-11-15 用户要求：画布空状态「生成图片」草稿框（DraftImageNodeComponent）里的
 * 模型选择器展开面板，在浅色主题下必须是白色模式。
 *
 * 改之前：没传 popoverTheme → 走默认 "dark" → 浅色画布上弹出 #161616 黑面板。
 */
import { describe, it, expect, vi } from "vitest";
import ts from "typescript";
import { getExplicitReferenceSearchDecision } from "../../lib/ai-intent";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const raw = readFileSync(
  resolve(repoRoot, "client/src/components/canvas/InfiniteCanvas.tsx"),
  "utf8",
);
const src = stripSourceComments(raw);
assertStripKeptSource(raw, src, 0.45);

const ast = ts.createSourceFile("InfiniteCanvas.tsx", raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const draftNodes = ast.statements.filter((statement): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "DraftImageNodeComponent"
);
if (draftNodes.length !== 1 || !draftNodes[0].body) throw new Error("草稿节点 AST 必须唯一且有函数体");
const draftStatements = draftNodes[0].body.statements;
function draftDeclaration(name: string) {
  const matches = draftStatements.filter(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name));
  if (matches.length !== 1) throw new Error(`草稿节点声明必须唯一：${name}`);
  return matches[0].getText(ast);
}
const draftEffects = draftStatements.filter(statement => ts.isExpressionStatement(statement) &&
  ts.isCallExpression(statement.expression) && statement.expression.expression.getText(ast) === "useLayoutEffect");
if (draftEffects.length !== 1) throw new Error("草稿生命周期 effect 必须唯一");
const draftExecutable = [
  ...["draftSubmitLockRef", "draftSubmissionEpochRef", "draftMountedRef"].map(draftDeclaration),
  draftEffects[0].getText(ast),
  draftDeclaration("handleSubmit"),
  "return { run: handleSubmit, lock: draftSubmitLockRef };",
].join("\n");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function draftHarness(overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const bus = {
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
  let effect!: () => (() => void);
  let cleanup: (() => void) | undefined;
  let dependencies: unknown[] = [];
  const env = {
    useRef: (current: unknown) => ({ current }),
    useCallback: (callback: unknown) => callback,
    useLayoutEffect: (callback: () => (() => void), deps: unknown[]) => {
      effect = callback;
      dependencies = deps;
    },
    window: bus,
    CustomEvent: class {
      constructor(public type: string, public detailInit: { detail: unknown }) {}
      get detail() { return this.detailInit.detail; }
    },
    prompt: "  帮我找几张极简海报参考图  ", model: "manual-text", projectId: "p1", id: "draft1",
    requestAiAuth: vi.fn(() => true), toast: vi.fn(), notifyAiFailure: vi.fn(),
    getExplicitReferenceSearchDecision,
    TEXT_AI_MODELS: [{ id: "manual-text" }], AUTO_AI_MODEL: { id: "auto" },
    searchReferenceImages: vi.fn(async () => ({ images: [{ id: "ref1", src: "reference.png" }] })),
    callLLM: vi.fn(async () => ({ text: "普通回复" })), setModel: vi.fn(), setPrompt: vi.fn(),
    uploadedRefs: [], activeSkill: null, imageRatio: "auto", imageCount: 1,
    resolveRatio: vi.fn(() => "1:1"), buildSkillPromptContext: vi.fn(),
    buildSkillAppliedImagePrompt: vi.fn(({ userPrompt }: { userPrompt: string }) => userPrompt),
    resolveOutputSizeFromPromptAndSelector: vi.fn(() => ({ ratio: "1:1", width: 1024, height: 1024 })),
    resolveImageRatio: vi.fn(() => "1:1"), resolveImageCountFromPromptAndSelector: vi.fn(() => ({ count: 1 })),
    getImageDisplaySizeForRatio: vi.fn(() => ({ width: 200, height: 200 })),
    deleteElements: vi.fn(), dispatchImageGenerationTask: vi.fn(), ...overrides,
  };
  const js = ts.transpileModule(draftExecutable, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const executable = new Function(...Object.keys(env), js)(...Object.values(env)) as {
    run: () => Promise<void>; lock: { current: boolean };
  };
  const mount = () => { cleanup = effect(); };
  mount();
  return {
    ...executable, env, bus, dependencies,
    cleanup: () => cleanup?.(), mount,
    listenerCount: () => listeners.get("canvas-reference-search-reset")?.size || 0,
    reset: () => bus.dispatchEvent({ type: "canvas-reference-search-reset" }),
    messages: () => bus.dispatchEvent.mock.calls.map(([event]) => event as unknown as {
      type: string; detail: Record<string, unknown>;
    }).filter(event => event.type === "canvas-assistant-external-message").map(event => event.detail),
  };
}

describe("草稿节点明确索图执行真实提交闭包", () => {
  it.each(["manual-text", "manual-image", "auto"])("%s 模型同轮强制 Auto 并发送参考结果，不直聊或生成", async model => {
    const h = draftHarness({ model });
    const decision = getExplicitReferenceSearchDecision(h.env.prompt)!;
    await h.run();
    expect(h.env.setModel).toHaveBeenCalledTimes(1);
    expect(h.env.setModel).toHaveBeenCalledWith("auto");
    expect(h.env.searchReferenceImages).toHaveBeenCalledTimes(1);
    expect(h.env.searchReferenceImages).toHaveBeenCalledWith({ query: decision.searchQuery, limit: 10 });
    expect(h.messages()).toEqual([
      { role: "user", content: h.env.prompt.trim(), model: "auto" },
      {
        role: "assistant", content: "已找到 1 张参考图，可以选用或拖入画布。",
        referenceOptions: [{ id: "ref1", src: "reference.png" }],
        referenceSearchQuery: decision.searchQuery, followUpPrompt: decision.followUp, model: "auto",
      },
    ]);
    expect(h.env.setPrompt).toHaveBeenCalledTimes(1);
    expect(h.env.setPrompt).toHaveBeenCalledWith("");
    expect(h.env.callLLM).not.toHaveBeenCalled();
    expect(h.env.deleteElements).not.toHaveBeenCalled();
    expect(h.env.dispatchImageGenerationTask).not.toHaveBeenCalled();
    expect(h.env.buildSkillAppliedImagePrompt).not.toHaveBeenCalled();
    expect(h.lock.current).toBe(false);
    h.cleanup();
  });

  it.each(["empty", "unauthenticated"])("%s 仍由原有输入及鉴权闸门拦截", async scenario => {
    const h = draftHarness(scenario === "empty" ? { prompt: "  " } : { requestAiAuth: vi.fn(() => false) });
    await h.run();
    expect(h.env.toast).toHaveBeenCalled();
    expect(h.env.setModel).not.toHaveBeenCalled();
    expect(h.env.searchReferenceImages).not.toHaveBeenCalled();
    expect(h.messages()).toEqual([]);
    expect(h.env.setPrompt).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("空结果仍格式化回传并清输入，不回退生成", async () => {
    const h = draftHarness({ searchReferenceImages: vi.fn(async () => ({ images: [] })) });
    await h.run();
    expect(h.messages()[1]).toMatchObject({ content: "已找到 0 张参考图，可以选用或拖入画布。", referenceOptions: [], model: "auto" });
    expect(h.env.setPrompt).toHaveBeenCalledWith("");
    expect(h.env.dispatchImageGenerationTask).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("请求等待时同步防连点，失败保留输入且可再次提交", async () => {
    const pending = deferred<{ images: unknown[] }>();
    const search = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ images: [] });
    const h = draftHarness({ searchReferenceImages: search });
    const first = h.run();
    expect(h.lock.current).toBe(true);
    await h.run();
    expect(search).toHaveBeenCalledTimes(1);
    expect(h.messages()).toHaveLength(1);
    expect(h.env.setPrompt).not.toHaveBeenCalled();
    pending.reject(new Error("搜索暂不可用"));
    await first;
    expect(h.env.notifyAiFailure).toHaveBeenCalledTimes(1);
    expect(h.env.notifyAiFailure).toHaveBeenCalledWith("参考图搜索失败", "搜索暂不可用");
    expect(h.env.setPrompt).not.toHaveBeenCalled();
    expect(h.lock.current).toBe(false);
    await h.run();
    expect(search).toHaveBeenCalledTimes(2);
    expect(h.env.setPrompt).toHaveBeenCalledWith("");
    h.cleanup();
  });

  it.each(["success", "error"])("换会话后旧请求 %s 不写消息、不清输入、不释放新请求锁", async outcome => {
    const old = deferred<{ images: unknown[] }>();
    const current = deferred<{ images: unknown[] }>();
    const search = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const h = draftHarness({ searchReferenceImages: search });
    expect(h.dependencies).toEqual(["p1", "draft1"]);
    const first = h.run();
    h.reset();
    expect(h.lock.current).toBe(false);
    const next = h.run();
    expect(search).toHaveBeenCalledTimes(2);
    const before = h.messages();
    if (outcome === "error") old.reject(new Error("旧错误"));
    else old.resolve({ images: [{ id: "old" }] });
    await first;
    expect(h.messages()).toEqual(before);
    expect(h.env.setPrompt).not.toHaveBeenCalled();
    expect(h.env.notifyAiFailure).not.toHaveBeenCalled();
    expect(h.lock.current).toBe(true);
    current.resolve({ images: [{ id: "new" }] });
    await next;
    expect(h.messages()[2]).toMatchObject({ referenceOptions: [{ id: "new" }] });
    expect(h.lock.current).toBe(false);
    h.cleanup();
  });

  it.each(["success", "error"])("卸载后旧请求 %s 不写状态，残留闭包也不能再提交", async outcome => {
    const old = deferred<{ images: unknown[] }>();
    const h = draftHarness({ searchReferenceImages: vi.fn(() => old.promise) });
    const pending = h.run();
    h.cleanup();
    h.reset();
    await h.run();
    if (outcome === "error") old.reject(new Error("卸载后失败"));
    else old.resolve({ images: [] });
    await pending;
    expect(h.env.searchReferenceImages).toHaveBeenCalledTimes(1);
    expect(h.messages()).toHaveLength(1);
    expect(h.env.setPrompt).not.toHaveBeenCalled();
    expect(h.env.notifyAiFailure).not.toHaveBeenCalled();
  });

  it("StrictMode effect setup-cleanup-setup 后仍可提交且只保留当前监听", async () => {
    const old = deferred<{ images: unknown[] }>();
    const search = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ images: [] });
    const h = draftHarness({ searchReferenceImages: search });
    const pending = h.run();
    expect(h.listenerCount()).toBe(1);
    h.cleanup();
    expect(h.listenerCount()).toBe(0);
    h.mount();
    expect(h.listenerCount()).toBe(1);
    await h.run();
    expect(search).toHaveBeenCalledTimes(2);
    old.resolve({ images: [{ id: "stale" }] });
    await pending;
    expect(h.messages()).toHaveLength(3);
    expect(h.env.setPrompt).toHaveBeenCalledTimes(1);
    h.cleanup();
  });

  it.each(["manual-text", "manual-image"])("普通 %s 请求保持既有分流", async model => {
    const h = draftHarness({ model, prompt: model === "manual-text" ? "解释一下构图" : "生成一张极简海报" });
    await h.run();
    expect(h.env.searchReferenceImages).not.toHaveBeenCalled();
    expect(h.env.setModel).not.toHaveBeenCalled();
    if (model === "manual-text") {
      expect(h.env.callLLM).toHaveBeenCalledWith(expect.objectContaining({ module: "draft-node-chat", model, modelSelection: "manual" }));
      expect(h.env.deleteElements).not.toHaveBeenCalled();
    } else {
      expect(h.env.callLLM).not.toHaveBeenCalled();
      expect(h.env.deleteElements).toHaveBeenCalledWith({ nodes: [{ id: "draft1" }] });
      expect(h.env.dispatchImageGenerationTask).toHaveBeenCalledTimes(1);
      expect(h.env.dispatchImageGenerationTask).toHaveBeenCalledWith(expect.objectContaining({ model: "manual-image" }), "p1");
    }
    h.cleanup();
  });
});

describe("草稿生成框的模型选择器跟随浅色主题", () => {
  it("DraftImageNodeComponent 的 ModelSelector 传 popoverTheme", () => {
    const start = src.indexOf("function DraftImageNodeComponent(");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("\nfunction ", start + 10);
    const node = src.slice(start, end);
    const selStart = node.indexOf("<ModelSelector");
    expect(selStart).toBeGreaterThan(0);
    const selector = node.slice(selStart, node.indexOf("/>", selStart));
    expect(selector).toContain('popoverTheme={isDark ? "dark" : "light"}');
  });

  it("2026-11-15：去掉快捷键灰字，控制条与「生成」同一行，输入框 4 行", () => {
    const start = src.indexOf("function DraftImageNodeComponent(");
    const node = src.slice(start, src.indexOf("\nfunction ", start + 10));
    expect(node).not.toContain("Enter 生成 · Shift+Enter 换行");
    const row = node.slice(node.indexOf('data-draft-control-row=""'));
    expect(row.indexOf("<ImageRatioSelector")).toBeGreaterThan(0);
    // 「生成」按钮在同一个控制行容器里（位于比例选择器之后）
    expect(row.indexOf("生成\n")).toBeGreaterThan(row.indexOf("<ImageRatioSelector"));
    expect(node).toContain("rows={4}");
  });

  it("light token 是白底深字", async () => {
    const { modelPopoverTokens } = await import("./model-popover-tokens");
    const t = modelPopoverTokens("light", { text: "#161616", border: "#000" }, false);
    expect(t.background).toBe("#ffffff");
    expect(t.text).toBe("rgba(20,20,36,0.88)");
  });
});
