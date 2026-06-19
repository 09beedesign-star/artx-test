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

const IMAGE_MODELS = new Set([
  "gpt-image-2",
  "gpt-image-2-4k",
]);

const TEXT_MODELS = new Set([
  "gpt-4o",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
]);

function normalizeModelName(model?: string) {
  const value = (model || "").trim();
  if (!value) return "";
  if (value.toLowerCase() === "auto") return "";
  if (value === "IMAGE2" || value === "image2") return "gpt-image-2";
  if (value === "nano-banana" || value === "nano-banana-lite") return "gpt-image-2";
  return value;
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
      model: model && isImageModel(model) ? model : "gpt-image-2",
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
    image: ["auto", ...Array.from(IMAGE_MODELS)],
    text: ["auto", ...Array.from(TEXT_MODELS)],
  };
}
