import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  isRetiredRelayImageModelId,
  normalizeImageModelId,
} from "../shared/image-models";
import {
  DEFAULT_TEXT_MODEL,
  SELECTABLE_TEXT_MODEL_IDS,
  SUPPORTED_TEXT_MODEL_IDS,
  isKnownTextModelId,
} from "../shared/text-models";

export type AiCapability =
  | "chat"
  | "text_to_image"
  | "image_edit"
  | "image_expansion"
  | "background_removal"
  | "element_erasure"
  | "brand_kit_parse";

export type ModelRoute = {
  capability: AiCapability;
  model: string;
  provider: "image" | "text";
};

const IMAGE_MODELS = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

const TEXT_MODELS = new Set<string>(SUPPORTED_TEXT_MODEL_IDS);

const SELECTABLE_IMAGE_MODELS = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

// 用户在 UI 上可见可选的文本模型。已从 gpt-5.4-mini 切换到 claude-opus-5。
const SELECTABLE_TEXT_MODELS = new Set<string>(SELECTABLE_TEXT_MODEL_IDS);

function normalizeModelName(model?: string) {
  const value = (model || "").trim();
  if (!value) return "";
  if (value.toLowerCase() === "auto") return "";
  const imageModel = normalizeImageModelId(value);
  if (imageModel) return imageModel;
  return value;
}

export function isSelectableModel(model?: string) {
  const normalized = normalizeModelName(model);
  return SELECTABLE_IMAGE_MODELS.has(normalized) || SELECTABLE_TEXT_MODELS.has(normalized);
}

export function listSelectableModelIds() {
  return [...IMAGE_MODEL_PRIORITY_IDS, ...Array.from(SELECTABLE_TEXT_MODELS)];
}

/**
 * 把已下线的旧模型 id 迁移到当前的等价模型。
 *
 * 为什么必须在这里做，而不是在鉴权时做兼容：
 * auth-store.ts 在**读取磁盘数据时**（:373）就会调用 normalizeAllowedModels，
 * 旧 id 在那一刻已被剔除。等到 user-model-access 做鉴权时，
 * 用户的白名单里已经空了，任何「新旧 id 互认」都无从谈起，
 * 存量账号会直接拿到「当前账号无权使用该模型」。
 *
 * 所以正确做法是在归一化阶段做**迁移**，而不是在过滤阶段做**丢弃**。
 *
 * 覆盖两类：
 * 1. 旧文本模型（gpt-5.4-mini 等）→ 当前默认文本模型；
 * 2. 已下线的中转站图片模型（og-image2-* / keling / mj-v7 等）→ 等价 VOD 模型。
 *    这一类由 normalizeModelName 内部的 normalizeImageModelId 完成，
 *    走到这里时通常已是 VOD id；此处再判一次是为了覆盖
 *    「调用方直接传原始 id 未经 normalizeModelName」的路径。
 *
 * 注意边界：迁移是**等价替换**，不放大权限 ——
 * 每个旧 id 只映射到画风/档位对应的那一个新模型，不是放行全部。
 */
function migrateLegacyTextModelId(model: string) {
  if (isSelectableModel(model)) return model;
  // 已下线的中转站图片模型 → 等价 VOD 模型（同厂同档，不放大权限）。
  if (isRetiredRelayImageModelId(model)) return normalizeImageModelId(model);
  // 曾经作为「可选文本模型」出现过的历史 id，统一迁移到当前默认文本模型。
  return isKnownTextModelId(model) ? DEFAULT_TEXT_MODEL : model;
}

export function normalizeAllowedModels(models: unknown) {
  if (!Array.isArray(models)) return [];
  const selected = new Set(
    models
      .filter((model): model is string => typeof model === "string")
      .map(normalizeModelName)
      .map(migrateLegacyTextModelId)
      .filter(isSelectableModel),
  );
  return listSelectableModelIds().filter(model => selected.has(model));
}

export function isImageModel(model?: string) {
  return IMAGE_MODELS.has(normalizeModelName(model));
}

export function isTextModel(model?: string) {
  return TEXT_MODELS.has(normalizeModelName(model));
}

export function resolveModelRoute(capability: AiCapability, requestedModel?: string): ModelRoute {
  const model = normalizeModelName(requestedModel);
  const needsImageModel = capability !== "chat" && capability !== "brand_kit_parse";

  if (needsImageModel) {
    return {
      capability,
      model: model && isImageModel(model) ? model : DEFAULT_IMAGE_MODEL_ID,
      provider: "image",
    };
  }

  return {
    capability,
    model: model && isTextModel(model) ? model : DEFAULT_TEXT_MODEL,
    provider: "text",
  };
}

export function listAvailableModels() {
  return {
    image: [...IMAGE_MODEL_PRIORITY_IDS],
    text: [...Array.from(TEXT_MODELS)],
  };
}
