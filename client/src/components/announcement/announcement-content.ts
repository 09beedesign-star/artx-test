import homeAnnouncement002Banner from "@/assets/announcement/home-announcement-002-banner.jpg";

/**
 * ── 公共弹窗的「可变内容」唯一事实源 ──────────────────────────────
 *
 * 设计约定（产品定稿 2026-09-19）：
 *   弹窗被拆成「常驻骨架」和「可变内容」两部分。
 *     · 常驻骨架 = 排版布局 + 右下角绿色按钮样式 + 右上角圆形关闭按钮
 *       → 在 AnnouncementModal.tsx 里，换弹窗时**不动**
 *     · 可变内容 = 图片 / 标题 / 副标题 / 正文 / 左下角小标签 / 按钮文案
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
  /** 主标题右侧的副标题；不传 / null 时整块不渲染（别写空字符串，会占间距） */
  subtitle?: string | null;
  /** 主标题下方的正文段落 */
  body: string;
  /** 左下角绿色竖条旁的两行小标签；不需要时传 null 即可整块隐藏 */
  tag: { line1: string; line2: string } | null;
  /** 右下角绿色按钮文案 */
  actionLabel: string;
  /**
   * 整图模式：设计稿是一整张成品图（标题/正文/标签都画在图里）时使用。
   * 传了它，弹窗就**只渲染这张图 + 叠在图上的真按钮**，无白描边、无内边距；
   * title/body/tag 只作无障碍文本，不再显示。
   * `button` 是图中绿色按钮区域的位置（相对整图的百分比），真按钮按它绝对定位。
   */
  fullImage?: {
    /** 图片宽高比，如 "1989 / 1352"，用于预留高度避免加载时跳动 */
    aspectRatio: string;
    button: { left: number; top: number; width: number; height: number };
  } | null;
}

/* 文案以 Figma「Bk page / 首页弹窗模板」为准逐字照抄，全角标点是设计稿的排版节奏，别改半角 */
/* 上一期（2026-09-20 agent25）的内容保留在 git 历史；图片 home-announcement-001.png 仍在 assets 里 */
export const HOME_ANNOUNCEMENT: AnnouncementContent = {
  /* 2026-10-13 换成 nano banana 2.1 整图弹窗，id 同步换，否则看过上一期的老用户看不到且不报错 */
  id: "artxstudio-nanobanana21-2026-10",
  /* 2026-10-14：回到上一版的「图 + 文字」常规卡片版式（480 宽），图只取原整图上半部分的照片区 */
  image: homeAnnouncement002Banner,
  imageAlt: "ArtX Studio x nano banana 2.1",
  title: "ArtXStudio",
  subtitle: "x nano banana 2.1",
  body:
    "Nano Banana 2.1，2026 年 10 月全新发布。基于 Gemini 3.6 Flash，百万级上下文。" +
    "六大核心能力：指令精准跟随、角色一致性保持、多语言文字清晰渲染、14 图多参考融合、" +
    "联网实时搜索、4K 全比例输出（支持 8:1 超宽/超长）。所想即所见，所说即所得。",
  tag: { line1: "4k 直出，更便宜", line2: "中文识别更精准，一致性更高" },
  actionLabel: "我知道了",
  /* 整图模式已停用：整图里的小字在 480 宽下只有约 6px，看不清 */
  fullImage: null,
};
