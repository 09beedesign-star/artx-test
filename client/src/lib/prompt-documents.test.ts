import { afterAll, beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, build, type ViteDevServer } from "vite";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { validatePromptDocuments, MAX_PROMPT_DOCUMENTS, DOCUMENT_ACCEPT } from "@shared/prompt-documents";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
const sheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const presentation = "http://schemas.openxmlformats.org/presentationml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
const relationships = (entries: string) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
const docx = (body = "真实文字 &amp; 表格") => `<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>单元格</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;

async function zip(files: Record<string, string | Uint8Array>, compression: "STORE" | "DEFLATE" = "STORE") {
  const archive = new JSZip();
  archive.file("[Content_Types].xml", types);
  for (const [name, body] of Object.entries(files)) archive.file(name, body, { createFolders: false });
  return archive.generateAsync({ type: "uint8array", compression });
}

function rc4(key: Buffer, input: Buffer) {
  const state = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) & 255; [state[i], state[j]] = [state[j], state[i]]; }
  let i = 0; j = 0;
  return Buffer.from(input.map(value => {
    i = (i + 1) & 255; j = (j + state[i]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
    return value ^ state[(state[i] + state[j]) & 255];
  }));
}

// 真正的最小 PDF，含有效 xref；加密变体使用标准 R2/RC4，包含免输入密码的加密文件。
function pdfFixture(text: string, password?: string): Uint8Array {
  const padding = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
  const pad = (value: string) => Buffer.concat([Buffer.from(value), padding]).subarray(0, 32);
  const md5 = (value: Buffer) => createHash("md5").update(value).digest();
  const id = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  let encryption = "";
  let content = Buffer.from(text ? `BT /F1 12 Tf 50 750 Td (${text}) Tj ET` : "");
  if (password !== undefined) {
    const owner = rc4(md5(pad("owner-password")).subarray(0, 5), pad(password));
    const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
    const key = md5(Buffer.concat([pad(password), owner, permissions, id])).subarray(0, 5);
    const user = rc4(key, padding);
    const objectKey = md5(Buffer.concat([key, Buffer.from([4, 0, 0, 0, 0])])).subarray(0, 10);
    content = rc4(objectKey, content);
    encryption = `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P -4 >>`;
  }
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    ...(encryption ? [Buffer.from(encryption)] : []),
  ];
  const chunks = [Buffer.from("%PDF-1.7\n")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
  });
  const start = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryption ? ` /Encrypt 6 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>]` : ""} >>\nstartxref\n${start}\n%%EOF`));
  return new Uint8Array(Buffer.concat(chunks));
}

const valid = (id = "a", text = "正文") => ({ id, name: "文档.txt", format: "txt", size: 8, text, structure: "纯文本" });

describe("共享附件合同", () => {
  it("固定数量和 accept，不导出浏览器 parser", () => {
    expect(MAX_PROMPT_DOCUMENTS).toBe(4);
    expect(DOCUMENT_ACCEPT).toBe(".txt,.md,.csv,.tsv,.json,.pdf,.docx,.pptx,.xlsx");
    expect(validatePromptDocuments([valid()])).toEqual([valid()]);
  });
  it("拒绝非法输入、重复 ID、超限，不静默截断", () => {
    for (const value of [null, {}, [null], new Array(1), Array.from({ length: 5 }, (_, i) => valid(String(i))), [valid(), valid()],
      [{ ...valid(), size: 10 * 1024 * 1024 + 1 }], [{ ...valid(), size: NaN }], [{ ...valid(), size: 0 }],
      [{ ...valid(), text: " " }], [{ ...valid(), format: "exe" }], [{ ...valid(), id: "" }], [{ ...valid(), structure: "" }],
      [valid("a", "a".repeat(60001))], [valid("a", "a".repeat(60000)), valid("b", "b".repeat(60000)), valid("c")]]) {
      expect(() => validatePromptDocuments(value)).toThrow();
    }
    expect(validatePromptDocuments([valid("a", "a".repeat(60000)), valid("b", "b".repeat(60000))])).toHaveLength(2);
  });
});

