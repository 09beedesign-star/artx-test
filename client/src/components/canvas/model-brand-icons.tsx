import type { CSSProperties } from "react";
import bananaIconUrl from "@/assets/model-icons/banana.svg?url";
import chatgptIconUrl from "@/assets/model-icons/chatgpt.svg?url";
import jimengIconUrl from "@/assets/model-icons/jimeng.svg?url";
import klingIconUrl from "@/assets/model-icons/kling.svg?url";
import midjourneyIconUrl from "@/assets/model-icons/midjourney.svg?url";

export type ModelBrandIconKind =
  | "banana"
  | "jimeng"
  | "kling"
  | "midjourney"
  | "openai"
  | "image"
  | "none";

export const MODEL_BRAND_ICON_URLS: Record<Exclude<ModelBrandIconKind, "image" | "none">, string> = {
  banana: bananaIconUrl,
  jimeng: jimengIconUrl,
  kling: klingIconUrl,
  midjourney: midjourneyIconUrl,
  openai: chatgptIconUrl,
};

export function getModelBrandIconKind(modelId: string, icon?: string): ModelBrandIconKind {
  const value = `${icon || ""} ${modelId}`.toLowerCase();
  if (/banana|gemini|nano/.test(value)) return "banana";
  if (/jimeng|即梦/.test(value)) return "jimeng";
  if (/keling|kling|可灵/.test(value)) return "kling";
  if (/midjourney|mj-/.test(value)) return "midjourney";
  if (/openai|chatgpt|image2|og-image2|gpt/.test(value)) return "openai";
  return icon ? "image" : "none";
}

export function ModelBrandIconMask({
  kind,
  size = 14,
  style,
}: {
  kind: Exclude<ModelBrandIconKind, "image" | "none">;
  size?: number;
  style?: CSSProperties;
}) {
  const iconUrl = MODEL_BRAND_ICON_URLS[kind];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        backgroundColor: "#FFFFFF",
        WebkitMask: `url("${iconUrl}") center / contain no-repeat`,
        mask: `url("${iconUrl}") center / contain no-repeat`,
        ...style,
      }}
    />
  );
}
