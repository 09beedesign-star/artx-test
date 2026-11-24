import JSZip from "jszip";
import {
  DOCUMENT_EXTENSIONS, MAX_PROMPT_DOCUMENT_BYTES, MAX_PROMPT_DOCUMENT_TEXT,
  validatePromptDocuments, type PromptDocument,
} from "@shared/prompt-documents";

const formats = new Set(DOCUMENT_EXTENSIONS.split(",").map(value => value.slice(1)));
const ZIP_ENTRIES = 1024;
const ZIP_ENTRY_BYTES = 8 * 1024 * 1024;
const ZIP_TOTAL_BYTES = 32 * 1024 * 1024;
const ZIP_RATIO = 200;
const NS = {
  word: ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"],
  drawing: ["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"],
  sheet: ["http://schemas.openxmlformats.org/spreadsheetml/2006/main", "http://purl.oclc.org/ooxml/spreadsheetml/main"],
  presentation: ["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"],
};

function extension(name: string) { return name.split(".").pop()?.toLowerCase() ?? ""; }

/**
 * 送进提示词的文档正文总预算。
 * 文档解析本身允许单文件 60000 字符，但整段塞进 AI 请求会既贵又容易撑爆
 * 出图接口的提示词上限；这里统一收口，超出部分按文档顺序截断并明确标注。
 */
export const MAX_INJECTED_DOCUMENT_CHARS = 24_000;

/** 把已解析的文档拼成一段带边界的「参考材料」，随提示词一起交给大模型。 */
export function formatDocumentsForPrompt(documents: PromptDocument[]): string {
  if (!documents.length) return "";
  let remaining = MAX_INJECTED_DOCUMENT_CHARS;
  const blocks: string[] = [];
  for (const document of documents) {
    if (remaining <= 0) break;
    const text = document.text.slice(0, remaining);
    remaining -= text.length;
    blocks.push([
      `【参考文档 ${blocks.length + 1}：${document.name}】`,
      document.structure,
      "----- 正文开始 -----",
      text,
      text.length < document.text.length ? "（内容超出上限，此处已截断）" : "",
      "----- 正文结束 -----",
    ].filter(Boolean).join("\n"));
  }
  return [
    "",
    "===== 以下为我上传的参考文档，请先阅读理解，再结合上面的需求完成任务 =====",
    ...blocks,
    "===== 参考文档结束 =====",
    "",
  ].join("\n");
}

export function isPromptDocumentFile(file: Pick<File, "name" | "type">): boolean {
  // 空 MIME 仍按扩展名判定，不把未知文件当成图片。
  return formats.has(extension(file.name));
}

function bounded(text: string): string {
  if (text.length > MAX_PROMPT_DOCUMENT_TEXT) throw new Error("单个文档正文不能超过 60000 字符，不会截断");
  return text;
}

function xml(bytes: Uint8Array): Document {
  let source: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) source = new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) source = new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  else source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) throw new Error("拒绝含 DTD 或实体声明的 XML");
  const result = new DOMParser().parseFromString(source, "application/xml");
  if (result.doctype || result.getElementsByTagName("parsererror").length ||
      result.getElementsByTagNameNS("http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror").length) {
    throw new Error("文档 XML 损坏或不受支持");
  }
  for (const element of Array.from(result.getElementsByTagName("*"))) {
    if (/^(?:script|object|iframe)$/i.test(element.localName)) throw new Error("拒绝含脚本或活动内容的 XML");
  }
  return result;
}

function elements(root: Document | Element, local: string, namespaces: string[]): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", local)).filter(el => namespaces.includes(el.namespaceURI ?? ""));
}

function textRuns(root: Element, namespaces: string[]): string {
  let result = "";
  const visit = (node: Element) => {
    if (namespaces.includes(node.namespaceURI ?? "")) {
      if (node.localName === "t") { result += node.textContent ?? ""; return; }
      if (node.localName === "tab") result += "\t";
      if (node.localName === "br" || node.localName === "cr") result += "\n";
    }
    for (const child of Array.from(node.children)) visit(child);
  };
  visit(root);
  return bounded(result);
}

