export type PromptDocument = {
  id: string;
  name: string;
  format: string;
  size: number;
  text: string;
  structure: string;
};

/** 纯扩展名白名单：解析分流与后端校验的唯一依据（不含 MIME）。 */
export const DOCUMENT_EXTENSIONS = ".txt,.md,.csv,.tsv,.json,.pdf,.doc,.docx,.wps,.xls,.xlsx,.et,.pptx,.dps";

/**
 * 文件选择器的 accept。
 * ⚠️ iPadOS / iOS「文件」App 与 WPS Office 位置按 UTI 过滤：只写扩展名时，
 * 从这些位置来的 Word / PDF / Excel 会被系统判成灰色不可选。同一份白名单
 * 同时给出扩展名和 MIME，才能让桌面和 iPad 都真的选得中。
 */
export const DOCUMENT_ACCEPT = [
  DOCUMENT_EXTENSIONS,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
].join(",");
export const MAX_PROMPT_DOCUMENTS = 4;
export const MAX_PROMPT_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PROMPT_DOCUMENT_TEXT = 60_000;
export const MAX_PROMPT_DOCUMENT_TOTAL_TEXT = 120_000;
const formats = new Set(DOCUMENT_EXTENSIONS.split(",").map(value => value.slice(1)));

export function validatePromptDocuments(value: unknown): PromptDocument[] {
  if (!Array.isArray(value)) throw new Error("文档附件必须是数组");
  if (value.length > MAX_PROMPT_DOCUMENTS) throw new Error("最多添加 4 个文档附件");
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) throw new Error("文档附件数组不能包含空项");
  }
  const ids = new Set<string>();
  let total = 0;
  return value.map((item): PromptDocument => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("文档附件数据不合法");
    const doc = item as Record<string, unknown>;
    if (typeof doc.id !== "string" || !doc.id.trim() || doc.id.length > 200 || ids.has(doc.id) ||
        typeof doc.name !== "string" || !doc.name.trim() || doc.name.length > 255 || /[\u0000-\u001f]/.test(doc.name) ||
        typeof doc.format !== "string" || !formats.has(doc.format) ||
        typeof doc.size !== "number" || !Number.isSafeInteger(doc.size) || doc.size <= 0 || doc.size > MAX_PROMPT_DOCUMENT_BYTES ||
        typeof doc.text !== "string" || !doc.text.trim() || doc.text.length > MAX_PROMPT_DOCUMENT_TEXT ||
        typeof doc.structure !== "string" || !doc.structure.trim() || doc.structure.length > 4000) {
      throw new Error("文档附件不合法：单文件需为支持格式、≤10 MiB 且正文为 1–60000 字符，ID 不得重复");
    }
    total += doc.text.length;
    if (total > MAX_PROMPT_DOCUMENT_TOTAL_TEXT) throw new Error("全部文档正文合计不能超过 120000 字符");
    ids.add(doc.id);
    return { id: doc.id, name: doc.name, format: doc.format, size: doc.size, text: doc.text, structure: doc.structure };
  });
}
