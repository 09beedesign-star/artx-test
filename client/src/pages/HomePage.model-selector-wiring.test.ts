import { getExplicitReferenceSearchDecision } from "../lib/ai-intent";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts, { ScriptTarget, transpileModule } from "typescript";
import { isSupportedImageModelId } from "../../../shared/image-models";
import { assertStripKeptSource, stripSourceComments } from "../../../shared/strip-source-comments";
import { AUTO_AI_MODEL, IMAGE_AI_MODELS, TEXT_AI_MODELS } from "../lib/workspace-data";

/**
 * 接线回归锁：首页选择 → 偏好与交接 → 画布实际执行。
 * 保留旧测试的保护目的：共用选择器、auto 双 key、带图真实导入与清账、
 * 显式图片模型不能被路由降成文字。显式文本则应直达 LLM，不能误入出图。
 */
const HOME_PAGE_PATH = new URL("./HomePage.tsx", import.meta.url);
const PANEL_PATH = new URL("../components/home/CenteredPromptPanel.tsx", import.meta.url);
const INFINITE_CANVAS_PATH = new URL("../components/canvas/InfiniteCanvas.tsx", import.meta.url);

function readStripped(path: URL, codeAnchors: string[]) {
  const raw = readFileSync(path, "utf8");
  const source = stripSourceComments(raw);
  assertStripKeptSource(raw, source);
  expect(source.length, "注释剥离应实际生效").toBeLessThan(raw.length);
  for (const anchor of codeAnchors) {
    const count = raw.split(anchor).length - 1;
    expect(count, `原始源码缺少代码锚点 ${anchor}`).toBeGreaterThan(0);
    expect(source.split(anchor).length - 1, `剥注释误删代码 ${anchor}`).toBe(count);
  }
  return source;
}

function between(source: string, startAnchor: string, endAnchor: string) {
  expect(source.split(startAnchor).length - 1, `起锚必须唯一：${startAnchor}`).toBe(1);
  expect(source.split(endAnchor).length - 1, `止锚必须唯一：${endAnchor}`).toBe(1);
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor);
  expect(end, `止锚必须位于起锚之后：${endAnchor}`).toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body.length, "目标区块为空或只有签名").toBeGreaterThan(startAnchor.length);
  expect(body.includes(endAnchor), "区块不得吞入下一段代码").toBe(false);
  return body;
}

