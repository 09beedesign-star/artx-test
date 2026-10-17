/**
 * 记忆文档导出（Markdown）—— 长期记忆页按钮与画布提示词意图共用。
 *
 * ⚠️ showSaveFilePicker 需要「用户激活」（点击 / 回车）且激活有时效：
 *    必须**先**弹路径选择器拿到文件句柄，**再** await 拉取记忆内容。
 *    反过来写（先 fetch 再弹窗）在慢网下会超过激活窗口，浏览器直接拒绝弹窗。
 */
import type { UserMemoryDocument } from "@shared/user-memory";

/**
 * 判断提示词是不是在要求「把记忆文档下载到本地」。
 * 需同时出现「下载/导出/保存到本地」类动词和「记忆文档/记忆」，排除「不要下载记忆」等否定句。
 * 命中时由前端直接处理，不发给模型、不扣积分。
 */
export function detectMemoryDownloadIntent(prompt: string): boolean {
  const text = prompt.replace(/\s+/g, "");
  if (!text || text.length > 60) return false; // 长提示词是创作指令，不拦截
  if (/(不要|不用|别|无需|不需要)(帮我)?(下载|导出|保存)/.test(text)) return false;
  // 必须是类似「下载记忆」「导出记忆文档」的直白表述，而非「写一篇关于下载记忆的文章」
  // 「保存/存 … 到本地/电脑」允许中间夹宾语，如「保存记忆到本地」「把记忆存到电脑」
  const verb =
    /(^|[,，。、])(我要|我想|帮我|给我|请|把)?(下载|导出|download|export|(保存|存).{0,10}(到|在)(本地|电脑)|.{0,10}(保存|存)(到|在)(本地|电脑))/i;
  const noun = /(记忆|记忆文档|memory)/i;
  return verb.test(text) && noun.test(text);
}

export type MemoryExportScope = {
  /** 画布内触发时传当前项目，导出该项目/对话记忆。 */
  projectId?: string;
  projectTitle?: string;
};

export function buildMemoryMarkdown(doc: UserMemoryDocument, scope: MemoryExportScope = {}): string {
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  const section = (title: string, body?: string) =>
    `## ${title}\n\n${body?.trim() || "（无内容）"}\n`;
  const parts: string[] = [`# 记忆文档\n\n导出时间：${date}\n`];

  if (scope.projectId) {
    const project = doc.projects?.find(p => p.projectId === scope.projectId);
    const prompts = (doc.recentPrompts || []).filter(p => p.projectId === scope.projectId);
    parts.push(`# 当前项目记忆：${scope.projectTitle || project?.title || scope.projectId}\n`);
    parts.push(section("项目约定", project?.note));
    parts.push(
      section("近期提示词", prompts.map(p => `- ${p.prompt}`).join("\n"))
    );
    parts.push("> 项目记忆归属于该项目，项目删除后云端记忆随之删除；本文件为本地备份。\n");
  }

  parts.push("# 长期记忆（跟随账号）\n");
  parts.push(section("项目记忆", doc.projectMemory));
  parts.push(section("Skill", doc.skill));
  parts.push(section("通用规则", doc.generalRules));
  parts.push(section("常规记忆", doc.regularMemory || doc.longTerm));
  return parts.join("\n");
}

export function suggestMemoryFilename(scope: MemoryExportScope = {}): string {
  const day = new Date().toISOString().slice(0, 10);
  const base = scope.projectTitle || (scope.projectId ? "项目" : "长期");
  return `${base.replace(/[\\/:*?"<>|]/g, "_")}-记忆-${day}.md`;
}

export type SaveResult = { status: "saved"; name: string } | { status: "downloaded" } | { status: "cancelled" };

/**
 * 弹出系统路径选择器保存 Markdown。
 * 不支持 File System Access API 的浏览器（Safari / Firefox）回退为普通下载，
 * 保存位置由浏览器下载设置决定（可在浏览器里开启「每次询问保存位置」）。
 */
export async function saveMarkdownWithPicker(
  suggestedName: string,
  getContent: () => Promise<string> | string
): Promise<SaveResult> {
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      name: string;
      createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === "function") {
    let handle;
    try {
      handle = await picker({
        suggestedName,
        types: [{ description: "Markdown 文档", accept: { "text/markdown": [".md"] } }],
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return { status: "cancelled" };
      throw err;
    }
    const blob = new Blob([await getContent()], { type: "text/markdown;charset=utf-8" });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { status: "saved", name: handle.name };
  }

  const blob = new Blob([await getContent()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { status: "downloaded" };
}
