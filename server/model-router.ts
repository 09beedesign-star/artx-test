import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  normalizeImageModelId,
} from "../shared/image-models";

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

const TEXT_MODELS = new Set([
  "gpt-4o",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
]);

const SELECTABLE_IMAGE_MODELS = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

const SELECTABLE_TEXT_MODELS = new Set([
  "gpt-5.4-mini",
]);

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

export function normalizeAllowedModels(models: unknown) {
  if (!Array.isArray(models)) return [];
  const selected = new Set(
    models
      .filter((model): model is string => typeof model === "string")
      .map(normalizeModelName)
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
    model: model && isTextModel(model) ? model : "gpt-5.4-mini",
    provider: "text",
  };
}

export function listAvailableModels() {
  return {
    image: [...IMAGE_MODEL_PRIORITY_IDS],
    text: [...Array.from(TEXT_MODELS)],
  };
}
