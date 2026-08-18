export const DEFAULT_IMAGE_MODEL_ID = "og-image2-medium";

export const IMAGE_MODEL_PRIORITY_IDS = [
  "og-image2-medium",
  "gemini-3.5-flash-preview",
  "jimeng-4.0",
  "mj-v7",
  "mj-v8.1",
  "keling",
  "og-image2-high",
  "og-image2-low",
  "vod-gem",
  "vod-gem-lite",
  "vod-og",
  "vod-mj",
  "vod-kling",
  "vod-hunyuan",
  "vod-si",
  "vod-qwen",
  "vod-jimeng",
] as const;

export type VodModelId = (typeof IMAGE_MODEL_PRIORITY_IDS)[number];

export const VOD_MODEL_IDS = new Set<string>(
  IMAGE_MODEL_PRIORITY_IDS.filter((id): id is VodModelId => id.startsWith("vod-"))
);

export function isVodModelId(model?: string): boolean {
  const normalized = (model || "").trim().toLowerCase();
  return normalized.startsWith("vod-") || 
    ["gem", "gem-3.1", "gem-3.1-lite", "gem-lite", "og", "og-image2", "mj", "mj-v8.2", 
     "kling", "kling-3.0", "hunyuan", "si", "si-5.0", "qwen", "jimeng", "jimeng-4.0"].includes(normalized);
}

export const SUPPORTED_IMAGE_MODEL_IDS = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

export function normalizeImageModelId(model?: string) {
  const value = (model || "").trim();
  const normalized = value.toLowerCase();
  if (!value || value.toLowerCase() === "auto") return "";
  if (value === "IMAGE2" || normalized === "image2") return DEFAULT_IMAGE_MODEL_ID;
  if (normalized === "nano-banana") return "gemini-3.5-flash-preview";
  if (normalized === "nano-banana-lite") return "gemini-3.5-flash-preview";
  if (normalized === "gem" || normalized === "gem-3.1") return "vod-gem";
  if (normalized === "gem-3.1-lite" || normalized === "gem-lite") return "vod-gem-lite";
  if (normalized === "og" || normalized === "og-image2") return "vod-og";
  if (normalized === "mj" || normalized === "mj-v8.2") return "vod-mj";
  if (normalized === "kling" || normalized === "kling-3.0") return "vod-kling";
  if (normalized === "hunyuan") return "vod-hunyuan";
  if (normalized === "si" || normalized === "si-5.0") return "vod-si";
  if (normalized === "qwen") return "vod-qwen";
  if (normalized === "jimeng" || normalized === "jimeng-4.0") return "vod-jimeng";
  return normalized;
}

export function isSupportedImageModelId(model?: string) {
  const normalized = normalizeImageModelId(model);
  return Boolean(normalized && SUPPORTED_IMAGE_MODEL_IDS.has(normalized));
}

export function sortImageModelIdsByPriority(modelIds: string[]) {
  const uniqueIds = Array.from(new Set(modelIds.map(normalizeImageModelId).filter(Boolean)));
  const priority = new Map<string, number>(IMAGE_MODEL_PRIORITY_IDS.map((id, index) => [id, index]));
  return uniqueIds
    .filter(id => SUPPORTED_IMAGE_MODEL_IDS.has(id))
    .sort((a, b) => (priority.get(a) ?? 999) - (priority.get(b) ?? 999));
}

export function getImageModelFallbackAttempts(requestedModel?: string) {
  const normalized = normalizeImageModelId(requestedModel);
  const requested = normalized && SUPPORTED_IMAGE_MODEL_IDS.has(normalized)
    ? [normalized]
    : [];
  return Array.from(new Set([...requested, ...IMAGE_MODEL_PRIORITY_IDS]));
}

export function getDefaultImageModelPriorityLabel() {
  return IMAGE_MODEL_PRIORITY_IDS.join(" -> ");
}
