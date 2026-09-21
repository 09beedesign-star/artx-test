import type { AiModelOption } from "./workspace-data";

export function filterAllowedAiModelOptions<T extends AiModelOption>(
  models: T[],
  allowedAiModels?: string[],
) {
  if (!allowedAiModels) return models;
  const allowed = new Set(allowedAiModels);
  return models.filter(model => allowed.has(model.id));
}

export function resolveAllowedAiModelId<T extends AiModelOption>(
  selectedId: string,
  allowedModels: T[],
) {
  return allowedModels.some(model => model.id === selectedId && !model.disabled)
    ? selectedId
    : allowedModels.find(model => !model.disabled)?.id;
}
