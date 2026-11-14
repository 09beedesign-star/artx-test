/**
 * 创作历史全局记录器：监听画布的 image-generator-submit(completed) 事件，
 * 写本地 IndexedDB，已授权本地文件夹时顺手把图写进去。
 *
 * 🔒 纯本地：这里不调用任何 /api 写接口（除拉图片本身）。
 *
 * ⚠️ 2026-11-14 补齐「旁路出口」：电商画布的生成结果不经过画布事件总线，
 *    由页面直接调 recordCompletedImages()。⚠️ 不要改成派发
 *    image-generator-submit —— InfiniteCanvas 的 handleImageGenerate 会把它
 *    当成一次新的生成请求，导致重复出图/重复扣积分（多出口事故 A）。
 */
import { toast } from "sonner";
import { readWorkspaceProjectHistory } from "./project-history";
import {
  addCreationHistoryRecords,
  getDirectoryPermission,
  getSavedDirectory,
  recordsFromImageTask,
  saveRecordToDirectory,
} from "./creation-history";
import { CREATION_HISTORY_CHANGED_EVENT } from "./creation-history";

export type CompletedImageTaskDetail = {
  status?: string;
  generationId?: string;
  projectId?: string;
  prompt?: string;
  model?: string;
  style?: string;
  images?: Array<{ src?: string; width?: number; height?: number } | null | undefined>;
} | null | undefined;

/**
 * 把一批「已完成的 AI 生成图」记入创作历史，并在用户已授权文件夹时**自动落盘**。
 * 这是被动操作：调用方只管把结果递进来，不需要用户点保存。
 */
export async function recordCompletedImages(
  ownerId: string,
  detail: CompletedImageTaskDetail,
): Promise<void> {
  if (!ownerId || !detail || detail.status !== "completed") return;
  const project = readWorkspaceProjectHistory().find(
    p => p.id === (detail.projectId || "p1"),
  );
  const records = recordsFromImageTask(detail, {
    ownerId,
    projectName: project?.title || "未命名画板",
    folderName: project?.folderName || "",
  });
  if (!records.length) return;

  const fresh = await addCreationHistoryRecords(records);
  if (!fresh.length) return; // 同一批次恢复事件重复派发，按 id 去重

  const dir = await getSavedDirectory(ownerId);
  if (!dir) return; // 用户还没启用本地文件夹：只留浏览器记录，不打扰

  // ⚠️ 刷新后浏览器会把目录权限降回 prompt。「没量到」和「没问题」输出一样，
  //    这里必须显式区分权限失效，否则用户以为已经自动存进文件夹了。
  if ((await getDirectoryPermission(dir)) !== "granted") {
    toast("创作历史暂时没能写进本地文件夹", {
      description: "浏览器需要重新授权，请到「创作历史」页点一下恢复权限（记录已保存在本机）",
    });
    return;
  }

  let saved = 0;
  for (const record of fresh) {
    if (await saveRecordToDirectory(record, dir)) saved += 1;
  }
  if (saved) window.dispatchEvent(new CustomEvent(CREATION_HISTORY_CHANGED_EVENT));
  if (saved < fresh.length) {
    toast("部分图片没能写进本地文件夹", {
      description: "可到「创作历史」页手动下载，记录仍保留在本机",
    });
  }
}

export function startCreationHistoryRecorder(ownerId: string): () => void {
  const listener = (event: Event) => {
    void recordCompletedImages(ownerId, (event as CustomEvent).detail);
  };
  window.addEventListener("image-generator-submit", listener);
  return () => window.removeEventListener("image-generator-submit", listener);
}
