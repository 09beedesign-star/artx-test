import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PROMPT_DOCUMENTS, validatePromptDocuments, type PromptDocument } from "@shared/prompt-documents";
import { parsePromptDocument } from "@/lib/prompt-documents";

export type PromptDocumentEntry = {
  id: string;
  name: string;
  status: "parsing" | "ready" | "error";
  error?: string;
  document?: PromptDocument;
};

export function usePromptDocuments() {
  const [entries, setEntries] = useState<PromptDocumentEntry[]>([]);
  const current = useRef<PromptDocumentEntry[]>([]);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);

  const publish = useCallback((next: PromptDocumentEntry[]) => {
    current.current = next;
    if (mounted.current) setEntries(next);
  }, []);

  const addFiles = useCallback(async (files: File[]): Promise<void> => {
    if (!mounted.current || !files.length) return;
    const epoch = generation.current;
    const count = current.current.length;
    const pending: PromptDocumentEntry[] = files.map((file, index) => ({
      id: crypto.randomUUID(), name: file.name,
      status: count + index >= MAX_PROMPT_DOCUMENTS ? "error" : "parsing",
      ...(count + index >= MAX_PROMPT_DOCUMENTS ? { error: "最多添加 4 个文档，请移除多余附件" } : {}),
    }));
    // 必须先更新 ref，保证同一事件循环内 Enter / assertReady 看得到 pending。
    publish([...current.current, ...pending]);
    await Promise.all(pending.map(async (entry, index) => {
      if (entry.status === "error") return;
      const active = () => mounted.current && generation.current === epoch && current.current.some(item => item.id === entry.id);
      try {
        const parsed = await parsePromptDocument(files[index]);
        if (!active()) return;
        const document = { ...parsed, id: entry.id };
        validatePromptDocuments([...current.current.flatMap(item => item.status === "ready" && item.document ? [item.document] : []), document]);
        publish(current.current.map(item => item.id === entry.id ? { ...entry, status: "ready", document } : item));
      } catch (error) {
        if (!active()) return;
        publish(current.current.map(item => item.id === entry.id ? {
          ...entry, status: "error", error: error instanceof Error ? error.message : "文档解析失败，请移除后重试",
        } : item));
      }
    }));
  }, [publish]);

  const remove = useCallback((id: string) => {
    publish(current.current.filter(entry => entry.id !== id));
  }, [publish]);
  const clear = useCallback(() => {
    generation.current++;
    publish([]);
  }, [publish]);
  const setDocuments = useCallback((docs: PromptDocument[]) => {
    const validated = validatePromptDocuments(docs);
    generation.current++;
    publish(validated.map(document => ({ id: document.id, name: document.name, status: "ready", document })));
  }, [publish]);
  const assertReady = useCallback((): PromptDocument[] => {
    if (current.current.some(entry => entry.status === "parsing")) throw new Error("文档仍在解析，请等待完成后再发送");
    const failed = current.current.find(entry => entry.status === "error");
    if (failed) throw new Error(`附件「${failed.name}」未就绪：${failed.error ?? "解析失败"}；请移除或重试`);
    return validatePromptDocuments(current.current.map(entry => entry.document));
  }, []);

  return {
    documents: entries.flatMap(entry => entry.status === "ready" && entry.document ? [entry.document] : []),
    entries,
    busy: entries.some(entry => entry.status === "parsing"),
    hasErrors: entries.some(entry => entry.status === "error"),
    addFiles, remove, clear, setDocuments, assertReady,
  };
}
