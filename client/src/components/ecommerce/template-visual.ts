/**
 * 电商画布 · 模板卡的视觉常量
 *
 * 工作台右栏、模板库总览页、模板详情页三处出口共用同一套缩略图与分类文案，
 * 保证「用户在详情页挑中的模板」回到工作台后能一眼认出是同一个。
 */
import {
  ECOMMERCE_TEMPLATES,
  ECOMMERCE_TPL_CATEGORIES,
} from "@/data/ecommerce-canvas-templates";

/** 占位缩略图的三个格子（对应分镜节奏：钩子 / 展示 / 收尾） */
export const THUMB_CELLS = [0, 1, 2];

/**
 * 按模板在库中的序号生成稳定的占位渐变。
 *
 * ⚠️ 必须按「模板 id 在库里的下标」而不是数组遍历下标来算：
 *    模板库页带搜索/分类过滤，遍历下标会随过滤结果漂移，
 *    同一个模板在两页会显示成两种颜色。
 */
export function templateThumbGradient(index: number, cell: number) {
  const hue = 230 + ((index * 7) % 60);
  return `linear-gradient(${140 + index * 37 + cell * 40}deg, hsl(${hue} 18% ${34 + cell * 6}%), hsl(${hue + 10} 20% ${22 + cell * 4}%))`;
}

/**
 * 已生成真实封面的模板 id（client/public/ecommerce-tpl/NN.jpg）。
 * 封面是一张横版三联图（钩子 / 展示 / 收尾），与 THUMB_CELLS 的分镜语义一致。
 * 未列入的模板回落到占位渐变，补图后把 id 加进来即可。
 */
const COVER_IDS = new Set<number>(Array.from({ length: 49 }, (_, i) => i + 1));

export function templateCoverUrl(id: number): string | null {
  if (!COVER_IDS.has(id)) return null;
  // BASE_URL 兼容 GitHub Pages 子路径部署
  return `${import.meta.env.BASE_URL}ecommerce-tpl/${String(id).padStart(2, "0")}.jpg`;
}

export function templateIndexById(id: number) {
  const found = ECOMMERCE_TEMPLATES.findIndex(item => item.id === id);
  return found < 0 ? 0 : found;
}

export function categoryLabelById(categoryId: string) {
  return ECOMMERCE_TPL_CATEGORIES.find(item => item.id === categoryId)?.label || "全部模板";
}