function element(source: string, name: string) {
  const matches = [...source.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?/>`, "g"))];
  expect(matches.length, `${name} 实际挂载必须唯一，不能只剩 import`).toBe(1);
  return matches[0]![0];
}

function readHome() {
  return readStripped(HOME_PAGE_PATH, [
    "const [homeImageModelId, setHomeImageModelId] = useState(",
    "const handleHomeImageModelChange =",
    "const createProjectFromPrompt =",
    "<CenteredPromptPanel",
  ]);
}

function readCanvas() {
  return readStripped(INFINITE_CANVAS_PATH, [
    "const payload = peekHomePromptHandoff(projectId);",
    "const homeSelectedTextModel =",
    "const homeSelectedImageModel =",
    "const importHomePromptReferences = useCallback(",
    "const handleAssetEditSubmit = useCallback(",
    "const selectedTextModel = TEXT_AI_MODELS.find(",
  ]);
}

function readHomeHandoffEffect() {
  return between(
    readCanvas(),
    "  useEffect(() => {\n    if (pendingHomePromptHandledRef.current || collapsed) return;",
    "  }, [\n    applyInspirationSameStyleModel,",
  );
}

function readHomeRouting() {
  return between(readHomeHandoffEffect(), "const homeSelectedImageModel =", 'if (decision.mode === "image") {');
}

function readHomeImagePayload() {
  return between(readHomeHandoffEffect(), "const imagePayload: ImageGeneratorPayload = {", "\n            };\n            dispatchImageGenerationTask(");
}

function readHomeCreate() {
  return between(readHome(), "const createProjectFromPrompt =", "const handlePromptSend =");
}

function executeHomeModelSelection(model: string | null | undefined, routedMode: "image" | "text" | "reference_search" = "image", withReference = false) {
  // 执行生产分支直到真实请求对象构造完成；只截断后续派发与网络调用。
  const branch = between(
    readHomeHandoffEffect(),
    "const homeSelectedTextModel =",
    "\n            };\n            dispatchImageGenerationTask(",
  );
  expect(branch).toContain('if (decision.mode === "image") {');
  expect(branch).toContain("const imagePayload: ImageGeneratorPayload = {");
  const { outputText } = transpileModule(`
    (async () => {
      ${branch}
      };
      return imagePayload;
      }
    })()
  `, { compilerOptions: { target: ScriptTarget.ESNext } });
  const run = new Function("context", `
    const {
      payload, assistantImageModel, AUTO_AI_MODEL, TEXT_AI_MODELS, isSupportedImageModelId,
      setAssistantTextModelId, setAssistantModelTab, setAssistantModelPanelCategory,
      setAssistantAutoMode, setSubmittingKind, setMessages, callLLM, routeCreativeIntent,
      importedReferences, hasImportedReferences, submittedText, projectId,
      DEFAULT_TEXT_MODEL, DEFAULT_AUTO_RATIO, searchReferenceImages,
    } = context;
    return ${outputText}
  `) as (context: Record<string, unknown>) => Promise<{ model: string } | undefined>;
  const callLLM = vi.fn().mockResolvedValue({ text: "文本回复" });
  const routeCreativeIntent = vi.fn().mockResolvedValue({ mode: routedMode, imagePrompt: "路由后的图片提示词" });
  const referenceImages = [{ id: "sky-reference", src: "https://images.example.test/sky.jpg", title: "天空" }];
  const searchReferenceImages = vi.fn().mockResolvedValue({ images: referenceImages });
  const setMessages = vi.fn();
  const setSubmittingKind = vi.fn();
  const importedReferences = withReference ? [{ src: "data:image/png;base64,AA==", title: "参考图" }] : [];
  return {
    result: run({
      payload: { model }, assistantImageModel: { id: "vod-mj" },
      AUTO_AI_MODEL, TEXT_AI_MODELS, isSupportedImageModelId,
      setAssistantTextModelId: vi.fn(), setAssistantModelTab: vi.fn(),
      setAssistantModelPanelCategory: vi.fn(), setAssistantAutoMode: vi.fn(),
      setSubmittingKind, setMessages, callLLM, routeCreativeIntent,
      importedReferences, hasImportedReferences: withReference,
      submittedText: "首页提示词", projectId: "home-model-regression",
      DEFAULT_TEXT_MODEL: "路由文本模型", DEFAULT_AUTO_RATIO: "auto", searchReferenceImages,
    }),
    callLLM, routeCreativeIntent, setMessages, setSubmittingKind, importedReferences, searchReferenceImages, referenceImages,
  };
}

describe("首页交接模型行为（执行生产源码，历史图片模型为 vod-mj）", () => {
  it.each([false, true])("auto 在参考图=%s 时仍传 auto，并且必须经过 intent", async withReference => {
    const execution = executeHomeModelSelection("auto", "image", withReference);
    expect((await execution.result)?.model, "首页 auto 不得被历史 vod-mj 覆盖").toBe("auto");
    expect(execution.routeCreativeIntent).toHaveBeenCalledOnce();
    expect(execution.routeCreativeIntent).toHaveBeenCalledWith(expect.objectContaining({
      referencedAssets: execution.importedReferences,
      forceModelDecision: withReference,
    }));
    expect(execution.callLLM).not.toHaveBeenCalled();
  });

  it("auto 首页索图必须执行搜索并将真实图片写入气泡，不构造生图请求", async () => {
    const execution = executeHomeModelSelection("auto", "reference_search");
    expect(await execution.result).toBeUndefined();
    expect(execution.routeCreativeIntent).toHaveBeenCalledWith(expect.objectContaining({ allowReferenceSearch: true }));
    expect(execution.searchReferenceImages).toHaveBeenCalledWith({ query: "首页提示词", limit: 10 });
    expect(execution.callLLM).not.toHaveBeenCalled();
    expect(execution.setMessages).toHaveBeenCalledOnce();
    const messages = execution.setMessages.mock.calls[0][0]([]);
    expect(messages).toEqual([expect.objectContaining({ role: "assistant", referenceOptions: execution.referenceImages })]);
  });

  it("auto 的 intent 为 text 时不得强制构造图片请求", async () => {
    const execution = executeHomeModelSelection("auto", "text");
    expect(await execution.result).toBeUndefined();
    expect(execution.routeCreativeIntent).toHaveBeenCalledOnce();
    expect(execution.setSubmittingKind).toHaveBeenCalledWith("text");
  });

  it.each(["vod-jimeng", "vod-mj"])("具体图片模型 %s 不得被 auto 或历史偏好替换", async model => {
    expect(IMAGE_AI_MODELS.some(item => item.id === model)).toBe(true);
    expect(isSupportedImageModelId(model)).toBe(true);
    const execution = executeHomeModelSelection(model, "text");
    expect((await execution.result)?.model).toBe(model);
    expect(execution.routeCreativeIntent).not.toHaveBeenCalled();
    expect(execution.callLLM).not.toHaveBeenCalled();
  });

  it("具体图片模型带参考图时仍走 intent，但不得被 text 路由或历史偏好覆盖", async () => {
    const execution = executeHomeModelSelection("vod-jimeng", "text", true);
    expect((await execution.result)?.model).toBe("vod-jimeng");
    expect(execution.routeCreativeIntent).toHaveBeenCalledOnce();
    expect(execution.setSubmittingKind).toHaveBeenCalledWith("image");
    expect(execution.callLLM).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "invalid-model", "AUTO"])("非法或缺失模型 %s 回落历史图片模型", async model => {
    expect(isSupportedImageModelId(model ?? undefined)).toBe(false);
    const execution = executeHomeModelSelection(model);
    expect((await execution.result)?.model).toBe("vod-mj");
    expect(execution.routeCreativeIntent).toHaveBeenCalledOnce();
  });

  it.each(TEXT_AI_MODELS.map(model => [model.id]))("TEXT 模型 %s 早退，不执行图片模型表达式或 intent", async model => {
    const execution = executeHomeModelSelection(model, "image", true);
    expect(await execution.result).toBeUndefined();
    expect(execution.callLLM).toHaveBeenCalledWith(expect.objectContaining({
      module: "home-prompt-chat", model, images: execution.importedReferences,
    }));
    expect(execution.callLLM).toHaveBeenCalledOnce();
    expect(execution.routeCreativeIntent).not.toHaveBeenCalled();
    expect(execution.setSubmittingKind).toHaveBeenCalledWith("text");
    expect(execution.setMessages).toHaveBeenCalledOnce();
  });
});

describe("首页模型选择器必须真正接上（2026-09-13 回归锁）", () => {
  it("首页交接载荷不得把 model 硬编码成 auto", () => {
    const payload = between(readHomeCreate(), "writeHomePromptHandoff({", "\n    });");
    expect(payload).not.toMatch(/model:\s*["']auto["']/);
    expect(payload).toMatch(/model:\s*submittedModelId\s*,/);
    expect(payload).toMatch(/references:\s*homeReferences\.length\s*>\s*0\s*\?\s*homeReferences\s*:\s*undefined/);
  });

  it("首页经 CenteredPromptPanel 实际复用共用选择器，并传递选择与回调", () => {
    const panel = element(readHome(), "CenteredPromptPanel");
    expect(panel).toContain("imageModelId={homeImageModelId}");
    expect(panel).toContain("imageModelOptions={homeImageModelOptions}");
    expect(panel).toContain("onImageModelChange={handleHomeImageModelChange}");
    expect(panel).toContain("onSend={handlePromptSend}");

    const source = readStripped(PANEL_PATH, ["<ModelSelector", "model={imageModelId}", "accept=\"image/*\""]);
    expect(source).toMatch(/import\s*\{\s*ModelSelector\s*\}\s*from\s*"@\/components\/canvas\/ModelSelector";/);
    const selector = element(source, "ModelSelector");
    expect(selector).toContain("model={imageModelId}");
    expect(selector).toContain("onChange={onImageModelChange}");
    expect(selector).toContain("models={imageModelOptions}");
    const controls = between(source, '<div className="flex h-10 items-center justify-between">', "<SkillSelector");
    // 不能退回没有交互的假下拉按钮；不能靠另一个隐藏的选择器满足断言。
    expect(controls).toContain(selector);
    expect(controls).not.toMatch(/图像生成\s*<\/span>\s*<ChevronDown/);
  });

  it("助手偏好初始化与选中即落盘必须走收口函数，不得退回图片专用 API", () => {
    const home = readHome();
    const state = between(home, "const [homeImageModelId, setHomeImageModelId]", "const homeImageModelOptions =");
    expect(state).toMatch(/=\s*useState\(readPreferredAssistantModelId\);\s*$/);
    const change = between(home, "const handleHomeImageModelChange =", "const handleHomeReferenceFiles =");
    expect(change).toContain("setHomeImageModelId(modelId);");
    expect(change).toContain("writePreferredAssistantModelId(modelId);");
    expect(state + change).not.toMatch(/(?:read|write)PreferredImageModelId/);
    // 这是禁止复制存储协议的文件级约束，不能只检查已有调用点。
    expect(home).not.toMatch(/artx:canvas-assistant-(?:image-model|auto-mode|model-tab|text-model)/);
  });

  it("交接双方必须走双通道收口函数，不能直读 sessionStorage", () => {
    const home = readHomeCreate();
    expect(home).not.toContain("artx:pending-home-prompt");
    expect(home).toContain("writeHomePromptHandoff({");
    expect(home).not.toMatch(/sessionStorage\.(get|set|remove)Item/);
    const effect = readHomeHandoffEffect();
    expect(effect).toContain("const payload = peekHomePromptHandoff(projectId);");
    expect(effect).toContain("clearHomePromptHandoff();");
    expect(effect).toContain("readHandoffReferences(payload)");
    expect(effect).not.toContain("artx:pending-home-prompt");
    expect(effect).not.toMatch(/sessionStorage\.(get|set|remove)Item/);
  });
});

describe("首页参考图必须真正驱动出图（静默失效锁）", () => {
  it("referencesEnabled 由实际导入成功的图决定，不得写死 false", () => {
    const payload = readHomeImagePayload();
    expect(payload).not.toMatch(/referencesEnabled:\s*false/);
    expect(payload).toMatch(/referencesEnabled:\s*hasImportedReferences\s*,/);
    expect(payload).toMatch(/referencedAssets:\s*hasImportedReferences\s*\?\s*importedReferences\s*:\s*undefined/);
    expect(payload).toMatch(/model:\s*payload\.model\s*===\s*AUTO_AI_MODEL\.id\s*\?\s*AUTO_AI_MODEL\.id\s*:\s*homeSelectedImageModel\s*\|\|\s*assistantImageModel\.id\s*,/);
    expect(payload).not.toMatch(/model:\s*homeSelectedImageModel\s*\|\|\s*assistantImageModel\.id\s*,/);
  });

  it("hasImportedReferences 必须来自成功导入结果，而非首页原始列表", () => {
    const imports = between(readHomeHandoffEffect(), "const importedReferences =", "const homeSelectedTextModel =");
    expect(imports).toMatch(/handoffReferences\.length\s*>\s*0\s*\?\s*await onImportHomeReferences\(handoffReferences\)\s*:\s*\[\]/);
    expect(imports).toMatch(/hasImportedReferences\s*=\s*importedReferences\.length\s*>\s*0;/);
    expect(imports).not.toMatch(/hasImportedReferences\s*=\s*handoffReferences\.length/);
  });

  it("导入失败时必须告诉用户，不能静默降级成纯文生图", () => {
    const imports = between(readHomeHandoffEffect(), "const importedReferences =", "const homeSelectedTextModel =");
    expect(imports).toMatch(/if\s*\(handoffReferences\.length\s*>\s*0\s*&&\s*!hasImportedReferences\)\s*\{\s*toast\("首页参考图未能载入"/);
  });

  it("图片或 auto 路径带参考图时必须路由，不能只把文字扔给模型", () => {
    const routing = readHomeRouting();
    expect(routing).toMatch(/homeSelectedImageModel\s*&&\s*!hasImportedReferences\s*\?\s*null\s*:\s*await routeCreativeIntent\(/);
    const call = between(routing, "await routeCreativeIntent({", "const decision =");
    expect(call).toContain('module: "home-prompt-canvas-router"');
    expect(call).toMatch(/referencedAssets:\s*importedReferences\s*,/);
    expect(call).toMatch(/forceModelDecision:\s*hasImportedReferences\s*,/);
  });

  it("选定具体图片模型时必须钳到 image，auto 保留路由结果", () => {
    const routing = readHomeRouting();
    expect(routing).toMatch(/const homeSelectedImageModel = isSupportedImageModelId\(payload\.model\)\s*\?\s*payload\.model!\s*:\s*null;/);
    const decision = between(routing, "const decision =", "setSubmittingKind(");
    expect(decision).toMatch(/const decision = homeSelectedImageModel\s*\?\s*\{/);
    expect(decision).toMatch(/mode:\s*"image"\s*as\s*const\s*,/);
    expect(decision).toMatch(/\}\s*:\s*routedDecision!;/);
  });

  it("本轮引用必须在 finally 清账，包含文本早退与失败路径", () => {
    const cleanup = between(readHomeHandoffEffect(), "} finally {", "}, 360);");
    expect(cleanup).toContain('setComposerSegments([createAssistantTextSegment("")]);');
    expect(cleanup).toContain("onMergeReferences([]);");
    expect(cleanup).toContain("syncedReferenceIdsRef.current.clear();");
    expect(cleanup).toContain("setIsSubmitting(false);");
  });

  it("参考图导入复用粘贴链路，登记并返回真实导入的素材", () => {
    const body = between(readCanvas(), "const importHomePromptReferences = useCallback(", "const getNodeImageSrc = useCallback(");
    expect(body).toContain("const importedNodes = await pasteClipboardImageSources(");
    expect(body).toContain("references.map(reference => reference.src)");
    expect(body).toContain("importedNodes.forEach(node => {");
    expect(body).toContain("setReferencedAssets(prev => {");
    expect(body).toContain("const additions = imported.filter(asset => !existingIds.has(asset.id));");
    expect(body).toContain("return imported;");
  });
});

describe("显式文本模型必须直达 LLM，不进入语义路由或图像生成", () => {
  it("首页按交接文本模型调用 home-prompt-chat，带真实参考图并写回回复后早退", () => {
    const branch = between(readHomeHandoffEffect(), "const homeSelectedTextModel =", "const homeSelectedImageModel =");
    expect(branch).toMatch(/TEXT_AI_MODELS\.find\(model => model\.id === payload\.model\);\s*if \(homeSelectedTextModel\) \{/);
    expect(branch).toContain("setAssistantTextModelId(homeSelectedTextModel.id);");
    expect(branch).toContain('setAssistantModelTab("text");');
    expect(branch).toContain('setAssistantModelPanelCategory("text");');
    expect(branch).toContain("setAssistantAutoMode(false);");
    expect(branch).toContain('setSubmittingKind("text");');
    const call = between(branch, "const result = await callLLM({", "setMessages(prev =>");
    expect(call).toContain('module: "home-prompt-chat",');
    expect(call).toContain("model: homeSelectedTextModel.id,");
    expect(call).toContain("images: importedReferences,");
    expect(call).toContain('messages: [{ role: "user", content: submittedText }],');
    expect(branch).toContain("content: result.text,");
    expect(branch).toMatch(/return;\s*\}\s*$/);
    expect(branch).not.toMatch(/routeCreativeIntent\s*\(|generateAiImages\s*\(|dispatchImageGenerationTask\s*\(/);
  });

  it("节点编辑按显式文本模型调用 node-composer-chat，携带最新源图和引用后早退", () => {
    const submit = between(readCanvas(), "const handleAssetEditSubmit = useCallback(", "const handleNodeComposerSubmit = useCallback(");
    const branch = between(submit, "const selectedTextModel =", "const busy = getAssetBusyState(sourceNode.data);");
    // 分支边界用实际图片处理起点，不用固定字符长度或第一个 return。
    expect(branch).toMatch(/TEXT_AI_MODELS\.find\(model => model\.id === payload\.model\);\s*if \(selectedTextModel\) \{/);
    expect(branch).toContain("const src = (await getVisibleAssetImageSource(target.nodeId)) || target.src;");
    const call = between(branch, "const result = await callLLM({", "window.dispatchEvent(");
    expect(call).toContain('module: "node-composer-chat",');
    expect(call).toContain("model: selectedTextModel.id,");
    expect(call).toContain("images: [{ src, title: target.title }, ...payload.references],");
    expect(call).toMatch(/messages:\s*\[\{ role: "user", content: payload\.prompt\.trim\(\)\s*\|\|\s*"请分析这张图片" \}\]/);
    expect(branch).toContain('new CustomEvent("canvas-assistant-external-message"');
    expect(branch).toContain('detail: { role: "assistant", content: result.text }');
    expect(branch).toContain("assetEditInFlightRef.current.add(target.nodeId);");
    expect(branch).toMatch(/finally\s*\{\s*assetEditInFlightRef\.current\.delete\(target\.nodeId\);\s*\}\s*return;\s*\}\s*$/);
    expect(branch).not.toMatch(/routeCreativeIntent\s*\(|generateAiImages\s*\(|editImageWithPrompt\s*\(|dispatchImageGenerationTask\s*\(/);
  });
});

function homeSubmitHarness(prompt: string, model: string, options: {
  authenticated?: boolean;
  aiAuth?: boolean;
} = {}) {
  const file = ts.createSourceFile("HomePage.tsx", readHome(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "HomePage") as ts.FunctionDeclaration;
  expect(component?.body, "必须找到真实首页组件体").toBeTruthy();
  const names = ["handleHomeImageModelChange", "createProjectFromPrompt", "handlePromptSend"];
  const statements = component.body!.statements.filter(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && names.includes(item.name.text)));
  for (const name of names) {
    expect(statements.filter(statement => (statement as ts.VariableStatement).declarationList.declarations.some(item =>
      ts.isIdentifier(item.name) && item.name.text === name)), `生产回调必须唯一：${name}`).toHaveLength(1);
  }
  const context = {
    prompt,
    // 保留旧 render 的不可变模型值，setState 不同步改闭包，暴露同轮交接竞态。
    homeImageModelId: model,
    getExplicitReferenceSearchDecision,
    setHomeImageModelId: vi.fn(), writePreferredAssistantModelId: vi.fn(),
    homeReferences: [{ id: "home-ref", title: "参考", src: "data:image/png;base64,AA==" }],
    homeActiveSkill: { id: "reference-skill", name: "参考技能" },
    isAuthenticated: options.authenticated ?? true,
    requestAiAuth: vi.fn(() => options.aiAuth ?? true),
    setCenteredAuthMode: vi.fn(), setCenteredAuthOpen: vi.fn(),
    createWorkspaceHistoryProject: vi.fn(() => ({ id: "reference-project", createdAt: "2026-11-22" })),
    writeHomePromptHandoff: vi.fn((_payload: unknown) => ({ droppedReferences: false })),
    toast: Object.assign(vi.fn(), { error: vi.fn() }), navigate: vi.fn(),
  };
  const { outputText } = transpileModule(`${statements.map(statement => statement.getText(file)).join("\n")}\nreturn handlePromptSend;`, {
    compilerOptions: { target: ScriptTarget.ESNext, module: ts.ModuleKind.None },
  });
  const send = new Function(...Object.keys(context), outputText)(...Object.values(context)) as () => void;
  return { ...context, send };
}

describe("首页显式参考搜索执行真实发送闭包", () => {
  it.each(["vod-jimeng", TEXT_AI_MODELS[0].id, "auto"])("原选择 %s：实际选择器和本轮交接同时切到 auto", model => {
    const prompt = "  帮我找一些天空的参考图片  ";
    const home = homeSubmitHarness(prompt, model);
    home.send();
    if (model !== "auto") {
      expect(home.setHomeImageModelId).toHaveBeenCalledOnce();
      expect(home.setHomeImageModelId).toHaveBeenCalledWith("auto");
      expect(home.writePreferredAssistantModelId).toHaveBeenCalledOnce();
      expect(home.writePreferredAssistantModelId).toHaveBeenCalledWith("auto");
      expect(home.setHomeImageModelId.mock.invocationCallOrder[0]).toBeLessThan(home.writeHomePromptHandoff.mock.invocationCallOrder[0]);
    }
    expect(home.homeImageModelId, "必须在旧 render 闭包仍持有原模型时验证交接").toBe(model);
    expect(home.writeHomePromptHandoff).toHaveBeenCalledOnce();
    expect(home.writeHomePromptHandoff).toHaveBeenCalledWith(expect.objectContaining({
      model: "auto", prompt: prompt.trim(), shouldAutoRun: true,
      references: home.homeReferences,
      skill: { id: "reference-skill", name: "参考技能" },
    }));
    expect(home.navigate).toHaveBeenCalledWith("/project/reference-project");
  });

  it.each(["vod-jimeng", TEXT_AI_MODELS[0].id])("非搜图请求保持手选模型 %s", model => {
    for (const prompt of ["帮我生成一张天空图片", "解释这些图片的构图"]) {
      const home = homeSubmitHarness(prompt, model);
      home.send();
      expect(home.setHomeImageModelId).not.toHaveBeenCalled();
      expect(home.writePreferredAssistantModelId).not.toHaveBeenCalled();
      expect(home.writeHomePromptHandoff).toHaveBeenCalledWith(expect.objectContaining({ model }));
    }
  });



  it.each([
    { authenticated: false },
    { aiAuth: false },
  ])("鉴权未就绪时不切模型、不创建交接：%j", options => {
    const home = homeSubmitHarness("帮我找一些天空的参考图片", "vod-jimeng", options);
    home.send();
    expect(home.setHomeImageModelId).not.toHaveBeenCalled();
    expect(home.writePreferredAssistantModelId).not.toHaveBeenCalled();
    expect(home.createWorkspaceHistoryProject).not.toHaveBeenCalled();
    expect(home.writeHomePromptHandoff).not.toHaveBeenCalled();
    expect(home.navigate).not.toHaveBeenCalled();
    expect(home.setCenteredAuthMode).toHaveBeenCalledWith("login");
    expect(home.setCenteredAuthOpen).toHaveBeenCalledWith(true);
  });
});
