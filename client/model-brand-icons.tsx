import type { CSSProperties } from "react";
import anthropicIconUrl from "@/assets/model-icons/anthropic.svg?url";
import bananaIconUrl from "@/assets/model-icons/banana.svg?url";
import chatgptIconUrl from "@/assets/model-icons/chatgpt.svg?url";
import jimengIconUrl from "@/assets/model-icons/jimeng.svg?url";
import klingIconUrl from "@/assets/model-icons/kling.svg?url";
import midjourneyIconUrl from "@/assets/model-icons/midjourney.svg?url";
import qwenIconUrl from "@/assets/model-icons/qwen.svg?url";
import siIconUrl from "@/assets/model-icons/si.svg?url";

export type ModelBrandIconKind =
  | "anthropic"
  | "banana"
  | "jimeng"
  | "kling"
  | "midjourney"
  | "openai"
  | "qwen"
  | "si"
  | "image"
  | "none";

export const MODEL_BRAND_ICON_URLS: Record<Exclude<ModelBrandIconKind, "image" | "none">, string> = {
  anthropic: anthropicIconUrl,
  banana: bananaIconUrl,
  jimeng: jimengIconUrl,
  kling: klingIconUrl,
  midjourney: midjourneyIconUrl,
  openai: chatgptIconUrl,
  qwen: qwenIconUrl,
  si: siIconUrl,
};

export function getModelBrandIconKind(modelId: string, icon?: string): ModelBrandIconKind {
  const value = `${icon || ""} ${modelId}`.toLowerCase();
  if (/banana|gemini|nano/.test(value)) return "banana";
  if (/jimeng|即梦/.test(value)) return "jimeng";
  if (/keling|kling|可灵/.test(value)) return "kling";
  if (/midjourney|mj-/.test(value)) return "midjourney";
  if (/qwen|通义|千问/.test(value)) return "qwen";
  /*
   * ⚠️⚠️ si 必须用**分隔符锚定**，绝不能写成裸的 /si/。
   *
   * "si" 是两个字母的子串，裸正则会命中任何含这两个字母相邻的串。
   * 被匹配的是 `${icon} ${modelId}` 拼接后的整串，随便一个
   * vision / fusion / basic / design 之类的新模型 id 或 icon 名进来，
   * 都会被判成 SI 品牌 —— 而且表现是「图标画错了」而不是报错，没人会发现。
   *
   * 当前模型清单里没有误伤纯属巧合，不能依赖这个巧合。
   * 这里要求 si 前后都是串首/串尾或分隔符（空格 - _ / .），
   * 于是 "si"、"vod-si"、"si-5.0-lite" 命中，"vision"、"fusion" 不命中。
   */
  if (/(^|[\s\-_/])si([\s\-_/.]|$)/.test(value)) return "si";
  // anthropic 必须排在 openai 之前判定。文本模型 2026-09-10 起切到 claude-opus-5，
  // 若不加这条分支，下面的 openai 分支匹配不到 claude，文本模型会退化成无图标。
  if (/anthropic|claude/.test(value)) return "anthropic";
  // 注意保留 |gpt：图片生成模型 gpt-image-* / og-image2-* 仍在使用，
  // 它们属于图片链路，图标必须继续走 openai。
  //
  // `og25` 是 2026-09-11 接入的 OG image2.5（腾讯 VOD 直连，全站默认出图模型）。
  // 它的 id 形如 vod-og25-sunburst-medium，既不含 "image2" 也不含 "gpt"，
  // 不显式加这个分支，裸 id 会落到 "none" —— 默认模型在 UI 上没有图标。
  if (/openai|chatgpt|image2|og-image2|og25|gpt/.test(value)) return "openai";
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
