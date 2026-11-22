import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JsxEmit, ScriptTarget, transpileModule } from "typescript";
import { assertStripKeptSource, stripSourceComments } from "../../../../shared/strip-source-comments";
import { canvasMemoryScopeId } from "../../../../shared/user-memory";
import {
  createConversationMeta,
  isConversationMemoryEnabled,
  setConversationMemoryEnabled,
  type CanvasConversationIndex,
} from "../../lib/canvas-conversations";

// 不加载整个画布运行时；执行从生产源码提取的闭包，外部副作用用 spy 观察。
const raw = readFileSync(new URL("./InfiniteCanvas.tsx", import.meta.url), "utf8");
const source = stripSourceComments(raw);
assertStripKeptSource(raw, source);

function uniqueIndex(text: string, anchor: string) {
  expect(text.split(anchor).length - 1, `代码锚点必须唯一：${anchor}`).toBe(1);
  return text.indexOf(anchor);
}

function between(text: string, startAnchor: string, endAnchor: string, minLength: number) {
  const start = uniqueIndex(text, startAnchor);
  const end = uniqueIndex(text, endAnchor);
  expect(end, "切片终点必须位于起点之后").toBeGreaterThan(start);
  const block = text.slice(start, end);
  expect(block.length, "切片过短，不能只测签名或空字符串").toBeGreaterThan(minLength);
  return block;
}

function execute<T>(block: string, result: string, context: Record<string, unknown>): T {
  const { outputText } = transpileModule(`${block}\nreturn ${result};`, {
    fileName: "memory-harness.tsx",
    compilerOptions: { target: ScriptTarget.ESNext, jsx: JsxEmit.React },
  });
  return new Function(...Object.keys(context), outputText)(...Object.values(context)) as T;
}

function conversationIndex(): CanvasConversationIndex {
  return {
    // 故意与传给闭包的 activeConversationId 不同，防止误读索引首条或 activeId。
    activeId: "other",
    conversations: [
      { ...createConversationMeta("other"), memoryEnabled: false },
      { ...createConversationMeta("current"), memoryEnabled: true },
    ],
  };
}

function executeMemoryWiring(index: CanvasConversationIndex, activeConversationId: string, memoryDoc: object | null = {}) {
  const block = between(source, "const memoryContextEnabled =", "const handleToggleMemoryContext =", 800);
  const setCurrentMemoryScope = vi.fn();
  const listUserMemorySourcesByPriority = vi.fn().mockReturnValue(["实际来源"]);
  let cleanup: (() => void) | undefined;
  const result = execute<{
    memoryContextEnabled: boolean;
    memoryScopePayload: { memoryScopeId: string; memoryEnabled: boolean };
    memorySources: string[];
  }>(block, "{ memoryContextEnabled, memoryScopePayload, memorySources }", {
    conversationIndex: index, activeConversationId, projectId: "memory-project", memoryDoc,
    isConversationMemoryEnabled, canvasMemoryScopeId, setCurrentMemoryScope,
    listUserMemorySourcesByPriority,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); },
  });
  return { ...result, setCurrentMemoryScope, listUserMemorySourcesByPriority, cleanup };
}

function executeToggle(options: { busy?: boolean; failPersist?: boolean } = {}) {
  const block = between(source, "const handleToggleMemoryContext =", "const conversationSearchHits =", 800);
  const index = conversationIndex();
  const persistConversationIndex = options.failPersist
    ? vi.fn().mockImplementation(() => { throw new Error("落盘失败"); })
    : vi.fn();
  const scheduleWorkspaceSync = vi.fn();
  const setMemoryContextBusy = vi.fn();
  const toast = vi.fn();
  const setMetadata = vi.fn(setConversationMemoryEnabled);
  const saveUserMemory = vi.fn();
  const setMemoryContextEnabled = vi.fn();
  const broadcastUserMemoryChange = vi.fn();
  const toggle = execute<(next: boolean) => Promise<void>>(block, "handleToggleMemoryContext", {
    useCallback: (callback: unknown) => callback,
    memoryContextBusy: options.busy ?? false,
    setMemoryContextBusy, persistConversationIndex, scheduleWorkspaceSync, toast,
    conversationIndex: index, activeConversationId: "current",
    setConversationMemoryEnabled: setMetadata,
    saveUserMemory, setMemoryContextEnabled, broadcastUserMemoryChange,
  });
  return { toggle, index, persistConversationIndex, scheduleWorkspaceSync, setMemoryContextBusy,
    toast, setMetadata, saveUserMemory, setMemoryContextEnabled, broadcastUserMemoryChange };
}

