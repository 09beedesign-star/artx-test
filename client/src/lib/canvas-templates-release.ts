/**
 * 版式工作台当前已正式开放，生产环境与本地开发均可打开面板。
 * 保留发布闸门及未开放提示，当前不启用屏蔽逻辑。
 */
export const CANVAS_TEMPLATES_PUBLIC = true;

export const CANVAS_TEMPLATES_COMING_SOON_TITLE = "更多排版模板即将上线，敬请期待";
export const CANVAS_TEMPLATES_COMING_SOON_DESC = "版式工作台正在打磨中，开发完成后将正式发布";

/** 当前环境是否允许打开版式工作台面板 */
export function canOpenTemplatePanel(isDev: boolean = import.meta.env.DEV): boolean {
  return CANVAS_TEMPLATES_PUBLIC || isDev;
}
