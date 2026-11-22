import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { assertStripKeptSource, stripSourceComments } from "../../../shared/strip-source-comments";

/** 锁首页与上传按钮的视觉关系，同时守住组件搬迁后的完整接线和偏好协议。 */
const HOME_PAGE_PATH = "client/src/pages/HomePage.tsx";
const PANEL_PATH = "client/src/components/home/CenteredPromptPanel.tsx";
const MODEL_SELECTOR_PATH = "client/src/components/canvas/ModelSelector.tsx";
const CANVAS_PATH = "client/src/components/canvas/InfiniteCanvas.tsx";
const PREFERENCE_PATH = "client/src/lib/assistant-model-preference.ts";

const sourceCache = new Map<string, string>();
function readSource(path: string, anchors: string[]) {
  const cached = sourceCache.get(path);
  if (cached !== undefined) return cached;
  const raw = readFileSync(path, "utf8");
  // 共用剥离器不解析字面量；先用 TS 语法树保护字面量，避免把正则中的 // 当注释。
  const syntax = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const literals: { start: number; end: number; text: string; placeholder: string }[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isRegularExpressionLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) {
      const start = node.getStart(syntax);
      const text = raw.slice(start, node.end);
      const placeholder = `ARTX_LITERAL_${start}_END`;
      expect(raw.includes(placeholder), "字面量占位符不能与原文冲突").toBe(false);
      literals.push({ start, end: node.end, text, placeholder });
    }
    ts.forEachChild(node, collect);
  };
  collect(syntax);
  const chunks: string[] = [];
  let cursor = 0;
  for (const literal of literals.sort((a, b) => a.start - b.start)) {
    chunks.push(raw.slice(cursor, literal.start), literal.placeholder);
    cursor = literal.end;
  }
  chunks.push(raw.slice(cursor));
  const literalByPlaceholder = new Map(literals.map(literal => [literal.placeholder, literal.text]));
  const restored: string[] = [];
  const source = stripSourceComments(chunks.join("")).replace(/ARTX_LITERAL_\d+_END/g, placeholder => {
    restored.push(placeholder);
    return literalByPlaceholder.get(placeholder)!;
  });
  expect(restored.sort(), "剥离后所有字面量都必须恰好恢复一次").toEqual([...literalByPlaceholder.keys()].sort());
  assertStripKeptSource(raw, source);
  // 同一 TS 打印器去注释后比较完整程序，不把百万字符源码作为失败 diff 输出。
  const strippedSyntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  expect(printer.printFile(strippedSyntax) === printer.printFile(syntax), `${path} 剥离后完整程序必须保全`).toBe(true);
  expect(source.length, `${path} 的注释剥离应实际生效`).toBeLessThan(raw.length);
  for (const anchor of anchors) {
    const count = raw.split(anchor).length - 1;
    expect(count, `${path} 缺少真实代码锚点 ${anchor}`).toBeGreaterThan(0);
    expect(source.split(anchor).length - 1, `${path} 剥注释误删 ${anchor}`).toBe(count);
  }
  sourceCache.set(path, source);
  return source;
}

function between(source: string, startAnchor: string, endAnchor: string) {
  expect(source.split(startAnchor).length - 1, `起锚必须唯一：${startAnchor}`).toBe(1);
  expect(source.split(endAnchor).length - 1, `止锚必须唯一：${endAnchor}`).toBe(1);
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor);
  expect(end, "止锚必须在起锚之后").toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body.length).toBeGreaterThan(startAnchor.length);
  return body;
}

