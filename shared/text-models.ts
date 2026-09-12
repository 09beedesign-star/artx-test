/**
 * 全站文本 / 多模态理解模型的唯一事实来源。
 *
 * 背景：2026-09-10 之前，文本模型是散落硬编码的（server/text-generation.ts、
 * server/model-router.ts、server/user-model-access.ts、client/src/lib/workspace-data.ts
 * 等 10+ 处各写各的），型号被网关下线时需要满仓库改，极易漏改。
 * 现在统一收敛到这里，前后端共用。
 *
 * 注意边界：这里只管「文本 / 多模态理解」模型。
 * 图片**生成**模型是另一套，见 shared/image-models.ts（og-image2-* / gpt-image-* /
 * vod-* 等），两者不可混用——把图片模型发给 /chat/completions 会直接 400。
 */

/**
 * 默认文本模型：中转站（token.bkeel.com）提供的 claude-opus-5。
 *
 * 覆盖范围：画布内每一个 AI 命令、右下角提示词框、意图路由、
 * OCR 文案结构理解、多模态文字提取、品牌包解析、工作区聊天。
 *
 * 实测（2026-09-10）：
 * - /v1/chat/completions 纯文本 2.4s 返回
 * - image_url 多模态识图 2.8s 返回，正确识别测试图文字
 */
export const DEFAULT_TEXT_MODEL = "claude-opus-5";

/**
 * 服务端可接受的文本模型白名单。
 *
 * 前 3 个是当前在用的 claude 系列；GPT 型号仅为兼容历史请求参数
 * （老前端缓存、老 localStorage、外部调用方），不参与降级链。
 * 其中 gpt-5.4 与 gpt-5.4-mini 在网关侧已下线。
 */
export const SUPPORTED_TEXT_MODEL_IDS = [
  DEFAULT_TEXT_MODEL,
  "claude-opus-4-8",
  "claude-sonnet-5",
  "gpt-4o",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
] as const;

/**
 * 失败降级链，按顺序重试。
 *
 * 只放网关上确实存活的型号：历史写法把已下线的 gpt-5.4-mini / gpt-5.4
 * 排在前面，首选失败后要空转两次超时（实测 134s）才轮到可用型号。
 */
export const TEXT_MODEL_FALLBACK_IDS = [
  DEFAULT_TEXT_MODEL,
  "claude-sonnet-5",
  "gpt-5.5",
] as const;

/** 用户在 UI 模型下拉框中可见可选的文本模型。 */
export const SELECTABLE_TEXT_MODEL_IDS = [DEFAULT_TEXT_MODEL] as const;

export function isKnownTextModelId(model?: string): boolean {
  const normalized = (model || "").trim();
  if (!normalized) return false;
  return (SUPPORTED_TEXT_MODEL_IDS as readonly string[]).includes(normalized);
}

/** 判断是否 claude 系列（用于品牌图标等 UI 展示分支）。 */
export function isClaudeTextModelId(model?: string): boolean {
  return /^claude[-.]/i.test((model || "").trim());
}
