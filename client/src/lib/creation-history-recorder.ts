/**
 * 创作历史全局记录器：监听画布的 image-generator-submit(completed) 事件，
 * 写本地 IndexedDB，已授权本地文件夹时顺手把图写进去。
 *
 * 🔒 纯本地：这里不调用任何 /api 写接口（除拉图片本身）。
 */
import { readWorkspaceProjectHistory } from "./project-history";
import {
  addCreationHistoryRecords,
  getSavedDirectory,
  recordsFromImageTask,
  saveRecordToDirectory,
} from "./creation-history";
import { CREATION_HISTORY_CHANGED_EVENT } from "./creation-history";

export function startCreationHistoryRecorder(ownerId: string): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.status !== "completed") return;
    const project = readWorkspaceProjectHistory().find(p => p.id === (detail.projectId || "p1"));
    const records = recordsFromImageTask(detail, {
      ownerId,
      projectName: project?.title || "未命名画板",
      folderName: project?.folderName || "",
    });
    if (!records.length) return;
    void (async () => {
      const fresh = await addCreationHistoryRecords(records);
      if (!fresh.length) return;
      const dir = await getSavedDirectory(ownerId);
      if (!dir) return;
      let saved = 0;
      for (const record of fresh) {
        if (await saveRecordToDirectory(record, dir)) saved += 1;
      }
      if (saved) window.dispatchEvent(new CustomEvent(CREATION_HISTORY_CHANGED_EVENT));
    })();
  };
  window.addEventListener("image-generator-submit", listener);
  return () => window.removeEventListener("image-generator-submit", listener);
}
