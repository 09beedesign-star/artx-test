/**
 * 电商画布 · 共享模块
 *
 * 只放「三个二级页都要用」的东西：草稿状态类型、配色、尺寸换算、分镜拆分。
 *
 * 【为什么要单独一个文件】
 * 电商画布有三个真实路由出口：
 *   - /ecommerce-canvas/post            带货图文工作台
 *   - /ecommerce-canvas/product         产品图工作台
 *   - /ecommerce-canvas/templates       模板库总览
 *   - /ecommerce-canvas/templates/:id   模板详情
 * 草稿（模型 / 卖点 / 已选模板 / 张数）必须在它们之间**共享**，
 * 否则用户点「查看全部」挑完模板回来，刚才写的卖点全没了 ——
 * 这类「跳转即丢状态」是最典型的零报错坏体验。
 *
 * ⚠️ 这个文件不能 import 任何组件，只许有纯数据和纯函数。
 */
import type { AiImageResolutionTier } from "@shared/ai-credit-policy";
import type { PicWishBackgroundTemplate } from "@/lib/ai";

/** 全站统一的柠檬绿强调色（与画布智能电商面板同源） */
export const LIME = "#c5ed71";

export type EcommerceMode = "post" | "product";

/**
 * 跨路由共享的草稿。
 *
 * ⚠️ 上传的商品图（uploads）是 dataURL 字符串，跟着草稿一起跨路由保留，
 *    但在 /product 与 /post 之间是同一份 —— 两个模式共用一套商品图，
 *    因为「同一批实拍图既要出带货图文又要出产品图」是真实用法。
 */
export type EcommerceDraft = {
  model: string;
  uploads: string[];
  platform: string;
  market: string;
  language: string;
  postRatio: string;
  noTextOnImage: boolean;
  sellingPoints: string;
  tplId: number | null;
  withCopy: boolean;
  postCount: number;
  bgTemplate?: PicWishBackgroundTemplate;
  productRatio: string;
  productTier: AiImageResolutionTier;
  productCount: number;
};

export type EcommercePalette = {
  bg: string;
  panel: string;
  panelStrong: string;
  border: string;
  text: string;
  sub: string;
  field: string;
};

/** 与画布面板同一套明暗配色，避免电商画布自成一套视觉语言 */
export function ecommercePalette(isDark: boolean): EcommercePalette {
  return {
    bg: isDark ? "#222222" : "var(--design-surface-soft)",
    panel: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.82)",
    panelStrong: isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.96)",
    border: isDark ? "rgba(255,255,255,0.11)" : "rgba(20,20,36,0.11)",
    text: isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.86)",
    sub: isDark ? "rgba(255,255,255,0.62)" : "rgba(20,20,36,0.58)",
    field: isDark ? "rgba(255,255,255,0.07)" : "rgba(20,20,36,0.045)",
  };
}

/** 按比例与分辨率档换算目标像素（short side 对齐 AI_IMAGE_RESOLUTION_POLICIES） */
export function pixelSize(ratio: string, tier: AiImageResolutionTier) {
  const short = tier === "1k" ? 1088 : tier === "2k" ? 2048 : 4096;
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return {};
  const w = rw <= rh ? Math.round(short * (rw / rh)) : short;
  const h = rw <= rh ? short : Math.round(short * (rh / rw));
  return { targetWidth: w, targetHeight: h };
}

/**
 * 把「全景融入 → 局部特写 → 退后收尾」拆成一段一段。
 *
 * ⚠️ 分隔符同时兼容全角「→」和半角「->」：数据来自逆向抓取，
 *    两种写法都出现过，只认一种会导致部分模板详情页只有一个步骤。
 */
export function splitFlow(flow: string): string[] {
  return flow
    .split(/→|->/)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * 触发一次浏览器下载。
 *
 * ⚠️ 跨域的 http 图片地址上 `download` 属性会被忽略（点了会变成打开图片），
 *    所以先把图 fetch 成 blob 再走 object URL；拿不到（防盗链 / CORS）时
 *    退回新窗口打开，至少用户还能右键保存，而不是点了没反应。
 */
export async function downloadImage(src: string, fileName: string) {
  const trigger = (href: string, revoke = false) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 4000);
  };

  if (src.startsWith("data:") || src.startsWith("blob:")) {
    trigger(src);
    return;
  }
  try {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    trigger(URL.createObjectURL(blob), true);
  } catch {
    window.open(src, "_blank", "noopener,noreferrer");
  }
}
