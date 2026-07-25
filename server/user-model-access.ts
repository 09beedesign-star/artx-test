import { isImageModel, isSelectableModel, isTextModel, type AiCapability } from "./model-router";
import type { AiBillingCapability } from "../shared/ai-credit-policy";

export type UserModelAccess = {
  allowedAiModels?: string[];
};

const DEFAULT_IMAGE_MODEL_ACCESS = "og-image2-medium";
const DEFAULT_TEXT_MODEL_ACCESS = "gpt-5.4-mini";

function selectableCapability(capability?: AiBillingCapability): AiCapability | undefined {
  if (capability === "text_generation") return "chat";
  if (capability === "text_to_image") return "text_to_image";
  if (capability === "image_edit") return "image_edit";
  return undefined;
}

function isFixedBackendModel(model?: string) {
  const normalized = (model || "").trim().toLowerCase();
  return Boolean(normalized) && (
    isImageModel(normalized)
    || isTextModel(normalized)
    || normalized.startsWith("gpt-image-")
    || normalized.startsWith("gemini-3.1-flash-image")
    || normalized.startsWith("picwish-")
    || normalized.startsWith("bkeel")
  );
}

export function assertUserCanUseSelectableModel(
  user: UserModelAccess,
  model?: string,
  capability?: AiBillingCapability,
) {
  const routeCapability = selectableCapability(capability);
  if (!routeCapability) return;
  const requestedModel = (model || "").trim();

  if (isSelectableModel(requestedModel)) {
    if (user.allowedAiModels === undefined || user.allowedAiModels.includes(requestedModel)) return;
    throw new Error("当前账号无权使用该模型");
  }

  if (isFixedBackendModel(requestedModel)) return;

  const fallbackModel = routeCapability === "chat"
    ? DEFAULT_TEXT_MODEL_ACCESS
    : DEFAULT_IMAGE_MODEL_ACCESS;
  if (user.allowedAiModels === undefined || user.allowedAiModels.includes(fallbackModel)) return;
  throw new Error("当前账号无权使用该模型");
}