function element(source: string, name: string) {
  const calls = [...source.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?/>`, "g"))];
  expect(calls.length, `${name} 必须真实且唯一挂载`).toBe(1);
  return calls[0]![0];
}

const readHome = () => readSource(HOME_PAGE_PATH, [
  "<CenteredPromptPanel", "const handleHomeImageModelChange =", "const createProjectFromPrompt =",
]);
const readPanel = () => readSource(PANEL_PATH, [
  "<ModelSelector", 'accept="image/*"', "<ImagePlus size={16} />", "onChange={onImageModelChange}",
]);
const readSelector = () => readSource(MODEL_SELECTOR_PATH, [
  "const triggerIconColor =", "<ModelBrandIconMask", "<AssistantModelIcon", "color={triggerIconColor}",
]);
const readCanvas = () => readSource(CANVAS_PATH, [
  "function safeWriteCanvasState(", "if (!canvasStorageWarningShown)",
  "const handlePieceReference =", "const payload = peekHomePromptHandoff(projectId);",
]);
const readHomeSelectorCall = () => element(readPanel(), "ModelSelector");

function readUploadButton() {
  const buttons = [...readPanel().matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .map(match => match[0]).filter(button => button.includes("<ImagePlus"));
  expect(buttons).toHaveLength(1);
  return buttons[0]!;
}

function readSurface() {
  return between(readHomeSelectorCall(), "surface={{", "}}") + "}}";
}

describe("首页模型选择器必须与上传图片 icon 同款", () => {
  it("首页到 CenteredPromptPanel 再到共用选择器的完整接线不能断", () => {
    const home = readHome();
    expect(home).toMatch(/import\s*\{\s*CenteredPromptPanel\s*\}\s*from\s*"@\/components\/home\/CenteredPromptPanel";/);
    const call = element(home, "CenteredPromptPanel");
    for (const prop of [
      "imageModelId={homeImageModelId}", "imageModelOptions={homeImageModelOptions}",
      "onImageModelChange={handleHomeImageModelChange}", "onSend={handlePromptSend}",
      "isDark={isDark}", "textMuted={textMuted}", "textPrimary={textPrimary}",
    ]) expect(call).toContain(prop);
    expect(home).toContain("const homeImageModelOptions = useImageModelOptions();");
    const panel = readPanel();
    expect(panel).toMatch(/import\s*\{\s*ModelSelector\s*\}\s*from\s*"@\/components\/canvas\/ModelSelector";/);
    const selector = readHomeSelectorCall();
    for (const prop of ["model={imageModelId}", "models={imageModelOptions}", "onChange={onImageModelChange}", "isDark={isDark}"])
      expect(selector).toContain(prop);
    const controls = between(panel, '<div className="flex h-10 items-center justify-between">', "<SkillSelector");
    expect(controls).toContain(selector);
    expect(controls).toContain(readUploadButton());
    expect(controls).not.toMatch(/图像生成\s*<\/span>\s*<ChevronDown/);
    const send = element(panel, "SendActionButton");
    expect(send).toContain("onClick={onSend}");
    const create = between(home, "const createProjectFromPrompt =", "const handlePromptSend =");
    const payload = between(create, "writeHomePromptHandoff({", "\n    });");
    expect(payload).toMatch(/model:\s*submittedModelId\s*,/);
    expect(create).toContain('getExplicitReferenceSearchDecision(text) ? "auto" : homeImageModelId;');
    expect(payload).not.toMatch(/model:\s*["']auto["']/);
  });

  it("hover 不得有黑色底托，默认底色和展开描边也必须透明", () => {
    const surface = readSurface();
    for (const field of ["background", "border", "hoverBackground", "openBorder"])
      expect(surface).toMatch(new RegExp(`\\b${field}:\\s*"transparent"\\s*,`));
    expect(readUploadButton()).not.toMatch(/(?:background(?:Color)?\s*[:=]|(?:hover:)?bg-)/);
  });

  it("默认态与 hover 态取上传按钮的主题真值，不能退回固定灰白色", () => {
    const button = readUploadButton();
    const idle = button.match(/style=\{\{\s*color:\s*(\w+)\s*\}\}/)?.[1];
    const hover = button.match(/onMouseEnter=\{[^\n]*style\.color\s*=\s*(\w+)/)?.[1];
    const leave = button.match(/onMouseLeave=\{[^\n]*style\.color\s*=\s*(\w+)/)?.[1];
    expect(idle).toBe("textMuted");
    expect(hover).toBe("textPrimary");
    expect(leave).toBe(idle);
    const surface = readSurface();
    expect(surface.match(/\btext:\s*(\w+)\s*,/)?.[1]).toBe(idle);
    expect(surface.match(/\bhoverText:\s*(\w+)\s*,/)?.[1]).toBe(hover);
    const home = readHome();
    for (const token of [idle!, hover!]) {
      const theme = home.match(new RegExp(`const ${token} = isDark \\? "([^"]+)" : "([^"]+)";`));
      expect(theme, `${token} 必须保留深浅主题真值`).not.toBeNull();
      expect(theme![1]).not.toBe(theme![2]);
    }
    expect(readHomeSelectorCall()).toContain('popoverTheme={isDark ? "dark" : "light"}');
    expect(readHomeSelectorCall().match(/triggerClassName="([^"]+)"/)?.[1])
      .toBe(button.match(/className="([^"]+)"/)?.[1]);
  });

  it("图标外层、品牌 mask 与实际触发图标都必须跟随按钮文字色", () => {
    const source = readSelector();
    expect(source).toContain("const triggerIconColor = open || buttonHover ? selectedText : text;");
    const icon = between(source, "function AssistantModelIcon(", "export function ModelSelector(");
    expect(icon.match(/style=\{\{ color, display: "inline-flex"/g), "auto 与品牌图标外层都要继承文字色").toHaveLength(2);
    expect(icon).toMatch(/<ModelBrandIconMask[^>]*style=\{\{ backgroundColor: color \}\}/);
    expect(icon).not.toMatch(/(?:color|backgroundColor):\s*["']#(?:fff|ffffff)["']/i);
    const trigger = between(source, "<AssistantModelIcon\n", "<ChevronDown size={10}");
    expect(trigger).toContain("color={triggerIconColor}");
  });

  it("首页展开栏向上弹，不遮挡提示词", () => {
    expect(readHomeSelectorCall()).toMatch(/placement="up"/);
  });

  it("画布侧默认外观保留深浅主题兜底，不受首页定制影响", () => {
    const source = readSelector();
    const defaults = between(source, "const bg = surface", "const triggerIconColor =");
    expect(defaults).toMatch(/const selectedBg = surface\?\.hoverBackground\s*\?\?\s*\(isDark \? "#161616" : "rgba\(255,255,255,0\.97\)"\);/);
    expect(defaults).toMatch(/const selectedText = surface\?\.hoverText\s*\?\?\s*\(isDark \? "white" : "#161616"\);/);
    expect(defaults).toMatch(/const selectedBorder = surface\?\.openBorder\s*\?\?\s*\(isDark \? "#161616" : "rgba\(20,20,36,0\.22\)"\);/);
  });
});

describe("首页选好的模型要带进画布", () => {
  it("选择器从共用助手偏好模块初始化，不得退回图片专用 API 或复制存储协议", () => {
    const home = readHome();
    const imports = home.match(/import\s*\{([^}]+)\}\s*from\s*"@\/lib\/assistant-model-preference";/)?.[1];
    expect(imports).toBeTruthy();
    expect(imports).toMatch(/\breadPreferredAssistantModelId\b/);
    expect(imports).toMatch(/\bwritePreferredAssistantModelId\b/);
    const state = between(home, "const [homeImageModelId, setHomeImageModelId]", "const homeImageModelOptions =");
    expect(state).toMatch(/=\s*useState\(readPreferredAssistantModelId\);\s*$/);
    expect(home).not.toMatch(/(?:read|write)PreferredImageModelId/);
    expect(home).not.toMatch(/artx:canvas-assistant-(?:image-model|auto-mode|model-tab|text-model)/);
    // 此处只提取顶格 const 声明，不扫文案或反向条件，避免对注释密集的小模块套比例阈值。
    const preference = readFileSync(PREFERENCE_PATH, "utf8");
    expect(preference).toMatch(/^export function readPreferredAssistantModelId\(\): string \{/m);
    expect(preference).toMatch(/^export function writePreferredAssistantModelId\(modelId: string\) \{/m);
    // 画布目前自行读取账号隔离偏好；核对两端实际 key，不能声称画布导入了收口函数。
    const canvas = readCanvas();
    for (const kind of ["IMAGE_MODEL", "AUTO_MODE", "MODEL_TAB", "TEXT_MODEL"]) {
      const key = preference.match(new RegExp(`const ${kind}_STORAGE_KEY = "([^"]+)";`))?.[1];
      expect(key, `${kind} 偏好 key 缺失`).toBeTruthy();
      const canvasKey = canvas.match(new RegExp(`const CANVAS_ASSISTANT_${kind}_STORAGE_KEY =\\s*"([^"]+)";`))?.[1];
      expect(canvasKey).toBe(key);
      expect(canvas).toMatch(new RegExp(`readOwnedPreference\\(\\s*CANVAS_ASSISTANT_${kind}_STORAGE_KEY\\b`));
    }
  });

  it("切换时同步立即保存，不能推迟到发送或异步任务", () => {
    const change = between(readHome(), "const handleHomeImageModelChange =", "const handleHomeReferenceFiles =");
    expect(change).toMatch(/^const handleHomeImageModelChange = \(modelId: string\) => \{\s*setHomeImageModelId\(modelId\);\s*writePreferredAssistantModelId\(modelId\);\s*\};\s*$/);
    expect(change).not.toMatch(/(?:setTimeout|queueMicrotask|Promise\.|await\b|PreferredImageModelId)/);
  });
});

describe("画布存储告警不得刷屏", () => {
  it("去重标记必须是模块级，不能在写入函数内重置", () => {
    const source = readCanvas();
    expect(source).toMatch(/^let canvasStorageWarningShown = false;/m);
    const writer = between(source, "function safeWriteCanvasState(", "function readOwnedPreference(");
    expect(writer).not.toMatch(/(?:let|const|var)\s+canvasStorageWarningShown/);
    expect(writer).toMatch(/if \(!canvasStorageWarningShown\) \{\s*canvasStorageWarningShown = true;/);
  });

  it("存储恢复后要能重新提醒一次", () => {
    const writer = between(readCanvas(), "function safeWriteCanvasState(", "function readOwnedPreference(");
    expect(writer).toMatch(/canvasStorageWarningShown = false;\s*\} catch \{/);
    expect(writer).toContain("canvasStorageWarningShown = true;");
  });
});
