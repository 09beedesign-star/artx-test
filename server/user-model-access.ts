import { isSelectableModel, resolveModelRoute, type AiCapability } from "./model-router";
import type { AiBillingCapability } from "../shared/ai-credit-policy";

export type UserModelAccess = {
  allowedAiModels?: string[];
};

function selectableCapability(capability?: AiBillingCapability): AiCapability | undefined {
  if (capability === "text_generation") return "chat";
  if (capability === "text_to_image") return "text_to_image";
  if (capability === "image_edit") return "image_edit";
  return undefined;
}

export function assertUserCanUseSelectableModel(
  user: UserModelAccess,
  model?: string,
  capability?: AiBillingCapability,
) {
  const routeCapability = selectableCapability(capability);
  if (!routeCapability) return;
  const canonicalModel = resolveModelRoute(routeCapability, model).model;
  if (!isSelectableModel(canonicalModel)) return;
  if (!user.allowedAiModels?.includes(canonicalModel)) {
    throw new Error("当前账号无权使用该模型");
  }
}
