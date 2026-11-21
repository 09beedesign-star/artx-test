/**
 * 全站文本 / 多模态理解模型的唯一事实来源，前后端共用。
 * 这里只管文本与图片理解；图片生成模型见 shared/image-models.ts，两者不可混用。
 */

/**
 * 执行链第一顺位：Claude Opus 5.5。
 * 地址与密钥与 Opus-5 完全一致（复用 AI_TEXT_API_KEY / AI_TEXT_BASE_URL）。
 */
export const PRIMARY_TEXT_MODEL = "claude-opus-5-5";

/** 语言、意图路由、OCR、品牌包解析及多模态理解的 UI / 路由默认型号。 */
export const DEFAULT_TEXT_MODEL = "gpt-6-luna";

/** 执行链末位备用；独立凭据仅存于服务端，不开放用户手动切换。 */
export const FALLBACK_TEXT_MODEL = "deepseek-v4-flash";

/**
 * 后端可执行的固定降级链，顺序不可被调用方 input.model / AI_TEXT_MODEL 改变：
 *   Claude Opus 5.5（第一）→ GPT Luna（第二）→ DeepSeek V4 Flash（第三）
 * 任一候选失败即尝试下一个；所有图片相关的大语言模型能力共用此链，
 * 因此「当前生效的兜底模型」对全部能力天然一致。
 */
export const TEXT_MODEL_FALLBACK_CHAIN = [
  PRIMARY_TEXT_MODEL,
  DEFAULT_TEXT_MODEL,
  FALLBACK_TEXT_MODEL,
] as const;

/** 后端可执行的固定优先链；历史 ID 仅用于识别迁移。 */
export const SUPPORTED_TEXT_MODEL_IDS = TEXT_MODEL_FALLBACK_CHAIN;

/** 老前端缓存、localStorage 和历史请求中的文本模型，防止被误路由为出图模型。 */
export const HISTORICAL_TEXT_MODEL_IDS = [
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "gpt-4o",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
  "deepseek-v4-flash",
] as const;

/** 用户在 UI 模型下拉框中可见可选的文本模型（仍只暴露 Luna，不开放手动切兜底）。 */
export const SELECTABLE_TEXT_MODEL_IDS = [DEFAULT_TEXT_MODEL] as const;

export function isKnownTextModelId(model?: string): boolean {
  const normalized = (model || "").trim();
  if (!normalized) return false;
  return (SUPPORTED_TEXT_MODEL_IDS as readonly string[]).includes(normalized)
    || (HISTORICAL_TEXT_MODEL_IDS as readonly string[]).includes(normalized);
}

/** 判断是否 claude 系列（保留历史品牌图标等 UI 展示 API）。 */
export function isClaudeTextModelId(model?: string): boolean {
  return /^claude[-.]/i.test((model || "").trim());
}
