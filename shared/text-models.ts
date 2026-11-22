/**
 * 全站文本 / 多模态理解模型的唯一事实来源，前后端共用。
 * 这里只管文本与图片理解；图片生成模型见 shared/image-models.ts，两者不可混用。
 */

/**
 * 默认执行链第一顺位：Claude Opus 5.5。
 * 地址与密钥与 Opus-5 完全一致（复用 AI_TEXT_API_KEY / AI_TEXT_BASE_URL）。
 */
export const PRIMARY_TEXT_MODEL = "claude-opus-5-5";

/** 语言、意图路由、OCR、品牌包解析及多模态理解的 UI / 路由默认型号。 */
export const DEFAULT_TEXT_MODEL = "gpt-6-luna";

/** 默认执行链末位备用；支持手动优先，独立凭据仅存于服务端。 */
export const FALLBACK_TEXT_MODEL = "deepseek-v4-flash";

/**
 * 默认降级链：Claude Opus 5.5 → GPT Luna → DeepSeek V4 Flash。
 * 仅本次请求显式标记 manual 且指定当前合法文本型号时，将该型号提到首位；
 * 其余候选保持默认顺序。单独传 model / AI_TEXT_MODEL 不改变默认顺序。
 */
export const TEXT_MODEL_FALLBACK_CHAIN = [
  PRIMARY_TEXT_MODEL,
  DEFAULT_TEXT_MODEL,
  FALLBACK_TEXT_MODEL,
] as const;

/** 对外身份名称只取当前请求实际执行的型号，不采信上游自报身份。 */
export const TEXT_MODEL_DISPLAY_NAMES: Record<string, string> = {
  [PRIMARY_TEXT_MODEL]: "Claude Opus 5.5",
  [DEFAULT_TEXT_MODEL]: "GPT-6 Luna",
  [FALLBACK_TEXT_MODEL]: "DeepSeek V4 Flash",
};

export function getTextModelDisplayName(model: string): string {
  return TEXT_MODEL_DISPLAY_NAMES[model] || model;
}

/** 当前后端可执行的文本型号；历史 ID 仅用于识别迁移。 */
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

/** 用户可手动选择的当前文本型号，与后端三级候选保持一致。 */
export const SELECTABLE_TEXT_MODEL_IDS = SUPPORTED_TEXT_MODEL_IDS;

export function isSelectableTextModelId(model?: string): boolean {
  return (SELECTABLE_TEXT_MODEL_IDS as readonly string[]).includes((model || "").trim());
}

/** 历史、未知及 auto 型号在文本路由中统一使用 Luna。 */
export function resolveRequestedTextModel(model?: string): string {
  return isSelectableTextModelId(model) ? model!.trim() : DEFAULT_TEXT_MODEL;
}

/** 仅显式手动选择可改变本次请求顺序，不记忆跨请求的选择或降级结果。 */
export function resolveTextModelFallbackChain(model?: string, modelSelection?: "manual"): string[] {
  if (modelSelection !== "manual" || !isSelectableTextModelId(model)) {
    return [...TEXT_MODEL_FALLBACK_CHAIN];
  }
  const selectedModel = model!.trim();
  return [selectedModel, ...TEXT_MODEL_FALLBACK_CHAIN.filter(candidate => candidate !== selectedModel)];
}

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
