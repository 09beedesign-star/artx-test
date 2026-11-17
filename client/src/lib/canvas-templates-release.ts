/**
 * 🔒 2026-11-17 用户要求：线上版本的「版式工作台」先屏蔽，点击只提示「即将上线」；
 *    开发完成后再正式发布 —— 届时把 CANVAS_TEMPLATES_PUBLIC 改为 true 即可。
 *
 * - 入口按钮保留（让用户知道有这个功能），点击不打开面板，只弹「敬请期待」提示。
 * - 本地开发（vite dev）照常打开面板，不影响继续开发调试。
 */
export const CANVAS_TEMPLATES_PUBLIC = false;

export const CANVAS_TEMPLATES_COMING_SOON_TITLE = "更多排版模板即将上线，敬请期待";
export const CANVAS_TEMPLATES_COMING_SOON_DESC = "版式工作台正在打磨中，开发完成后将正式发布";

/** 当前环境是否允许打开版式工作台面板 */
export function canOpenTemplatePanel(isDev: boolean = import.meta.env.DEV): boolean {
  return CANVAS_TEMPLATES_PUBLIC || isDev;
}
