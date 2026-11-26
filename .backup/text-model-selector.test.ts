import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { TEXT_AI_MODELS, IMAGE_AI_MODELS } from "./workspace-data";
import { readPreferredAssistantModelId, writePreferredAssistantModelId } from "./assistant-model-preference";
import { textModelOptionsForAccess } from "./model-access";

const expected = ["claude-opus-5-5", "gpt-6-luna", "deepseek-v4-flash"];
const canvas = readFileSync(new URL("../components/canvas/InfiniteCanvas.tsx", import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("three manual language model selectors", () => {
  it("exact ids and labels are shared without polluting image generators", () => {
    expect(TEXT_AI_MODELS.map(m => m.id)).toEqual(expected);
    expect(TEXT_AI_MODELS.map(m => m.label)).toEqual(["Claude Opus 5.5", "GPT-6 Luna", "DeepSeek V4 Flash"]);
    expect(IMAGE_AI_MODELS.some(m => expected.includes(m.id))).toBe(false);
    expect(TEXT_AI_MODELS.some(m => m.id === "claude-opus-5")).toBe(false);
  });
  it.each(expected)("persists selected %s without replacing image preference", model => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } });
    writePreferredAssistantModelId(model);
    expect(readPreferredAssistantModelId()).toBe(model);
    expect([...storage.entries()].some(([k,v]) => k.includes("image-model") && v === model)).toBe(false);
  });
  it("restricted accounts see all three but cannot select unauthorized models", () => {
    const options = textModelOptionsForAccess(TEXT_AI_MODELS, ["gpt-6-luna"]);
    expect(options.map(m => m.id)).toEqual(expected);
    expect(options.filter(m => !m.disabled).map(m => m.id)).toEqual(["gpt-6-luna"]);
    expect(textModelOptionsForAccess(TEXT_AI_MODELS, []).every(m => m.disabled)).toBe(true);
    expect(textModelOptionsForAccess(TEXT_AI_MODELS).every(m => !m.disabled)).toBe(true);
  });
  it("all-disabled text rows remain visible but cannot masquerade as usable models", () => {
    const availability = canvas.match(/const hasAvailableAssistantTextModel = ([^;]+);/)?.[1];
    expect(availability).toBeTruthy();
    const hasAvailable = new Function("availableAssistantTextModels", `return ${availability};`);
    expect(hasAvailable(textModelOptionsForAccess(TEXT_AI_MODELS, []))).toBe(false);
    for (const model of expected) {
      expect(hasAvailable(textModelOptionsForAccess(TEXT_AI_MODELS, [model]))).toBe(true);
    }
    const start = canvas.indexOf("async function handleSubmit()", canvas.indexOf("function CanvasAssistantPanel"));
    const guard = canvas.slice(start, canvas.indexOf("const rawSubmittedComposerPrompt", start));
    expect(guard).toContain("if (!assistantModelOptions.some(model => !model.disabled)) {");
    expect(guard).toMatch(/toast\("当前账号没有可用的 AI 模型"\);\s*return;/);
    const availabilityEffect = canvas.slice(canvas.indexOf('if (assistantModelTab === "image" && availableAssistantImageModels.length === 0'), canvas.indexOf('// 业务页签被外部改动'));
    expect(availabilityEffect).toContain('assistantModelTab === "text" && !hasAvailableAssistantTextModel');
    expect(availabilityEffect).not.toContain("availableAssistantTextModels.length");
  });
  it.each(["home-prompt-chat", "node-composer-chat", "right-ai-assistant-chat", "draft-node-chat"])("%s forwards manual selection", module => {
    const start = canvas.indexOf(`module: "${module}"`);
    expect(start).toBeGreaterThan(0);
    expect(canvas.slice(start, start + 240)).toMatch(/modelSelection:\s*(?:"manual"|assistantAutoMode \? undefined : "manual")/);
  });
  it("all document entrypoints forward selected language model", () => {
    const modules = ["home-prompt-documents", "right-ai-assistant-documents", "node-composer-documents"];
    for (const module of modules) {
      const start = canvas.indexOf(`module: "${module}"`);
      expect(start).toBeGreaterThan(0);
      expect(canvas.slice(start - 250, start)).toMatch(/model: (homeSelectedTextModel\?\.id|!assistantAutoMode[^\n]+|payload.model),/);
    }
  });
  it("manual draft requests return before dispatching image tasks", () => {
    const start = canvas.indexOf('module: "draft-node-chat"');
    const end = canvas.indexOf('const generationId =', start);
    expect(end).toBeGreaterThan(start);
    expect(canvas.slice(start, end)).toContain("return;");
    expect(canvas.slice(start, end)).not.toContain("dispatchImageGenerationTask(");
  });
});
