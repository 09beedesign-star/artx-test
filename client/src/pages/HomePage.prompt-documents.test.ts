import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { usePromptDocuments } from "@/hooks/usePromptDocuments";
import { isPromptDocumentFile, parsePromptDocument } from "@/lib/prompt-documents";
import { fitReferencesToBudget, type HomePromptReference } from "@/lib/home-prompt-handoff";
import type { PromptDocument } from "@shared/prompt-documents";
import { stripSourceComments } from "@shared/strip-source-comments";
import { getExplicitReferenceSearchDecision } from "../lib/ai-intent";

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("@/lib/prompt-documents", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/prompt-documents")>(),
  parsePromptDocument: vi.fn(),
}));

const homeSource = readFileSync(new URL("./HomePage.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/home/CenteredPromptPanel.tsx", import.meta.url), "utf8");

// 按 AST 抽取并执行真实生产回调，不复制附件分流或发送逻辑。
function callbacks(source: string, component: string, names: string[], context: Record<string, unknown>) {
  const file = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === component) as ts.FunctionDeclaration;
  const statements = declaration.body!.statements.filter(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && names.includes(item.name.text)));
  expect(statements).toHaveLength(names.length);
  const { outputText } = ts.transpileModule(`${statements.map(statement => statement.getText(file)).join("\n")}\nreturn { ${names.join(",")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
  });
  return new Function(...Object.keys(context), outputText)(...Object.values(context));
}

function documentFor(file: Pick<File, "name">): PromptDocument {
  return { id: file.name, name: file.name, format: "txt", size: 20, text: "完整正文\n不得截断", structure: "原始文本，保留换行" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function homeHarness(prompt = "分析附件") {
  const readers: Array<{ file: File; finish: (result?: string) => void; abort: () => void; fail: () => void }> = [];
  const promptDocuments = usePromptDocuments();
  const homeReferencesRef = { current: [] as HomePromptReference[] };
  const homeImageReadsRef = { current: 0 };
  const toast = Object.assign(vi.fn(), { error: vi.fn() });
  const context = {
    prompt, promptDocuments, homeReferencesRef, homeImageReadsRef,
    // 故意保持旧 render 的空列表，证明异步完成后发送不再依赖陈旧闭包。
    homeReferences: [],
    setHomeReferences: vi.fn(), setHomeImagesBusy: vi.fn(),
    toast, isPromptDocumentFile, fitReferencesToBudget,
    isAuthenticated: true, requestAiAuth: vi.fn(() => true),
    setCenteredAuthMode: vi.fn(), setCenteredAuthOpen: vi.fn(),
    homeImageModelId: "vod-jimeng", homeActiveSkill: null,
    getExplicitReferenceSearchDecision, handleHomeImageModelChange: vi.fn(),
    createWorkspaceHistoryProject: vi.fn(() => ({ id: "home-doc", createdAt: "2026-11-20" })),
    writeHomePromptHandoff: vi.fn((_payload: unknown) => ({ ok: true, droppedReferences: false })), navigate: vi.fn(),
  };
  vi.stubGlobal("FileReader", class {
    result: string | null = null;
    onload = () => {};
    onabort = () => {};
    onerror = () => {};
    readAsDataURL(file: File) {
      readers.push({ file, finish: (result = "data:image/png;base64,QQ==") => {
        this.result = result; this.onload();
      }, abort: () => this.onabort(), fail: () => this.onerror() });
    }
  });
  const handlers = callbacks(homeSource, "HomePage", [
    "handleHomeReferenceFiles", "handleRemoveHomeReference", "createProjectFromPrompt", "handlePromptSend",
  ], context) as {
    handleHomeReferenceFiles: (files: File[]) => Promise<void>;
    handleRemoveHomeReference: (id: string) => void;
    handlePromptSend: () => void;
  };
  return { ...handlers, ...context, readers };
}

beforeEach(() => {
  vi.mocked(parsePromptDocument).mockReset().mockImplementation(async file => {
    if (!isPromptDocumentFile(file)) throw new Error("不支持此文档格式");
    return documentFor(file);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("首页附件生产回调行为（无 DOM）", () => {
  it("混批先同步登记文档，再读取图片；同轮发送被文档及图片双硬闸拦住", async () => {
    const parsing = deferred<PromptDocument>();
    vi.mocked(parsePromptDocument).mockReturnValueOnce(parsing.promise);
    const home = homeHarness();
    const doc = new File(["正文"], "需求.txt");
    const image = new File(["图片"], "参考.png", { type: "image/png" });
    const pending = home.handleHomeReferenceFiles([image, doc]);
    expect(home.readers).toHaveLength(1);
    expect(home.homeImageReadsRef.current).toBe(1);
    expect(() => home.promptDocuments.assertReady()).toThrow("仍在解析");
    home.handlePromptSend();
    expect(home.toast.error).toHaveBeenLastCalledWith(expect.stringContaining("仍在解析"));
    expect(home.createWorkspaceHistoryProject).not.toHaveBeenCalled();

    parsing.resolve(documentFor(doc));
    await parsing.promise;
    await Promise.resolve();
    home.handlePromptSend();
    expect(home.toast.error).toHaveBeenLastCalledWith(expect.stringContaining("参考图仍在读取"));
    expect(home.createWorkspaceHistoryProject).not.toHaveBeenCalled();

    home.readers[0].finish();
    await pending;
    home.handlePromptSend();
    const payload = home.writeHomePromptHandoff.mock.calls[0]?.[0] as unknown as { documents: PromptDocument[]; references: HomePromptReference[]; model: string };
    expect(payload.documents).toEqual(home.promptDocuments.assertReady());
    expect(payload.documents[0].text).toBe(documentFor(doc).text);
    expect(payload.references[0].src).toBe("data:image/png;base64,QQ==");
    expect(payload.model).toBe("vod-jimeng");
    expect(home.homeImageReadsRef.current).toBe(0);
    expect(home.setHomeImagesBusy).toHaveBeenLastCalledWith(false);
  });

  it("纯图片读取也有同步 ref 闸门，不能靠按钮下一次 render 才阻止发送", async () => {
    const home = homeHarness();
    const pending = home.handleHomeReferenceFiles([new File(["图"], "照片.JPG")]);
    home.handlePromptSend();
    expect(home.toast.error).toHaveBeenCalledWith(expect.stringContaining("参考图仍在读取"));
    expect(home.navigate).not.toHaveBeenCalled();
    home.readers[0].finish();
    await pending;
    home.handlePromptSend();
    expect(home.writeHomePromptHandoff).toHaveBeenCalledWith(expect.objectContaining({ references: home.homeReferencesRef.current }));
  });

  it("并发图片批次不覆盖已添加图片，读取期间删除也不被异步旧列表复活", async () => {
    const home = homeHarness();
    const a = home.handleHomeReferenceFiles([new File(["a"], "a.png")]);
    const b = home.handleHomeReferenceFiles([new File(["b"], "b.png")]);
    home.readers[0].finish();
    await a;
    expect(home.homeImageReadsRef.current).toBe(1);
    home.handlePromptSend();
    expect(home.writeHomePromptHandoff).not.toHaveBeenCalled();
    home.readers[1].finish();
    await b;
    expect(home.homeReferencesRef.current.map(item => item.title)).toEqual(["a", "b"]);
    const c = home.handleHomeReferenceFiles([new File(["c"], "c.png")]);
    home.handleRemoveHomeReference(home.homeReferencesRef.current[0].id);
    home.readers[2].finish();
    await c;
    expect(home.homeReferencesRef.current.map(item => item.title)).toEqual(["b", "c"]);
  });

  it("非法文件不静默忽略：同批合法文档/图片保留，发送报错，移除错误后恢复", async () => {
    const ids = vi.spyOn(crypto, "randomUUID");
    const home = homeHarness();
    const pending = home.handleHomeReferenceFiles([
      new File(["图"], "图.webp"), new File(["正文"], "需求.TXT"), new File(["bad"], "程序.exe"),
    ]);
    home.readers[0].finish();
    await pending;
    expect(parsePromptDocument).toHaveBeenCalledTimes(2);
    home.handlePromptSend();
    expect(home.toast.error).toHaveBeenCalledWith(expect.stringContaining("程序.exe"));
    expect(home.toast.error).toHaveBeenCalledWith(expect.stringContaining("不支持此文档格式"));
    expect(home.navigate).not.toHaveBeenCalled();
    home.promptDocuments.remove(ids.mock.results[1].value);
    expect(home.promptDocuments.assertReady()).toHaveLength(1);
    home.handlePromptSend();
    expect(home.writeHomePromptHandoff).toHaveBeenCalledWith(expect.objectContaining({
      references: home.homeReferencesRef.current, documents: home.promptDocuments.assertReady(),
    }));
    const id = home.promptDocuments.assertReady()[0].id;
    home.promptDocuments.remove(id);
    expect(home.promptDocuments.assertReady()).toEqual([]);
    ids.mockRestore();
  });

  it("doc-only 空 prompt 可发送，不注入强制出图提示词且保留所选模型", async () => {
    const home = homeHarness("  ");
    await home.handleHomeReferenceFiles([new File(["正文"], "需求.txt")]);
    home.handlePromptSend();
    expect(home.createWorkspaceHistoryProject).toHaveBeenCalledWith("需求.txt", "");
    expect(home.writeHomePromptHandoff).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "", model: "vod-jimeng", shouldAutoRun: true,
      documents: home.promptDocuments.assertReady(), references: undefined,
    }));
    expect(home.navigate).toHaveBeenCalledWith("/project/home-doc");
  });

  it("没有文档的空 prompt 仍按原规则拒绝创建", () => {
    const home = homeHarness(" ");
    home.handlePromptSend();
    expect(home.toast).toHaveBeenCalledWith("请输入提示词或添加文档");
    expect(home.createWorkspaceHistoryProject).not.toHaveBeenCalled();
  });

  it.each(["abort", "fail"] as const)("图片 %s 清除 busy 并明确报错，不影响同批合法文档", async mode => {
    const home = homeHarness();
    const pending = home.handleHomeReferenceFiles([new File(["图"], "图.png"), new File(["正文"], "需求.txt")]);
    home.readers[0][mode]();
    await pending;
    expect(home.homeImageReadsRef.current).toBe(0);
    expect(home.setHomeImagesBusy).toHaveBeenLastCalledWith(false);
    expect(home.toast).toHaveBeenCalledWith("部分图片读取失败", expect.anything());
    expect(home.promptDocuments.assertReady()).toHaveLength(1);
  });

  it("图片预算仍生效，超限必须明确告知", async () => {
    const home = homeHarness();
    const pending = home.handleHomeReferenceFiles([new File(["图"], "大图.png")]);
    home.readers[0].finish(`data:image/png;base64,${"A".repeat(3_000_000)}`);
    await pending;
    expect(home.homeReferencesRef.current).toEqual([]);
    expect(home.toast).toHaveBeenCalledWith("部分参考图未能添加", expect.anything());
  });
});

describe("首页面板附件接线", () => {
  it("加号与文件 drop 共用同一入口；chip 删除、busy/error 禁用与 DOCUMENT_ACCEPT 真正挂载", () => {
    const home = stripSourceComments(homeSource);
    const panel = stripSourceComments(panelSource);
    expect(home).toContain("documents={promptDocuments.entries}");
    expect(home).toContain("onRemoveDocument={promptDocuments.remove}");
    expect(home).toContain("attachmentsDisabled={promptDocuments.busy || promptDocuments.hasErrors || homeImagesBusy}");
    expect(home).toContain("attachmentsBusy={promptDocuments.busy || homeImagesBusy}");
    expect(panel).toContain("<PromptDocumentAttachments entries={documents} onRemove={onRemoveDocument} />");
    expect(panel).toContain("accept={`image/*,${DOCUMENT_ACCEPT}`}");
    expect(panel.match(/if \(files.length > 0\) onReferenceFiles\(files\);/g)).toHaveLength(2);
    expect(panel).toContain("disabled={attachmentsDisabled}");
    expect(panel).toContain("loading={attachmentsBusy}");
    expect(panel).toContain("onDragEnter={handleFileDrag}");
    expect(panel).toContain("onDragOver={handleFileDrag}");
    expect(panel).toContain("onDragLeave={handleFileDragLeave}");
    expect(panel).toContain("onDrop={handleFileDrop}");
    for (const event of ["drop", "dragend"]) {
      expect(panel).toContain(`window.addEventListener("${event}", resetFileDrag, true)`);
      expect(panel).toContain(`window.removeEventListener("${event}", resetFileDrag, true)`);
    }
    const add = home.slice(home.indexOf("const handleHomeReferenceFiles ="), home.indexOf("const handleRemoveHomeReference ="));
    expect(add.indexOf("promptDocuments.addFiles(documentFiles)")).toBeLessThan(add.indexOf("await "));
    expect(add.indexOf("homeImageReadsRef.current += 1")).toBeLessThan(add.indexOf("await readAsDataUrl"));
  });

  it("文件拖拽阻止冒泡并接收混批，普通文字拖拽保持默认；节点内 dragleave 不拦冒泡", () => {
    class FakeNode {}
    vi.stubGlobal("Node", FakeNode);
    const setIsFileDragOver = vi.fn();
    const resetFileDrag = vi.fn();
    const onReferenceFiles = vi.fn();
    const handlers = callbacks(panelSource, "CenteredPromptPanel", ["hasFiles", "handleFileDrag", "handleFileDragLeave", "handleFileDrop"], {
      setIsFileDragOver, resetFileDrag, onReferenceFiles,
    });
    const files = [new File(["正文"], "需求.txt"), new File(["图"], "参考.png")];
    const event = {
      dataTransfer: { types: ["Files"], files, dropEffect: "none" },
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
      relatedTarget: new FakeNode(), currentTarget: { contains: vi.fn(() => true) },
    };
    handlers.handleFileDrag(event);
    expect(setIsFileDragOver).toHaveBeenCalledWith(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    handlers.handleFileDragLeave(event);
    expect(resetFileDrag).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    event.currentTarget.contains.mockReturnValue(false);
    handlers.handleFileDragLeave(event);
    expect(resetFileDrag).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    handlers.handleFileDrop(event);
    expect(onReferenceFiles).toHaveBeenCalledWith(files);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    event.dataTransfer.types = ["text/plain"];
    event.preventDefault.mockClear();
    event.stopPropagation.mockClear();
    onReferenceFiles.mockClear();
    handlers.handleFileDrag(event);
    handlers.handleFileDrop(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(onReferenceFiles).not.toHaveBeenCalled();
  });
});
