import { isImageModel, isSelectableModel, isTextModel, type AiCapability } from "./model-router";
import type { AiBillingCapability } from "../shared/ai-credit-policy";
import { DEFAULT_TEXT_MODEL, HISTORICAL_TEXT_MODEL_IDS, isSelectableTextModelId } from "../shared/text-models";
import {
  DEFAULT_IMAGE_MODEL_ID,
  isRetiredRelayImageModelId,
  normalizeImageModelId,
} from "../shared/image-models";

export type UserModelAccess = {
  allowedAiModels?: string[];
};

/**
 * 「未指定模型」时用于鉴权的兜底图片模型，必须与全站默认模型保持一致。
 *
 * 2026-09-12 从硬编码的 "og-image2-medium" 改为引用 DEFAULT_IMAGE_MODEL_ID：
 * 中转站图片模型整体下线后，旧常量已不在注册表里，`isSelectableModel` 恒为 false，
 * 会让所有「未显式指定模型」的图片请求直接抛「当前账号无权使用该模型」。
 *
 * 用常量引用而非再写死一个字符串，是为了让下次换默认模型时这里自动跟随。
 */
const DEFAULT_IMAGE_MODEL_ACCESS = DEFAULT_IMAGE_MODEL_ID;
const DEFAULT_TEXT_MODEL_ACCESS = DEFAULT_TEXT_MODEL;

/**
 * 文本模型已统一切到 gpt-6-luna。老账号白名单里可能仍是 Claude、旧 GPT、
 * DeepSeek 等历史 ID；这里把它们视同「持有当前文本模型授权」，
 * 避免存量账号在切换当天集体失去文本能力。只影响文本模型鉴权。
 */
const LEGACY_TEXT_MODEL_ACCESS_IDS: readonly string[] = HISTORICAL_TEXT_MODEL_IDS;

function hasModelAccess(allowed: string[], requestedModel: string) {
  if (allowed.includes(requestedModel)) return true;

  /**
   * 已下线的中转站图片模型与其迁移目标互认。
   *
   * 白名单在读盘时已被 normalizeAllowedModels 迁移成 vod-*，
   * 但请求方（旧前端缓存、历史 API 调用、管理后台直写）仍可能传来原始旧 id。
   * 两边字面值不同但语义等价，不互认就会误判为「无权使用」。
   */
  if (isRetiredRelayImageModelId(requestedModel)) {
    const migrated = normalizeImageModelId(requestedModel);
    if (migrated && allowed.includes(migrated)) return true;
  }

  // 新旧文本模型之间互认，仅限文本模型，不影响图片模型鉴权。
  if (!isTextModel(requestedModel)) return false;
  return LEGACY_TEXT_MODEL_ACCESS_IDS.some((legacy) => allowed.includes(legacy));
}

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

/** 仅选择本次鉴权型号，不改变 tracking、报价或用量记录。 */
export function resolveRequestAccessModel(
  request: unknown,
  trackingModel?: string,
  capability?: AiBillingCapability,
): string | undefined {
  const body = request && typeof request === "object" ? request as Record<string, unknown> : {};
  if (capability === "text_generation"
    && body.modelSelection === "manual"
    && typeof body.model === "string"
    && isSelectableTextModelId(body.model)) {
    return body.model.trim();
  }
  return trackingModel;
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
    if (user.allowedAiModels === undefined) return;
    if (hasModelAccess(user.allowedAiModels, requestedModel)) return;
    throw new Error("当前账号无权使用该模型");
  }

  if (isFixedBackendModel(requestedModel)) return;

  const fallbackModel = routeCapability === "chat"
    ? DEFAULT_TEXT_MODEL_ACCESS
    : DEFAULT_IMAGE_MODEL_ACCESS;
  if (user.allowedAiModels === undefined) return;
  if (hasModelAccess(user.allowedAiModels, fallbackModel)) return;
  throw new Error("当前账号无权使用该模型");
}