function memorySwitch() {
  const at = uniqueIndex(source, 'data-testid="composer-memory-switch"');
  const start = source.lastIndexOf("<Switch", at);
  const end = source.indexOf("/>", at);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(at);
  const block = source.slice(start, end + 2);
  uniqueIndex(block, "<Switch");
  expect(block.length).toBeGreaterThan(300);
  return block;
}

function executeSwitch(enabled: boolean, busy = false) {
  const toggle = vi.fn();
  const props = execute<{ checked: boolean; disabled: boolean; onCheckedChange: (next: boolean) => void }>(
    `const element = (${memorySwitch()});`, "element.props", {
      React: { createElement: (_type: unknown, props: unknown) => ({ props }) },
      Switch: "Switch", memoryContextEnabled: enabled, memoryContextBusy: busy,
      handleToggleMemoryContext: toggle,
    },
  );
  return { props, toggle };
}

describe("会话记忆真值与请求接线", () => {
  it("新建对话默认开启，显式关闭仍按当前会话元数据生效", () => {
    const fresh = createConversationMeta("fresh");
    expect(fresh.memoryEnabled).toBe(true);
    const index = { activeId: fresh.id, conversations: [fresh] };
    expect(executeMemoryWiring(index, fresh.id).memoryContextEnabled).toBe(true);
    expect(executeMemoryWiring(setConversationMemoryEnabled(index, fresh.id, false), fresh.id).memoryContextEnabled).toBe(false);
  });

  it.each(["current", "other"])("请求 memoryEnabled 来自当前会话 %s，而非全局或镜像状态", activeId => {
    const execution = executeMemoryWiring(conversationIndex(), activeId);
    expect(execution.memoryContextEnabled).toBe(activeId === "current");
    expect(execution.memoryScopePayload).toEqual({
      memoryScopeId: canvasMemoryScopeId("memory-project", activeId),
      memoryEnabled: activeId === "current",
    });
  });

  it("setCurrentMemoryScope 消费真实请求载荷，卸载时清空作用域", () => {
    const execution = executeMemoryWiring(conversationIndex(), "current");
    expect(execution.setCurrentMemoryScope).toHaveBeenCalledOnce();
    expect(execution.setCurrentMemoryScope).toHaveBeenCalledWith(execution.memoryScopePayload);
    expect(execution.cleanup).toBeTypeOf("function");
    execution.cleanup!();
    expect(execution.setCurrentMemoryScope.mock.calls).toEqual([[execution.memoryScopePayload], [null]]);
  });

  it.each(["current", "other"])("memorySources 的 includeRecentPrompts 与当前会话 %s 同值", activeId => {
    const document = { longTerm: "长期设计习惯" };
    const execution = executeMemoryWiring(conversationIndex(), activeId, document);
    expect(execution.listUserMemorySourcesByPriority).toHaveBeenCalledOnce();
    expect(execution.listUserMemorySourcesByPriority).toHaveBeenCalledWith({
      document, projectId: "memory-project",
      conversationId: canvasMemoryScopeId("memory-project", activeId),
      includeRecentPrompts: activeId === "current",
    });
    expect(execution.memorySources).toEqual(["实际来源"]);
  });

  it("记忆文档未读到时不伪造来源，也不关闭会话请求开关", () => {
    const execution = executeMemoryWiring(conversationIndex(), "current", null);
    expect(execution.memorySources).toEqual([]);
    expect(execution.listUserMemorySourcesByPriority).not.toHaveBeenCalled();
    expect(execution.memoryScopePayload.memoryEnabled).toBe(true);
  });
});