// 在 JSZip 读取前检查真实中央目录，避免条目覆盖、ZIP64、路径归一化及虚报大小绕过预算。
function zipDirectory(bytes: Uint8Array): Map<string, { compressed: number; size: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < 0 || end < bytes.length - 65557) throw new Error("ZIP 中央目录无效");
  const count = view.getUint16(end + 10, true);
  const start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
      view.getUint16(end + 8, true) !== count || count > ZIP_ENTRIES || !count ||
      start + view.getUint32(end + 12, true) !== end) throw new Error("ZIP 条目过多或不支持分卷/ZIP64");
  const entries = new Map<string, { compressed: number; size: number }>();
  let offset = start;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP 条目损坏");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) throw new Error("ZIP 条目损坏");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || /[\\\u0000-\u001f]/.test(name) || name.startsWith("/") || name.includes(":") ||
        name.split("/").some(part => part === "." || part === "..") || entries.has(name.toLowerCase())) throw new Error("ZIP 路径不安全或条目重复");
    if ((flags & 1) || ![0, 8].includes(method)) throw new Error("不支持加密或特殊压缩 ZIP");
    if (/vba|macro|activex|embeddings|(?:^|\/)scripts?(?:\/|$)|\.(?:js|vbs|exe|dll|html?)$/i.test(name)) throw new Error("拒绝含宏、脚本或嵌入活动对象的文档");
    total += size;
    if (size > ZIP_ENTRY_BYTES || total > ZIP_TOTAL_BYTES || size > Math.max(1, compressed) * ZIP_RATIO) throw new Error("ZIP 解压大小或压缩比超过安全限制");
    entries.set(name.toLowerCase(), { compressed, size });
    offset = next;
  }
  if (offset !== end) throw new Error("ZIP 中央目录不完整");
  return entries;
}

async function readPackage(bytes: Uint8Array): Promise<Map<string, Document>> {
  const directory = zipDirectory(bytes);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const docs = new Map<string, Document>();
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    const metadata = directory.get(entry.name.toLowerCase());
    if (!metadata || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) throw new Error("ZIP 路径不一致");
    const isXml = /(?:\.xml|\.rels)$/i.test(entry.name) || entry.name === "[Content_Types].xml";
    // internalStream 是 JSZip 的流式 API，但 3.10.1 的 JSZipObject 类型遗漏此方法。
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream("uint8array");
    const chunks: Uint8Array[] = [];
    let size = 0;
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      stream.on("data", chunk => {
        if (failed) return;
        size += chunk.byteLength;
        total += chunk.byteLength;
        if (size > ZIP_ENTRY_BYTES || total > ZIP_TOTAL_BYTES || size > Math.max(1, metadata.compressed) * ZIP_RATIO) {
          failed = true;
          stream.pause();
          chunks.length = 0;
          reject(new Error("ZIP 实际解压输出或压缩比超过安全限制"));
          return;
        }
        if (isXml) chunks.push(chunk);
      }).on("error", reject).on("end", resolve).resume();
    });
    if (size !== metadata.size) throw new Error("ZIP 实际解压大小与目录不一致");
    if (isXml) {
      const output = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      const doc = xml(output);
      for (const el of Array.from(doc.getElementsByTagName("*"))) {
        if (/macroenabled|vbaproject|activex/i.test(el.getAttribute("ContentType") ?? "")) throw new Error("拒绝含宏或活动内容的文档");
        if (el.localName === "Relationship" && (el.getAttribute("TargetMode")?.toLowerCase() === "external" || /^(?:[a-z]+:|\/\/)/i.test(el.getAttribute("Target") ?? ""))) {
          throw new Error("不支持含外部关系的文档；不会访问外链");
        }
      }
      docs.set(entry.name, doc);
    }
  }
  if (!docs.has("[Content_Types].xml")) throw new Error("不是有效的 OOXML 文档");
  return docs;
}

function required(docs: Map<string, Document>, name: string): Document {
  const doc = docs.get(name);
  if (!doc) throw new Error(`文档缺少必要部分：${name}`);
  return doc;
}

