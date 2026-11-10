/**
 * 灵感模板「一键同款」的**唯一实现**。
 *
 * 功能契约（用户 2026-11-10 原话）：
 *   点击 → 模板图被导入画布 → 并自动引用到提示词输入框里
 *   → 停在「等用户写提示词」这一步，由用户自己触发生成。
 *
 * ⚠️⚠️ 为什么必须是唯一实现：
 *    这个动作有两个入口（灵感模板专题页、个人中心的「我赞过的 / 我的收藏」），
 *    两边各写一份的话，改了一边另一边就是「点了没反应」——
 *    本项目的「同一份逻辑多个出口」已经踩过十四次，这里从源头收口。
 *
 * ⚠️ 只带图、不带文本：`shouldAutoRun: false`，绝不替用户按生成
 *    （一次生成要扣积分，涉及花钱的动作必须由用户自己点）。
 */
import { toast } from "sonner";
import { createWorkspaceHistoryProject } from "./project-history";
import {
  writeHomePromptHandoff,
  type HomePromptReference,
} from "./home-prompt-handoff";

export type SameStyleSource = {
  title: string;
  /** 模板图。远程 URL 即可 —— 画布侧走 `loadExternalImageWithProxyFallback`，带代理兜底。 */
  imageUrl?: string;
};

export type SameStyleResult =
  | { ok: true; projectId: string }
  | { ok: false; reason: "missing-image" | "handoff-failed" };

/**
 * 把模板图带进一块新画布，并挂到提示词输入框的引用区。
 *
 * @param navigate wouter 的跳转函数（页面自己持有，lib 不直接依赖路由）
 */
export function applyInspirationSameStyle(
  source: SameStyleSource,
  navigate: (to: string) => void
): SameStyleResult {
  const imageUrl = (source.imageUrl || "").trim();
  if (!imageUrl) {
    toast("这张模板没有可用图片", { description: "换一张模板再试试" });
    return { ok: false, reason: "missing-image" };
  }

  // 标题只用来在工作台里认出这块画板，不塞进输入框 —— 输入框要留给用户写。
  const project = createWorkspaceHistoryProject(source.title || "同款创作");

  const references: HomePromptReference[] = [
    {
      id: `same-style-${Date.now()}`,
      title: source.title || "同款参考图",
      src: imageUrl,
    },
  ];

  const written = writeHomePromptHandoff({
    projectId: project.id,
    model: "auto",
    shouldAutoRun: false,
    createdAt: project.createdAt,
    references,
  });

  if (!written.ok) {
    toast("导入失败", { description: "浏览器存储空间不足，请清理后重试" });
    return { ok: false, reason: "handoff-failed" };
  }

  /*
   * ⚠️ droppedReferences = 交接载荷超配额，写入方为了保住提示词把图丢了。
   *    这里没有提示词，所以丢图等于「进画布啥也没有」——必须说出来，
   *    否则用户会以为是自己点错了。
   */
  if (written.droppedReferences) {
    toast("参考图未能带入画布", { description: "图片体积超出浏览器限制，请手动添加" });
    return { ok: false, reason: "handoff-failed" };
  }

  toast("已导入同款参考图", {
    description: "在提示词框里写下你的想法，即可生成同款",
  });
  navigate(`/project/${project.id}`);
  return { ok: true, projectId: project.id };
}
