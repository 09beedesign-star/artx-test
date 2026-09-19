import homeAnnouncement001 from "@/assets/announcement/home-announcement-001.png";

/**
 * ── 公共弹窗的「可变内容」唯一事实源 ──────────────────────────────
 *
 * 设计约定（产品定稿 2026-09-19）：
 *   弹窗被拆成「常驻骨架」和「可变内容」两部分。
 *     · 常驻骨架 = 排版布局 + 右下角绿色按钮样式 + 右上角圆形关闭按钮
 *       → 在 AnnouncementModal.tsx 里，换弹窗时**不动**
 *     · 可变内容 = 图片 / 标题 / 正文 / 左下角小标签 / 按钮文案
 *       → 全部收在本文件，换弹窗时**只动这里**
 *
 * ⚠️ 换弹窗时必须同时改 `id`。
 *    `id` 是「用户是否已看过这一期」的判断依据（写进 localStorage），
 *    不改 id 的话，看过上一期的老用户永远看不到新内容，而且不会报任何错。
 *    这是换弹窗最容易踩的坑 —— 内容换了、图换了，线上却只有新用户能看到。
 *
 * ⚠️ 图片请放在 `client/src/assets/announcement/` 并用 import 引入，
 *    不要写 `/xxx.png` 这种绝对路径：import 的产物文件名带内容哈希，
 *    换图后 URL 必变、缓存必失效；绝对路径的静态文件换图后同名，
 *    浏览器会继续用旧缓存，出现「图换了但用户看到的还是旧图」。
 */

export interface AnnouncementContent {
  /** 这一期公告的唯一标识；换内容必须换 id，否则老用户看不到 */
  id: string;
  /** 顶部图片（灰色占位区放的就是它） */
  image: string;
  /** 图片的无障碍描述 */
  imageAlt: string;
  /** 图片下方的主标题 */
  title: string;
  /** 主标题下方的正文段落 */
  body: string;
  /** 左下角绿色竖条旁的两行小标签；不需要时传 null 即可整块隐藏 */
  tag: { line1: string; line2: string } | null;
  /** 右下角绿色按钮文案 */
  actionLabel: string;
}

export const HOME_ANNOUNCEMENT: AnnouncementContent = {
  id: "artxstudio-image25-2026-09",
  image: homeAnnouncement001,
  imageAlt: "ArtX Studio",
  title: "ArtXStudio",
  body:
    "支持纹身图生图、局部重绘、AI 重绘，2K/4K/8K 高清输出；覆盖 25 个国内外电商平台商品图生成，" +
    "也能轻松搞定广告海报、PPT 配图、办公视觉，低成本做出高质感商业设计。" +
    "更有超多高效视觉设计 Skill 让你事半功倍！更多 AI 能力等你来解锁！准备好了吗？Go!",
  tag: {
    line1: "IMAGE2.5 系列",
    line2: "图片大模型已强势接入",
  },
  actionLabel: "我知道了",
};
