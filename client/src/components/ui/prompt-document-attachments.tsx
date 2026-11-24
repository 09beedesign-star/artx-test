import { FileText, Loader2, X } from "lucide-react";
import type { PromptDocumentEntry } from "@/hooks/usePromptDocuments";

export function PromptDocumentAttachments({ entries, onRemove }: {
  entries: PromptDocumentEntry[];
  onRemove: (id: string) => void;
}) {
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="文档附件">
      {entries.map(entry => (
        <div key={entry.id} className="flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600" title={entry.error ?? entry.document?.structure}>
          {entry.status === "parsing" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="max-w-40 truncate">{entry.name}</span>
          <span role="status" className={entry.status === "error" ? "max-w-64 truncate text-red-600" : "shrink-0 text-slate-400"}>
            {entry.status === "parsing" ? "解析中" : entry.status === "error" ? entry.error ?? "解析失败" : "已就绪"}
          </span>
          <button type="button" className="shrink-0 rounded p-0.5 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400" aria-label={`移除附件 ${entry.name}`} onClick={() => onRemove(entry.id)}>
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