function related(docs: Map<string, Document>, source: string, id: string): string {
  const slash = source.lastIndexOf("/");
  const rels = required(docs, `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`);
  const relationship = Array.from(rels.getElementsByTagNameNS("*", "Relationship")).find(el => el.getAttribute("Id") === id);
  const target = relationship?.getAttribute("Target");
  if (!target || /[\\?#:]/.test(target)) throw new Error("文档内部关系无效");
  const parts = target.startsWith("/") ? [] : source.slice(0, slash).split("/");
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("文档关系越界"); parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

function relationshipId(el: Element): string {
  return el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
    el.getAttributeNS("http://purl.oclc.org/ooxml/officeDocument/relationships", "id") ?? "";
}

async function parseOffice(bytes: Uint8Array, format: string): Promise<{ text: string; structure: string }> {
  const docs = await readPackage(bytes);
  /*
   * ⚠️ 不能只按扩展名分发：WPS 保存的 .wps/.et/.dps 以及部分改过扩展名的
   * 文件，内容其实就是标准 OOXML。只认扩展名会把它们推进纯文本分支，
   * 得到「不支持二进制文本」这种看不懂的报错。以包内实际部件为准。
   */
  const kind = ["docx", "pptx", "xlsx"].includes(format) ? format
    : docs.has("word/document.xml") ? "docx"
    : docs.has("ppt/presentation.xml") ? "pptx"
    : docs.has("xl/workbook.xml") ? "xlsx"
    : "";
  if (!kind) throw new Error("不是可读取的 Word / Excel / PowerPoint 文档");
  if (kind === "docx") {
    const doc = required(docs, "word/document.xml");
    const paragraphs = elements(doc, "p", NS.word);
    return {
      text: bounded(paragraphs.map(p => textRuns(p, NS.word)).join("\n")),
      structure: `DOCX：${paragraphs.length} 个正文段落（含表格内段落），按 XML 顺序；不解析页眉页脚、批注、内嵌图与视觉版式。`,
    };
  }
  if (kind === "pptx") {
    const presentation = required(docs, "ppt/presentation.xml");
    const slides = elements(presentation, "sldId", NS.presentation);
    let text = "";
    slides.forEach((slide, index) => {
      const path = related(docs, "ppt/presentation.xml", relationshipId(slide));
      const paragraphs = elements(required(docs, path), "p", NS.drawing);
      text = bounded(`${text}${text ? "\n\n" : ""}[幻灯片 ${index + 1}]\n${paragraphs.map(p => textRuns(p, NS.drawing)).join("\n")}`);
    });
    return { text, structure: `PPTX：${slides.length} 张幻灯片的文字段落，按演示顺序；不解析备注、图表数据、内嵌图或视觉版式。` };
  }
  const workbook = required(docs, "xl/workbook.xml");
  const strings = docs.get("xl/sharedStrings.xml");
  const shared = strings ? elements(strings, "si", NS.sheet).map(si => textRuns(si, NS.sheet)) : [];
  const sheets = elements(workbook, "sheet", NS.sheet);
  let text = "";
  for (const sheet of sheets) {
    const path = related(docs, "xl/workbook.xml", relationshipId(sheet));
    const rows = elements(required(docs, path), "row", NS.sheet);
    text = bounded(`${text}${text ? "\n\n" : ""}[工作表 ${sheet.getAttribute("name") ?? ""}]`);
    for (const row of rows) {
      const cells = elements(row, "c", NS.sheet).map(cell => {
        const value = elements(cell, "v", NS.sheet)[0]?.textContent ?? "";
        const type = cell.getAttribute("t");
        let content = value;
        if (type === "s") {
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || shared[Number(value)] === undefined) throw new Error("工作表共享字符串索引无效");
          content = shared[Number(value)];
        } else if (type === "inlineStr") content = textRuns(cell, NS.sheet);
        // 仅使用公式的缓存值，绝不执行公式或访问外部数据。
        return `${cell.getAttribute("r") ?? "?"}=${content}`;
      });
      text = bounded(`${text}\n${cells.join("\t")}`);
    }
  }
  return { text, structure: `XLSX：${sheets.length} 张工作表，保留单元格坐标、共享/内联字符串及公式缓存值；不计算公式，不解释样式、图表、内嵌图或视觉版式。` };
}

async function parsePdf(bytes: Uint8Array): Promise<{ text: string; structure: string }> {
  const pdfjs = await import("pdfjs-dist");
  // Vite 静态 worker URL 同时支持开发与生产打包，每个任务独占 worker。
  const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  const worker = pdfjs.PDFWorker.fromPort({ port });
  const task = pdfjs.getDocument({
    data: bytes, worker, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, useWorkerFetch: false, isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false, enableXfa: false, stopAtErrors: true,
  });
  let encrypted = false;
  task.onPassword = () => { encrypted = true; void task.destroy(); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        const metadata = await pdf.getMetadata();
        if ((metadata.info as { EncryptFilterName?: string | null }).EncryptFilterName || await pdf.getPermissions() !== null) {
          encrypted = true;
          throw new Error("不支持加密 PDF，请先解密后再添加");
        }
        if (pdf.numPages > 500) throw new Error("PDF 页数超过 500 页安全限制");
        let text = "";
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number);
          const stream = page.streamTextContent().getReader();
          let pageText = "";
          try {
            for (;;) {
              const { value, done } = await stream.read();
              if (done) break;
              for (const item of value.items) {
                if (!("str" in item)) continue;
                pageText = bounded(pageText + item.str + (item.hasEOL ? "\n" : " "));
                bounded(text + pageText);
              }
            }
          } finally { await stream.cancel(); page.cleanup(); }
          if (!pageText.trim()) throw new Error(`PDF 第 ${number} 页无可提取文字（扫描页或空白页）；不支持 OCR，请改用文字版 PDF`);
          text = bounded(`${text}${text ? "\n\n" : ""}[第 ${number} 页]\n${pageText}`);
        }
        return { text, structure: `PDF：${pdf.numPages} 页可提取文字，按文字流顺序；不执行脚本，不含 OCR、内嵌图理解、表格重建或视觉版式理解。` };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PDF 解析超时，请使用更小的文字版文档")), 30_000); }),
    ]);
  } catch (error) {
    if (encrypted || (error instanceof Error && error.name === "PasswordException")) throw new Error("不支持加密 PDF，请先解密后再添加");
    throw error;
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
    worker.destroy();
    port.terminate();
  }
}

