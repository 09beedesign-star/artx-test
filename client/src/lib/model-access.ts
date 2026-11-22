import type { AiModelOption } from "./workspace-data";

export function filterAllowedAiModelOptions<T extends AiModelOption>(
  models: T[],
  allowedAiModels?: string[],
) {
  if (!allowedAiModels) return models;
  const allowed = new Set(allowedAiModels);
  return models.filter(model => allowed.has(model.id));
}

/** 展示全部语言型号；受限型号明确置灰，不因新增选项扩大既有账号权限。 */
export function textModelOptionsForAccess<T extends AiModelOption>(models: T[], allowedAiModels?: string[]): T[] {
  const allowed = new Set(filterAllowedAiModelOptions(models, allowedAiModels).map(model => model.id));
  return models.map(model => allowed.has(model.id) ? model : {
    ...model,
    disabled: true,
    unavailableReason: "当前账号无权使用该模型",
  });
}

export function resolveAllowedAiModelId<T extends AiModelOption>(
  selectedId: string,
  allowedModels: T[],
) {
  return allowedModels.some(model => model.id === selectedId && !model.disabled)
    ? selectedId
    : allowedModels.find(model => !model.disabled)?.id;
}