let server: ViteDevServer;
let browser: Browser;
let page: Page;
let temp: string;
let origin: string;
const blocked: string[] = [];
const productionAssets = new Map<string, { body: string | Uint8Array; type: string }>();
const harness = `
import * as parser from '/client/src/lib/prompt-documents.ts';
import { usePromptDocuments } from '/client/src/hooks/usePromptDocuments.ts';
import { PromptDocumentAttachments } from '/client/src/components/ui/prompt-document-attachments.tsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
window.React = React;
window.parser = parser;
window.importModule = url => import(/* @vite-ignore */ url);
let root;
function Probe() { window.docsHook = usePromptDocuments(); return React.createElement(PromptDocumentAttachments, {entries: window.docsHook.entries, onRemove: window.docsHook.remove}); }
window.mountProbe = () => { if (root) flushSync(() => root.unmount()); root = createRoot(document.getElementById('app')); flushSync(() => root.render(React.createElement(Probe))); };
window.unmountProbe = () => { flushSync(() => root.unmount()); root = null; };
window.mountProbe();
`;

beforeAll(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "prompt-documents-test-"));
  const aliases: Record<string, string> = { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared") };
  if (process.env.PROMPT_DOCUMENT_PDFJS_DIR) aliases["pdfjs-dist"] = process.env.PROMPT_DOCUMENT_PDFJS_DIR;
  server = await createServer({
    configFile: false, root, cacheDir: path.join(temp, "cache"), resolve: { alias: aliases },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, temp, ...(process.env.PROMPT_DOCUMENT_PDFJS_DIR ? [process.env.PROMPT_DOCUMENT_PDFJS_DIR] : [])] } },
    plugins: [{ name: "真实文档测试页面", configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const asset = productionAssets.get((req.url ?? "").split("?")[0]);
        if (asset) { res.setHeader("Content-Type", asset.type); res.end(asset.body); return; }
        if (req.url === "/__prompt_documents") { res.setHeader("Content-Type", "text/html"); res.end('<div id="app"></div><script type="module" src="/__prompt_documents_harness.ts"></script>'); }
        else next();
      });
    }, resolveId(id) { if (id === "/__prompt_documents_harness.ts") return id; }, load(id) { if (id === "/__prompt_documents_harness.ts") return harness; } }],
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on("pageerror", error => console.error("测试页面异常", error.message));
  page.on("console", message => { if (message.type() === "error") console.error("测试页面错误", message.text()); });
  await page.route("**/*", route => {
    if (route.request().url().startsWith(origin + "/")) return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${origin}/__prompt_documents`);
  await page.waitForFunction(() => Boolean((window as any).parser && (window as any).docsHook));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});

async function parse(name: string, bytes: Uint8Array | string, mime = "") {
  const data = typeof bytes === "string" ? Array.from(new TextEncoder().encode(bytes)) : Array.from(bytes);
  return page.evaluate(async ({ name, data, mime }) => {
    try { return { document: await (window as any).parser.parsePromptDocument(new File([new Uint8Array(data)], name, { type: mime })) }; }
    catch (error) { return { error: (error as Error).message }; }
  }, { name, data, mime });
}

describe("真实 Chromium 解析（无 DOMParser mock）", () => {
  it("UTF-8 文本格式及空 MIME 扩展名，不渲染 HTML", async () => {
    for (const name of ["a.TXT", "a.md", "a.csv", "a.tsv", "a.json"]) {
      const text = name.endsWith("json") ? '{"中文":"值"}' : "中文\n<script>window.unexpected=true</script>\t=1+1";
      expect((await parse(name, text)).document?.text).toBe(text);
    }
    expect(await page.evaluate(() => (window as any).unexpected)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).parser.isPromptDocumentFile({ name: "file.docx", type: "" }))).toBe(true);
    expect(await page.evaluate(() => (window as any).parser.isPromptDocumentFile({ name: "file.bin", type: "" }))).toBe(false);
  });
  it("拒绝超限、空、乱码、非法 JSON、伪 PDF 和不支持格式", async () => {
    for (const [name, data] of [["a.txt", ""], ["a.txt", "a".repeat(60001)], ["a.json", "{"], ["a.txt", new Uint8Array([255])], ["a.txt", "a\0b"], ["a.pdf", "bad"], ["a.exe", "text"]] as const) {
      expect((await parse(name, data)).error).toBeTruthy();
    }
    expect(await page.evaluate(async () => {
      try { await (window as any).parser.parsePromptDocument(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.txt")); } catch (error) { return (error as Error).message; }
    })).toContain("10 MiB");
    expect((await parse("exact.txt", "x".repeat(60000))).document?.text).toHaveLength(60000);
  });
  it("DOCX 正文、表格、替换 namespace 前缀均由 DOMParser 提取", async () => {
    const bytes = await zip({ "word/document.xml": docx().replaceAll("w:", "z:").replace("xmlns:w=", "xmlns:z=") });
    const result = await parse("中文.docx", bytes);
    expect(result.error).toBeUndefined();
    expect(result.document?.text).toBe("真实文字 & 表格\n单元格");
    expect(result.document?.structure).toContain("不解析");
  });
  it("PPTX 按 presentation 关系顺序而不是文件名排序", async () => {
    const bytes = await zip({
      "ppt/presentation.xml": `<p:presentation xmlns:p="${presentation}" xmlns:r="${rel}"><p:sldIdLst><p:sldId id="1" r:id="second"/><p:sldId id="2" r:id="first"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": relationships('<Relationship Id="second" Target="slides/slide2.xml"/><Relationship Id="first" Target="slides/slide1.xml"/>'),
      "ppt/slides/slide1.xml": `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}"><a:p><a:r><a:t>后面</a:t></a:r></a:p></p:sld>`,
      "ppt/slides/slide2.xml": `<p:sld xmlns:p="${presentation}" xmlns:a="${drawing}"><a:p><a:r><a:t>前面</a:t></a:r></a:p></p:sld>`,
    });
    const result = await parse("slides.pptx", bytes);
    expect(result.document?.text).toBe("[幻灯片 1]\n前面\n\n[幻灯片 2]\n后面");
  });
  it("XLSX 保留表名、稀疏坐标、共享/内联字符串和公式缓存", async () => {
    const bytes = await zip({
      "xl/workbook.xml": `<workbook xmlns="${sheet}" xmlns:r="${rel}"><sheets><sheet name="数据" r:id="s1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": relationships('<Relationship Id="s1" Target="worksheets/sheet1.xml"/>'),
      "xl/sharedStrings.xml": `<sst xmlns="${sheet}"><si><r><t>共享</t></r><r><t>字符串</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet xmlns="${sheet}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>内联</t></is></c><c r="D1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`,
    });
    expect((await parse("data.xlsx", bytes)).document?.text).toBe("[工作表 数据]\nA1=共享字符串\tC1=内联\tD1=2");
  });
  it("拒绝 DTD/实体、损坏 XML、宏、脚本、外部关系及缺失主文件", async () => {
    const cases: Record<string, string>[] = [
      { "word/document.xml": '<!DOCTYPE x [<!ENTITY x "body">]>' + docx("&x;") },
      { "word/document.xml": "<unclosed>" },
      { "word/document.xml": docx(), "word/vbaProject.bin": "macro" },
      { "word/document.xml": docx(), "custom/code.js": "window.unexpected=true" },
      { "word/document.xml": docx(), "word/_rels/document.xml.rels": relationships('<Relationship Id="evil" Target="https://external.invalid/file" TargetMode="External"/>') },
      { "word/document.xml": docx('<script xmlns="http://www.w3.org/1999/xhtml">bad</script>') },
      { "word/other.xml": docx() },
      { "word/document.xml": docx(), "[Content_Types].xml": '<Types><Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>' },
    ];
    for (const files of cases) expect((await parse("bad.docx", await zip(files))).error).toBeTruthy();
    expect(blocked).toEqual([]);
  });
  it("ZIP 条目数、路径及压缩比有界，包括伪造中央目录大小的实际流输出", async () => {
    const many: Record<string, string> = { "word/document.xml": docx() };
    for (let i = 0; i < 1024; i++) many[`empty${i}`] = "";
    expect((await parse("many.docx", await zip(many))).error).toMatch(/条目/);
    expect((await parse("path.docx", await zip({ "../word/document.xml": docx() }))).error).toMatch(/路径/);
    const bomb = await zip({ "word/document.xml": docx(), "word/media/large.bin": "x".repeat(2 * 1024 * 1024) }, "DEFLATE");
    expect((await parse("ratio.docx", bomb)).error).toMatch(/压缩比/);
    const forged = bomb.slice();
    const view = new DataView(forged.buffer);
    for (let i = 0; i < forged.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        const name = new TextDecoder().decode(forged.subarray(i + 46, i + 46 + view.getUint16(i + 28, true)));
        if (name === "word/media/large.bin") view.setUint32(i + 24, 1, true);
      }
    }
    expect((await parse("forged.docx", forged)).error).toMatch(/实际解压输出/);
    expect((await parse("large.docx", await zip({ "word/document.xml": docx("x".repeat(60001)) }))).error).toMatch(/60000/);
  });
  it("PDF 真实 worker 提取文字，扫描/空白、损坏、需密码和空密码加密均拒绝", async () => {
    const result = await parse("text.pdf", pdfFixture("Real PDF text"));
    expect(result.error).toBeUndefined();
    expect(result.document?.text).toContain("Real PDF text");
    expect(result.document?.structure).toContain("不含 OCR");
    expect((await parse("scan.pdf", pdfFixture(""))).error).toMatch(/扫描页或空白页/);
    const scanned = await page.evaluate(async () => {
      const { buildImagePdf } = await (window as any).importModule("/client/src/lib/canvas-print-pdf.ts");
      const canvas = document.createElement("canvas");
      canvas.width = 200; canvas.height = 50;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white"; context.fillRect(0, 0, 200, 50);
      context.fillStyle = "black"; context.fillText("Image only scanned text", 10, 20);
      const jpeg = new Uint8Array(await (await fetch(canvas.toDataURL("image/jpeg"))).arrayBuffer());
      const bytes = buildImagePdf([{ jpeg, width: 200, height: 50 }], 612, 792);
      try { await (window as any).parser.parsePromptDocument(new File([bytes], "scanned.pdf")); }
      catch (error) { return (error as Error).message; }
    });
    expect(scanned).toMatch(/扫描页或空白页/);
    expect((await parse("broken.pdf", "%PDF-1.7\nbroken")).error).toBeTruthy();
    expect((await parse("locked.pdf", pdfFixture("Secret", "password"))).error).toMatch(/加密 PDF/);
    expect((await parse("empty-password.pdf", pdfFixture("Secret", ""))).error).toMatch(/加密 PDF/);
  }, 45_000);
  it("hook 同步 pending 阻止 Enter，删除、clear、setDocuments、卸载后不复活", async () => {
    const result = await page.evaluate(async () => {
      const w = window as any;
      const outputs: any[] = [];
      for (const action of ["remove", "clear", "set", "unmount"]) {
        w.mountProbe();
        const hook = w.docsHook;
        let release!: (buffer: ArrayBuffer) => void;
        const file = new File(["正文"], "pending.txt");
        file.arrayBuffer = () => new Promise(resolve => { release = resolve; });
        const promise = hook.addFiles([file]);
        let pendingError = "";
        try { hook.assertReady(); } catch (error) { pendingError = (error as Error).message; }
        if (action === "remove") { await new Promise(resolve => setTimeout(resolve, 0)); hook.remove(w.docsHook.entries[0].id); }
        if (action === "clear") hook.clear();
        if (action === "set") hook.setDocuments([{id: "replacement",name: "saved.txt",format: "txt",size: 1,text: "恢复",structure: "纯文本"}]);
        if (action === "unmount") w.unmountProbe();
        release(new TextEncoder().encode("正文").buffer);
        await promise;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (action === "unmount") w.mountProbe();
        outputs.push({ action, pendingError, ids: w.docsHook.assertReady().map((doc: any) => doc.id) });
      }
      return outputs;
    });
    expect(result.map(item => item.pendingError)).toEqual(Array(4).fill("文档仍在解析，请等待完成后再发送"));
    expect(result.map(item => item.ids)).toEqual([[], [], ["replacement"], []]);
  });
  it("hook 保留失败和超量附件，全批预算计入既有/并发附件", async () => {
    const result = await page.evaluate(async () => {
      const w = window as any;
      w.mountProbe();
      let promise = w.docsHook.addFiles([new File(["{"], "bad.json")]);
      await promise; await new Promise(resolve => setTimeout(resolve, 0));
      const failed = w.docsHook.entries.map((entry: any) => ({ status: entry.status, error: entry.error }));
      let error = "";
      try { w.docsHook.assertReady(); } catch (err) { error = (err as Error).message; }
      w.docsHook.clear();
      const first = w.docsHook.addFiles([new File(["a".repeat(60000)], "a.txt")]);
      const second = w.docsHook.addFiles([new File(["b".repeat(60000)], "b.txt"), new File(["c"], "c.txt")]);
      await Promise.all([first, second]); await new Promise(resolve => setTimeout(resolve, 0));
      const budget = w.docsHook.entries.map((entry: any) => ({ status: entry.status, error: entry.error }));
      const docs = w.docsHook.documents;
      w.docsHook.clear();
      await w.docsHook.addFiles(Array.from({length: 5}, (_, i) => new File(["x"], i + ".txt")));
      await new Promise(resolve => setTimeout(resolve, 0));
      const count = w.docsHook.entries.map((entry: any) => entry.status);
      w.docsHook.clear();
      w.docsHook.setDocuments(docs);
      await w.docsHook.addFiles([new File(["d"], "d.txt")]);
      await new Promise(resolve => setTimeout(resolve, 0));
      const existing = w.docsHook.entries.map((entry: any) => entry.status);
      return { failed, error, budget, count, existing };
    });
    expect(result.failed[0].status).toBe("error");
    expect(result.error).toContain("bad.json");
    expect(result.budget.map((entry: { status: string }) => entry.status)).toEqual(["ready", "ready", "error"]);
    expect(result.budget[2].error).toContain("120000");
    expect(result.count).toEqual(["ready", "ready", "ready", "ready", "error"]);
    expect(result.existing).toEqual(["ready", "ready", "error"]);
    expect(await page.locator('[aria-label="文档附件"]').count()).toBe(1);
  });
  it("Vite7 真正生产打包 PDF worker，不使用 CDN 或本机漂移依赖", async () => {
    const result = await build({
      configFile: false, root, cacheDir: path.join(temp, "build-cache"), logLevel: "error",
      resolve: { alias: { "@shared": path.join(root, "shared"), ...(process.env.PROMPT_DOCUMENT_PDFJS_DIR ? { "pdfjs-dist": process.env.PROMPT_DOCUMENT_PDFJS_DIR } : {}) } },
      build: { write: false, minify: false, outDir: path.join(temp, "dist"), rollupOptions: { input: path.join(root, "client/src/lib/prompt-documents.ts"), preserveEntrySignatures: "strict" } },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as any[];
    const files = outputs.flatMap(output => output.output);
    expect(files.some(file => /pdf\.worker.*\.js$/.test(file.fileName))).toBe(true);
    expect(files.some(file => file.type === "chunk" && file.code.includes("isEvalSupported: false"))).toBe(true);
    for (const file of files) productionAssets.set(`/${file.fileName}`, { body: file.type === "chunk" ? file.code : file.source, type: "text/javascript" });
    const entry = files.find(file => file.type === "chunk" && file.isEntry);
    const production = await page.evaluate(async ({ entry, bytes }) => {
      const parser = await (window as any).importModule(entry);
      return parser.parsePromptDocument(new File([new Uint8Array(bytes)], "production.pdf"));
    }, { entry: `/${entry.fileName}`, bytes: Array.from(pdfFixture("Production worker text")) });
    expect(production.text).toContain("Production worker text");
    expect(blocked).toEqual([]);
  }, 60_000);
});