export async function parsePromptDocument(file: File): Promise<PromptDocument> {
  if (!isPromptDocumentFile(file)) throw new Error("不支持此文档格式");
  if (!file.size || file.size > MAX_PROMPT_DOCUMENT_BYTES) throw new Error("文档必须非空且单文件不能超过 10 MiB");
  const format = extension(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > MAX_PROMPT_DOCUMENT_BYTES) throw new Error("文档读取大小不一致或超限");
  let parsed: { text: string; structure: string };
  const isPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    [3, 5, 7].includes(bytes[2]) && [4, 6, 8].includes(bytes[3]);
  // OLE2 复合文档（旧版 .doc/.xls、部分 WPS 二进制文件）的魔数。
  const isOle = bytes.length >= 8 &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
  if (isPdf) parsed = await parsePdf(bytes);
  else if (isZip) parsed = await parseOffice(bytes, format);
  else if (isOle) {
    throw new Error("旧版 .doc / .xls 等二进制文档无法在浏览器内提取文字，请用 WPS 或 Office 另存为 .docx / .xlsx / PDF 后再上传");
  } else {
    if (!["txt", "md", "csv", "tsv", "json"].includes(format)) {
      throw new Error("文件内容与扩展名不匹配，或该格式无法读取文字；请另存为 .docx / .xlsx / PDF 后再上传");
    }
    const text = bounded(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (text.includes("\0")) throw new Error("不支持二进制文本，请使用 UTF-8 文档");
    if (format === "json") { try { JSON.parse(text); } catch { throw new Error("JSON 文档语法无效"); } }
    parsed = { text, structure: `${format.toUpperCase()}：UTF-8 原始文本，保留换行与分隔符；不执行 HTML、Markdown、脚本或公式，不含图片及视觉版式理解。` };
  }
  return validatePromptDocuments([{ id: crypto.randomUUID(), name: file.name, format, size: file.size, ...parsed }])[0];
}