describe("toggle 执行当前会话元数据闭包", () => {
  it.each([true, false])("接受 next=%s，仅更新当前会话、持久化后安排同步", async next => {
    const execution = executeToggle();
    const original = structuredClone(execution.index);
    await execution.toggle(next);
    expect(execution.setMetadata).toHaveBeenCalledOnce();
    expect(execution.setMetadata).toHaveBeenCalledWith(execution.index, "current", next);
    expect(execution.persistConversationIndex).toHaveBeenCalledOnce();
    expect(execution.persistConversationIndex).toHaveBeenCalledWith({
      ...execution.index,
      conversations: [execution.index.conversations[0], { ...execution.index.conversations[1], memoryEnabled: next }],
    });
    expect(execution.index).toEqual(original);
    expect(execution.scheduleWorkspaceSync).toHaveBeenCalledOnce();
    expect(execution.persistConversationIndex.mock.invocationCallOrder[0]).toBeLessThan(execution.scheduleWorkspaceSync.mock.invocationCallOrder[0]);
    expect(execution.setMemoryContextBusy.mock.calls).toEqual([[true], [false]]);
    expect(execution.saveUserMemory).not.toHaveBeenCalled();
    expect(execution.setMemoryContextEnabled).not.toHaveBeenCalled();
    expect(execution.broadcastUserMemoryChange).not.toHaveBeenCalled();
    expect(execution.toast).toHaveBeenCalledOnce();
    expect(execution.toast).toHaveBeenCalledWith(
      next ? "您已开启上下文记忆，可以更好地帮助理解您的意图" : "已关闭当前对话的上下文记忆",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("忙碌时不重复写入或同步", async () => {
    const execution = executeToggle({ busy: true });
    await execution.toggle(false);
    expect(execution.setMetadata).not.toHaveBeenCalled();
    expect(execution.persistConversationIndex).not.toHaveBeenCalled();
    expect(execution.scheduleWorkspaceSync).not.toHaveBeenCalled();
    expect(execution.setMemoryContextBusy).not.toHaveBeenCalled();
    expect(execution.toast).not.toHaveBeenCalled();
  });

  it("持久化失败提示真实错误、释放忙碌且不调度同步", async () => {
    const execution = executeToggle({ failPersist: true });
    await execution.toggle(false);
    expect(execution.toast).toHaveBeenCalledOnce();
    expect(execution.toast).toHaveBeenCalledWith("上下文记忆开关没保存成功", { description: "落盘失败" });
    expect(execution.scheduleWorkspaceSync).not.toHaveBeenCalled();
    expect(execution.setMemoryContextBusy.mock.calls).toEqual([[true], [false]]);
  });
});

describe("Switch 与画布交互保护", () => {
  it.each([true, false])("Switch checked=%s 跟随会话真值并透传切换值", enabled => {
    const { props, toggle } = executeSwitch(enabled);
    expect(props.checked).toBe(enabled);
    expect(props.disabled).toBe(false);
    props.onCheckedChange(!enabled);
    expect(toggle).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledWith(!enabled);
    expect(executeSwitch(enabled, true).props.disabled).toBe(true);
  });

  it("图标和开关不依赖 contextLabel，容器阻止画布拖动与事件穿透", () => {
    const block = between(source,
      'className="nodrag nopan absolute flex items-center gap-1.5 rounded-[var(--radius-pill)] px-1.5 py-1"',
      "{contextLabel && (", 1000);
    expect(block).toContain(memorySwitch());
    expect(block).toMatch(/<Brain\s/);
    expect(block).toContain("onPointerDown={event => event.stopPropagation()}");
    expect(block).toContain("onMouseDown={event => event.stopPropagation()}");
    const shell = between(source, "ref={composerShellRef}", "onMouseDown={event => {\n                  const target = event.target as HTMLElement;", 400);
    expect(shell).toContain("paddingTop: 26,");
  });

  it("记忆文档订阅全站变更并在卸载时摘除，不再广播会话开关为全局设置", () => {
    const effect = between(source,
      "useEffect(() => {\n    let alive = true;\n    void fetchUserMemory()",
      "const composerUploadInputRef =", 700);
    expect(effect).toContain("setMemoryDoc(document);");
    expect(effect).toContain("setMemoryDoc(detail as UserMemoryDocument);");
    expect(effect).toContain("window.addEventListener(USER_MEMORY_CHANGED_EVENT, handleChange);");
    expect(effect).toContain("window.removeEventListener(USER_MEMORY_CHANGED_EVENT, handleChange);");
    expect(effect).not.toContain("setMemoryContextEnabled(");
  });
});
