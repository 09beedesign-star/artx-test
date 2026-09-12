import fs from "fs";
import { getSkill } from "./skill-registry";
import { getUploadsRoot } from "./local-image-storage";
import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  getImageModelFallbackAttempts,
  isRetiredRelayImageModelId,
  isSupportedImageModelId,
  normalizeImageModelId,
  sortImageModelIdsByPriority,
  isVodModelId,
} from "../shared/image-models";
import { isClaudeTextModelId } from "../shared/text-models";
import { generateText } from "./text-generation";
import { recordImageProviderFailure } from "./image-provider-failure-log";
import { buildMeituMask, inpaintWithMeitu } from "./meitu-client";
import { eraseTextWithEngine, isTextEngineConfigured } from "./text-engine-client";
import {
  drawTextReplacement,
  createModifiedRegionsMask,
  dilateMaskTransparent,
  verifyDrawnTextQuality,
  eraseTextRegionsLocally,
  calibrateTextRegions,
  resolveRegionTargetTexts,
} from "./text-replace-precise";
import {
  generateImageWithVod,
  isVodAigcConfigured,
  type VodImageGenerationInput,
} from "./tencent-vod-aigc";
import path from "path";
import os from "os";

/**
 * 文字编辑链路的调试产物落盘（默认关闭）。
 *
 * 历史问题：这里曾硬编码 `D:\project\artx-test\debug-*.png`，在 macOS/Linux 上
 * `fs.writeFile` 直接抛 ENOENT，而该调用位于方案 B 的 try 块内，异常被 catch 吞掉，
 * 导致「确定性文字绘制」100% 静默降级为 AI 叠字——这正是文字回填效果不稳定的根因。
 *
 * 现在改为：仅当显式设置 TEXT_EDIT_DEBUG_DIR 时才写盘，且失败绝不影响主流程。
 */
async function writeTextEditDebugArtifacts(
  artifacts: Record<string, Buffer>,
): Promise<void> {
  const dir = process.env.TEXT_EDIT_DEBUG_DIR?.trim();
  if (!dir) return;
  try {
    const target = dir === "1" || dir === "true"
      ? path.join(os.tmpdir(), "artx-text-edit-debug")
      : dir;
    await fs.promises.mkdir(target, { recursive: true });
    const stamp = Date.now();
    await Promise.all(
      Object.entries(artifacts).map(([name, buffer]) =>
        fs.promises.writeFile(path.join(target, `${stamp}-${name}.png`), buffer),
      ),
    );
    console.log(`[text_edit debug] 调试产物已写入 ${target}`);
  } catch (error) {
    // 调试写盘失败绝不能影响主链路
    console.log(
      `[text_edit debug] 调试产物写入失败（已忽略）: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

type ImageGenerateInput = {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  images?: Array<{ src: string; title?: string }>;
  preferImageApiForReferences?: boolean;
  enhancePrompt?: boolean;
  negativePrompt?: string;
};

type RemoveBackgroundInput = {
  imageSrc: string;
  model?: string;
  prompt?: string;
};

type EnhanceImageInput = {
  imageSrc: string;
  level?: "4k";
};

type RemoveWatermarkInput = {
  imageSrc: string;
};

type CreateBackgroundInput = {
  imageSrc: string;
  backgroundReferenceSrc?: string;
  backgroundReferenceName?: string;
  prompt?: string;
  style?: string;
  composition?: string;
  productScale?: string;
  sceneType?: number;
  ratio?: string;
  resolution?: "2k" | "4k";
  count?: number;
  customWidth?: number;
  customHeight?: number;
  skillId?: string;
  model?: string;
};

type EditImageInput = {
  imageSrc: string;
  maskSrc?: string;
  maskUrl?: string;
  mask_url?: string;
  model?: string;
  prompt: string;
  operation?: string;
  preserveSource?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  images?: Array<{ src: string; title?: string }>;
  cameraView?: {
    x?: number;
    y?: number;
    z?: number;
    prompt?: string;
  };
  /** "meitu" 时智能注释编辑走美图局部重绘；缺省/其他值走现有 AI 图片编辑链路 */
  provider?: "auto" | "meitu" | "default";
  /**
   * 基础约束语义（智能注释）：
   * - "add"（默认）：mask 内保留原内容，只在上方添加请求物体（帽子/眼镜等）
   * - "edit"：mask 内修改用户指定的属性（换色/换材质/换纹理等），保持形状结构与其余区域不变
   */
  promptKind?: "add" | "edit";
  /** 美图局部重绘的正向提示词（用户注释文本），仅 provider="meitu" 时使用 */
  promptPos?: string;
  /** 智能文案编辑：原图 OCR 识别的文字区域（x/y/width/height/text/rotate/fontColor/fontFamily），用于确定性文字绘制 */
  textRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    /** 文字倾斜角度（度，正值顺时针），回填时以区域中心旋转 */
    rotate?: number;
    /** 字体颜色（十六进制 #rrggbb） */
    fontColor?: string;
    /** 字体（中文名或 CSS 字体名） */
    fontFamily?: string;
  }>;
  /** 智能文案编辑：修改后的完整文案（多行用 \n 分隔），用于确定性文字绘制 */
  editedText?: string;
  /**
   * 智能文案编辑：新文案「贴回原图」的方式。
   *
   * - "local"（默认）：用本地字体确定性绘制，不调用任何 AI 模型。
   *   零成本、亚秒级、逐字准确。字体只能从系统字体近似匹配。
   * - "ai"：擦字后交给图片模型（image2.5 medium）叠字，由模型还原字体、
   *   字重、透视、光影与材质，风格还原上限更高，但**文字准确率不可靠**。
   *
   * 2026-09-12 A/B 实测（894x817 横幅，"CUSTOM" → "秋季旗舰品鉴会"，各 2 轮）：
   *   local：逐字命中 7/7 = 100%（两轮一致），耗时 0.3~0.4s，成本 0
   *   ai   ：逐字命中 3/7、4/7（第一轮还出现错字"秋香"），耗时 29~42s
   * 生成式模型按扩散过程画字形，不保证字符级正确，中文长句尤其明显。
   * 文案编辑的第一诉求是「字要对」，所以默认保持 local，ai 作为可选项保留
   * （艺术字/强透视/特殊材质场景下风格还原更好，但必须人工核字）。
   */
  textApplyMode?: "ai" | "local";
};

type ElementBackgroundInput = {
  imageSrc: string;
  foregroundLayerSrc: string;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  sync?: 0 | 1 | boolean | string | number;
};

type EraseImageInput = {
  imageSrc?: string;
  imageUrl?: string;
  image_url?: string;
  maskSrc?: string;
  maskUrl?: string;
  mask_url?: string;
  rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
  sync?: 0 | 1 | boolean | string | number;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  disableLocalFallback?: boolean;
  preserveUnmaskedPixels?: boolean;
};

type ExpandImageInput = {
  imageSrc?: string;
  imageUrl?: string;
  image_url?: string;
  maskSrc?: string;
  maskUrl?: string;
  mask_url?: string;
  sync?: 0 | 1 | boolean | string | number;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  strength?: number;
  scale?: number;
  steps?: number;
  seed?: number;
};

type ExtractImageTextInput = {
  imageSrc: string;
  model?: string;
};

type ImageTextRegion = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 文字倾斜角度（度，正值顺时针），回填时以区域中心旋转 */
  rotate?: number;
  /** 文字主色（十六进制 #rrggbb），回填时作为默认字体颜色 */
  fontColor?: string;
};

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
};

type GeneratedImageResult = {
  images: GeneratedImage[];
  providerTaskId?: string;
  providerTaskIds?: string[];
};

const MIN_AI_IMAGE_OUTPUT_LONG_SIDE = 1536;
const MAX_SMART_COMMERCE_IMAGE_COUNT = 9;
const PROVIDER_IMAGE_BATCH_SIZE = 4;

function collectProviderTaskIds(...results: Array<Pick<GeneratedImageResult, "providerTaskId" | "providerTaskIds"> | undefined>) {
  const taskIds: string[] = [];
  for (const result of results) {
    if (!result) continue;
    if (result.providerTaskId) taskIds.push(result.providerTaskId);
    taskIds.push(...(result.providerTaskIds || []));
  }
  return Array.from(new Set(taskIds.filter(Boolean)));
}

function withProviderTaskIds(result: { images: GeneratedImage[] }, taskIds: string[]): GeneratedImageResult {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
  return {
    ...result,
    providerTaskId: uniqueTaskIds[0],
    providerTaskIds: uniqueTaskIds.length > 0 ? uniqueTaskIds : undefined,
  };
}

type ImageGenerationResponse = {
  success?: boolean;
  task_id?: string;
  taskId?: string;
  status?: string;
  message?: string;
  b64_json?: string;
  url?: string;
  image?: string;
  image_url?: string | { url?: string };
  imageBase64?: string;
  imageUrl?: string;
  images?: Array<{ b64_json?: string; url?: string }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  result?: ImageGenerationResponse;
  rawResult?: ImageGenerationResponse;
  output?: unknown;
  choices?: Array<{ message?: { content?: string | unknown[]; images?: Array<{ b64_json?: string; url?: string }> } }>;
  error?: { message?: string } | string;
};

type ImageTextResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  error?: { message?: string } | string;
};

type AsyncImageTaskResponse = {
  success?: boolean;
  data?: {
    taskId?: string;
    status?: string;
    error?: string;
    result?: ImageGenerationResponse;
    rawResult?: ImageGenerationResponse;
    images?: Array<{ b64_json?: string; url?: string }>;
    image?: string;
    image_url?: string | { url?: string };
    imageBase64?: string;
    imageUrl?: string;
    data?: ImageGenerationResponse["data"];
    output?: unknown;
    upstreamStatus?: number;
    requestPath?: string;
    resolvedRequestPath?: string;
    prompt?: string;
    model?: string;
  } | ImageGenerationResponse["data"];
  result?: ImageGenerationResponse;
  rawResult?: ImageGenerationResponse;
  status?: string;
  error?: { message?: string } | string;
};

type PicWishSegmentationResponse = {
  status?: number;
  message?: string;
  task_id?: string;
  taskId?: string;
  data?: {
    task_id?: string;
    taskId?: string;
    image?: string;
    image1?: string;
    image_1?: string;
    image_2?: string;
    image_3?: string;
    image_4?: string;
    image_obj?: string;
    file?: string;
    mask?: string;
    mask_obj?: string;
    image_width?: number;
    image_height?: number;
    progress?: number;
    state?: number;
    state_detail?: string;
  };
};

type PicWishLogEvent = "request" | "created" | "poll" | "success" | "failure" | "download";

function logPicWishEvent(
  event: PicWishLogEvent,
  details: {
    taskType: PicWishVisualTaskType;
    endpoint?: string;
    taskId?: string;
    status?: number;
    state?: number;
    progress?: number;
    attempt?: number;
    durationMs?: number;
    width?: number;
    height?: number;
    error?: string;
    hasMask?: boolean;
  },
) {
  const log = {
    provider: "picwish",
    event,
    taskType: details.taskType,
    endpoint: details.endpoint,
    taskId: details.taskId,
    status: details.status,
    state: details.state,
    progress: details.progress,
    attempt: details.attempt,
    durationMs: details.durationMs,
    width: details.width,
    height: details.height,
    hasMask: details.hasMask,
    error: details.error,
  };
  if (event === "failure") {
    console.warn("[picwish]", JSON.stringify(log));
  } else {
    console.info("[picwish]", JSON.stringify(log));
  }
}

function normalizeAsyncTaskResult(data: AsyncImageTaskResponse): {
  status?: string;
  error?: string;
  result?: ImageGenerationResponse;
} {
  const task = Array.isArray(data.data) ? undefined : data.data;
  const directDataResult = Array.isArray(data.data)
    ? { data: data.data }
    : undefined;
  const error =
    typeof data.error === "string"
      ? data.error
      : data.error?.message || task?.error;
  const taskResult = task?.result || task?.rawResult
    ? {
        ...(task?.result || {}),
        rawResult: task?.rawResult,
        image: task?.imageBase64 || task?.image,
        imageBase64: task?.imageBase64,
        imageUrl: task?.imageUrl,
        image_url: task?.image_url,
        images: task?.images,
        data: task?.data,
        output: task?.output,
      }
    : undefined;
  const directTaskResult = task && (task.images || task.image || task.image_url || task.imageBase64 || task.imageUrl || task.data || task.output)
    ? {
        images: task.images,
        image: task.imageBase64 || task.image,
        imageBase64: task.imageBase64,
        imageUrl: task.imageUrl,
        image_url: task.image_url,
        data: task.data,
        output: task.output,
      }
    : undefined;
  const directResult = data.result || data.rawResult;
  const topLevelResult = (data as unknown as ImageGenerationResponse).images || (data as unknown as ImageGenerationResponse).image || (data as unknown as ImageGenerationResponse).image_url || (data as unknown as ImageGenerationResponse).output
    ? data as unknown as ImageGenerationResponse
    : undefined;

  return {
    status: task?.status || data.status,
    error,
    result: taskResult || directTaskResult || directDataResult || directResult || topLevelResult,
  };
}

function resolveGeneratedImageSrc(src: string, baseUrl: string) {
  if (!src) return src;
  const compact = src.trim().replace(/\s+/g, "");
  if (isLikelyBase64ImagePayload(compact)) return `data:image/png;base64,${compact}`;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return toAbsoluteUrl(src, baseUrl);
}

function isLikelyBase64ImagePayload(value: string) {
  return value.length >= 80 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export const __testNormalizeGeneratedImageSrc = resolveGeneratedImageSrc;

export function __testParseStructuredImageText(rawContent: string): {
  text: string;
  regions: ImageTextRegion[];
} {
  const trimmed = rawContent.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const objectStart = unfenced.indexOf("{");
  const objectEnd = unfenced.lastIndexOf("}");
  const json = objectStart >= 0 && objectEnd > objectStart
    ? unfenced.slice(objectStart, objectEnd + 1)
    : unfenced;

  try {
    const parsed = JSON.parse(json) as { text?: unknown; regions?: unknown };
    const regions = Array.isArray(parsed.regions)
      ? parsed.regions.flatMap((region): ImageTextRegion[] => {
          if (!region || typeof region !== "object") return [];
          const value = region as Record<string, unknown>;
          const x = Number(value.x);
          const y = Number(value.y);
          const width = Number(value.width);
          const height = Number(value.height);
          if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
            return [];
          }
          const boundedX = Math.max(0, Math.min(1, x));
          const boundedY = Math.max(0, Math.min(1, y));
          const rawRotate = Number(value.rotate);
          const rawFontColor = typeof value.fontColor === "string" ? value.fontColor.trim() : "";
          return [{
            text: typeof value.text === "string" ? value.text.trim() : "",
            x: boundedX,
            y: boundedY,
            width: Math.max(0, Math.min(1 - boundedX, width)),
            height: Math.max(0, Math.min(1 - boundedY, height)),
            rotate: Number.isFinite(rawRotate)
              ? Math.max(-90, Math.min(90, Math.round(rawRotate)))
              : 0,
            fontColor: /^#[0-9a-fA-F]{6}$/.test(rawFontColor)
              ? rawFontColor.toLowerCase()
              : undefined,
          }];
        })
      : [];
    return {
      text: typeof parsed.text === "string" ? parsed.text.trim() : "",
      regions,
    };
  } catch {
    return { text: trimmed, regions: [] };
  }
}

function extractGeneratedImages(providerData: ImageGenerationResponse, baseUrl: string, width: number, height: number) {
  const choiceImageItems = providerData.choices?.flatMap(choice => choice.message?.images || []) || [];
  const directItems: Array<{ b64_json?: string; url?: string }> = [];
  if (providerData.b64_json) directItems.push({ b64_json: providerData.b64_json });
  if (providerData.url) directItems.push({ url: providerData.url });
  if (typeof providerData.image === "string") directItems.push({ url: providerData.image });
  if (typeof providerData.imageBase64 === "string") directItems.push({ b64_json: providerData.imageBase64 });
  if (typeof providerData.imageUrl === "string") directItems.push({ url: providerData.imageUrl });
  if (typeof providerData.image_url === "string") directItems.push({ url: providerData.image_url });
  if (providerData.image_url && typeof providerData.image_url === "object" && providerData.image_url.url) {
    directItems.push({ url: providerData.image_url.url });
  }
  const items = [
    ...directItems,
    ...(providerData.data || []),
    ...(providerData.images || []),
    ...choiceImageItems,
  ];
  const images = items
    .map((item) => {
      const src = item.b64_json
        ? `data:image/png;base64,${item.b64_json}`
        : item.url
          ? resolveGeneratedImageSrc(item.url, baseUrl)
          : undefined;
      return src ? { src, width, height } : null;
    })
    .filter((item): item is GeneratedImage => Boolean(item));

  if (images.length > 0) return images;

  const choiceImages = extractChoiceImages(providerData, baseUrl).map((item) => ({
    ...item,
    src: resolveGeneratedImageSrc(item.src, baseUrl),
    width,
    height,
  }));

  return choiceImages;
}

const ratioToSize: Record<string, { size: string; width: number; height: number }> = {
  "1:1": { size: "1024x1024", width: 1024, height: 1024 },
  "4:5": { size: "1024x1536", width: 1024, height: 1280 },
  "5:4": { size: "1536x1024", width: 1280, height: 1024 },
  "3:4": { size: "1024x1536", width: 1024, height: 1365 },
  "4:3": { size: "1536x1024", width: 1365, height: 1024 },
  "16:9": { size: "1536x1024", width: 1536, height: 864 },
  "9:16": { size: "1024x1536", width: 864, height: 1536 },
  "21:9": { size: "1536x1024", width: 1536, height: 658 },
};

function getImagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/generations`;
}

function getImageEditsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/edits`;
}

function getModelsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/models`;
}

function getChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
}

function getProviderConfig() {
  const apiKey = process.env.AI_IMAGE_API_KEY_OVERRIDE || process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL_ID;

  return { apiKey, baseUrl, model };
}

function getPicWishConfig() {
  return {
    apiKey: process.env.PICWISH_API_KEY || process.env.AOS_API_KEY || "",
    baseUrl: (process.env.PICWISH_BASE_URL || "https://techsz.aoscdn.com").replace(/\/+$/, ""),
  };
}

function getPicWishObjectsRemovalConfig() {
  const sharedConfig = getPicWishConfig();
  const baseUrl = (
    process.env.PICWISH_OBJECTS_REMOVAL_BASE_URL ||
    process.env.PICWISH_INPAINT_BASE_URL ||
    sharedConfig.baseUrl
  ).replace(/\/+$/, "");
  return { apiKey: sharedConfig.apiKey, baseUrl };
}

const supportedImageModels = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

/**
 * 走 chat completions 端点而非 images 端点的图片模型。
 *
 * 2026-09-12 移除 "gemini-3.5-flash-preview"：中转站图片模型整体下线，
 * 它已从注册表摘除并迁移到 vod-gem-lite（走 VOD 独立链路，不经 chat 端点）。
 * 保留的两个 gemini-3.1-flash-image* 是固定后端能力，不在选择器里，仍然有效。
 */
const chatCompatibleImageModels = new Set<string>([
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
]);

type ImageModelCatalogOption = {
  id: string;
  label: string;
  color: string;
  description?: string;
  icon?: string;
};

type ImageModelCatalog = {
  image: ImageModelCatalogOption[];
  source: "provider" | "fallback";
  error?: string;
};

type ImageModelCatalogInput = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const imageModelColors = [
  "oklch(0.72 0.18 200)",
  "oklch(0.82 0.18 95)",
  "oklch(0.74 0.16 285)",
  "oklch(0.78 0.15 40)",
  "oklch(0.70 0.16 150)",
];

/**
 * 模型文案表。**只收录当前在售的 VOD 模型 + 固定后端能力**。
 *
 * 2026-09-12 移除了 6 个已下线的中转站图片模型文案
 * （gemini-3.5-flash-preview / jimeng-4.0 / mj-v7 / mj-v8.1 / keling / og-image2-*）。
 * 保留 gpt-image-2* 与 gemini-3.1-flash-image* 是因为它们是**固定后端能力**
 * （不在选择器里，但智能注释等内部流程仍会用到），与选择器清单是两回事。
 */
const imageModelDescriptions: Record<string, string> = {
  "gpt-image-2": "高品质通用场景",
  "gpt-image-2-4k": "极致4K细节",
  "gemini-3.1-flash-image": "高性价比场景快",
  "gemini-3.1-flash-image-preview": "高性价比预览快",
  // OG image2.5（腾讯 VOD 直连，2026-09-11 起为全站默认）
  "vod-og25-sunburst-medium": "高性价比默认推荐",
  "vod-og25-flare-medium": "高性价比另一画风",
  "vod-og25-sunburst-low": "极致低成本草稿",
  "vod-og25-flare-low": "极致低成本另一画风",
  "vod-og25-sunburst-high": "极致高清细节",
  "vod-og25-flare-high": "极致高清另一画风",
  // 其余 VOD 直连模型。这些此前只在前端 workspace-data.ts 里有文案，
  // 服务端目录接口没有，导致 /api/ai/models 把它们回成裸 id + 默认图标 ——
  // UI 因为有本地清单看不出来，直接消费该接口的第三方才会踩到。
  "vod-gem": "高品质综合表现",
  "vod-gem-lite": "高性价比出图快",
  "vod-og": "高品质场景稳定",
  "vod-mj": "极致艺术表现",
  "vod-kling": "高品质国风电商",
  "vod-si": "极致写实质感",
  "vod-qwen": "高性价比中文强",
  "vod-jimeng": "高性价比中文强",
};

/**
 * 用户可见的模型展示名。
 *
 * **这张表只影响 UI 文案，与真实模型接口完全解耦**：
 * 路由用的是左侧的 id（vod-og / vod-gem），
 * 真正发给腾讯的版本字符串由 server/tencent-vod-aigc.ts 的
 * VOD_MODEL_VERSIONS 决定，两者互不干涉。改这里不会改变出图结果。
 *
 * 2026-09-12 按用户要求做了一次对外命名调整（后缀一律保持不变）：
 * - og 前缀去掉：`og image2` → `image2`
 * - gem 前缀换成 banana：`gem 3.1` → `banana 3.1`
 */
const imageModelLabels: Record<string, string> = {
  "vod-og25-sunburst-medium": "image2.5 medium",
  "vod-og25-flare-medium": "image2.5 medium flare",
  "vod-og25-sunburst-low": "image2.5 low",
  "vod-og25-flare-low": "image2.5 low flare",
  "vod-og25-sunburst-high": "image2.5 high",
  "vod-og25-flare-high": "image2.5 high flare",
  "vod-gem": "banana 3.1",
  "vod-gem-lite": "banana 3.1 lite",
  "vod-og": "image2",
  "vod-mj": "mj v8.2",
  "vod-kling": "kling 3.0",
  "vod-si": "si 5.0 pro",
  "vod-qwen": "qwen 0925",
  "vod-jimeng": "jimeng 4.0",
};

const imageModelIcons: Record<string, string> = {
  // id 里不含 "openai"/"gpt" 关键字，不显式指定就会落到默认的 "image" 图标。
  "vod-og25-sunburst-medium": "openai",
  "vod-og25-flare-medium": "openai",
  "vod-og25-sunburst-low": "openai",
  "vod-og25-flare-low": "openai",
  "vod-og25-sunburst-high": "openai",
  "vod-og25-flare-high": "openai",
  "vod-gem": "gemini",
  "vod-gem-lite": "gemini",
  "vod-og": "openai",
  "vod-mj": "midjourney",
  "vod-kling": "kling",
  "vod-si": "image",
  "vod-qwen": "qwen",
  "vod-jimeng": "jimeng",
};

function isImageGenerationModelId(id: string) {
  /**
   * 已下线的中转站图片模型必须在这里挡掉。
   *
   * isSupportedImageModelId 内部会先做 normalizeImageModelId，
   * 而归一化会把 `og-image2-medium` 这类旧 id **迁移**成合法的 VOD id，
   * 于是它会返回 true —— 对「持久化数据兼容」而言这是对的，
   * 但对「模型目录」而言是错的：中转站 /models 仍会吐回这些旧 id，
   * 不挡掉就会让下线的模型重新出现在选择器里（只是改了个名字）。
   *
   * 目录的语义是「现在能选什么」，迁移的语义是「过去存的还能用」，两者不能混。
   */
  if (isRetiredRelayImageModelId(id)) return false;
  return isSupportedImageModelId(id);
}

function createImageModelOption(id: string, index: number): ImageModelCatalogOption {
  return {
    id,
    label: imageModelLabels[id] || id,
    color: imageModelColors[index % imageModelColors.length],
    description: imageModelDescriptions[id],
    icon: imageModelIcons[id] || "image",
  };
}

function parseProviderModelIds(data: unknown) {
  const records = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { data?: unknown[] }).data)
      ? (data as { data: unknown[] }).data
      : [];
  return records
    .map(item => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const record = item as { id?: unknown; name?: unknown; model?: unknown };
      return String(record.id || record.name || record.model || "").trim();
    })
    .filter(Boolean);
}

export async function listImageModelCatalog(input: ImageModelCatalogInput = {}): Promise<ImageModelCatalog> {
  const config = getProviderConfig();
  const apiKey = input.apiKey || config.apiKey;
  const baseUrl = input.baseUrl || config.baseUrl;
  const fetchImpl = input.fetchImpl || fetch;

  if (!apiKey) {
    return {
      image: sortImageModelIdsByPriority(Array.from(supportedImageModels)).map(createImageModelOption),
      source: "fallback",
      error: "Missing AI_IMAGE_API_KEY",
    };
  }

  try {
    const response = await fetchImpl(getModelsEndpoint(baseUrl), {
      method: "GET",
      headers: getImageProviderHeaders(apiKey),
    });
    const raw = await response.text();
    const data = safeParseJson<unknown>(raw);
    if (!response.ok) {
      throw new Error(getProviderErrorMessage(null, raw || `Model catalog returned ${response.status}`, {
        status: response.status,
        baseUrl,
        raw,
      }));
    }
    /**
     * 目录 = 中转站 /models 的可用项 ∪ **全部 VOD 直连模型**。
     *
     * 这里必须做并集而不是只取中转站返回值。原因：
     * vod-* 走腾讯云 VOD AIGC 的独立签名链路（server/tencent-vod-aigc.ts），
     * 根本不在中转站的模型列表里，`parseProviderModelIds` 永远拿不到它们。
     *
     * 2026-09-11 全站图片生成切到 VOD 直连后，这个遗漏变成了硬故障：
     * /api/ai/models 只回了 5 个中转站模型，**新的默认模型 image2.5 一个都没有**，
     * 链首显示成 vod-gem，第三方 Agent 按目录取模型时根本拿不到默认值。
     * （前端 workspace-data.ts 有 VOD_ONLY_MODELS 兜底，所以 UI 上看不出来，
     * 直接消费这个接口的调用方才会踩到 —— 属于典型的「一层有兜底、另一层没有」。）
     */
    const discovered = parseProviderModelIds(data).filter(isImageGenerationModelId);
    const vodModels = IMAGE_MODEL_PRIORITY_IDS.filter(isVodModelId);
    const modelIds = sortImageModelIdsByPriority([...discovered, ...vodModels]);
    return {
      image: modelIds.map(createImageModelOption),
      source: "provider",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Model catalog failed");
    return {
      image: sortImageModelIdsByPriority(Array.from(supportedImageModels)).map(createImageModelOption),
      source: "fallback",
      error: message,
    };
  }
}

export const __testBuildImageModelCatalog = listImageModelCatalog;

function buildPrompt(input: ImageGenerateInput) {
  const stylePrefix = input.style ? `风格：${input.style}\n` : "";
  return `${stylePrefix}${input.prompt.trim()}`;
}

function toAbsoluteUrl(url: string, baseUrl: string) {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;

  const normalized = baseUrl.replace(/\/+$/, "");
  if (url.startsWith("/")) {
    return normalized.endsWith("/v1") && url.startsWith("/v1/")
      ? `${normalized.slice(0, -3)}${url}`
      : `${normalized}${url}`;
  }
  return `${normalized}/${url.replace(/^\/+/, "")}`;
}

function extractChoiceImages(providerData: ImageGenerationResponse, baseUrl: string) {
  const imageUrls: { src: string }[] = [];

  const addSrc = (src?: string) => {
    if (!src) return;
    const trimmed = src.trim();
    if (!trimmed) return;
    const isImage = trimmed.startsWith("data:image/") || /^https?:\/\//i.test(trimmed) || /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(trimmed);
    if (!isImage) return;
    const absolute = toAbsoluteUrl(trimmed, baseUrl);
    if (!imageUrls.some(item => item.src === absolute)) {
      imageUrls.push({ src: absolute });
    }
  };

  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
      let match = imagePattern.exec(value);
      while (match) {
        addSrc(match[1]);
        match = imagePattern.exec(value);
      }

      const dataUrlPattern = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
      let dataUrlMatch = dataUrlPattern.exec(value);
      while (dataUrlMatch) {
        addSrc(dataUrlMatch[1]);
        dataUrlMatch = dataUrlPattern.exec(value);
      }

      const urlPattern = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp)(?:\?[^\s"'<>]*)?)/gi;
      let urlMatch = urlPattern.exec(value);
      while (urlMatch) {
        addSrc(urlMatch[1]);
        urlMatch = urlPattern.exec(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.b64_json === "string") addSrc(`data:image/png;base64,${record.b64_json}`);
    if (typeof record.url === "string") addSrc(record.url);
    if (typeof record.image_url === "string") addSrc(record.image_url);
    if (record.image_url && typeof record.image_url === "object") walk(record.image_url);
    if (typeof record.image === "string") addSrc(record.image);
    Object.values(record).forEach(walk);
  };

  walk(providerData.choices?.map(choice => choice.message?.content || "").flat());
  walk(providerData.output);
  walk(providerData.result);
  walk(providerData.rawResult);
  return imageUrls;
}

function safeParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

class ImageProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ImageProviderRequestError";
  }
}

type ImageProviderFetchResult = {
  response: Response;
  requestId: string;
};

const imageProviderRetryDelayMs = 1800;
const imageProviderRequestTimeoutMs = Math.max(
  5_000,
  Math.min(Number(process.env.AI_IMAGE_REQUEST_TIMEOUT_MS) || 90_000, 120_000),
);
const REMOVE_BACKGROUND_PICWISH_TIMEOUT_MS = 120_000;

function getProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0] || "上游服务";
  }
}

function createImageProviderRequestId() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getProviderEndpointPath(endpoint: string) {
  try {
    return new URL(endpoint).pathname;
  } catch {
    return endpoint.replace(/^https?:\/\/[^/]+/, "") || "/";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    timeoutId.unref?.();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isHtmlResponse(raw: string) {
  return /^\s*<!doctype html/i.test(raw) || /^\s*<html[\s>]/i.test(raw);
}

function isCloudflare524(raw: string, status?: number) {
  return status === 524 || /error code 524|524:\s*a timeout occurred|a timeout occurred/i.test(raw);
}

function normalizeProviderErrorText(message: string) {
  let current = message.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = safeParseJson<{ error?: string | { message?: string; type?: string; code?: string }; message?: string }>(current);
    if (!parsed) break;
    const nested = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message || parsed.message || "";
    if (!nested || nested === current) break;
    current = nested.trim();
  }

  if (/openai_error|bad_response_status_code|bad response status/i.test(current)) {
    return "图片生成服务暂时没有返回可用结果，系统已自动使用当前可用生成链路处理，请稍后重试。";
  }
  return current;
}

function getProviderErrorMessage(
  data: ImageGenerationResponse | null,
  fallback: string,
  options?: { status?: number; baseUrl?: string; raw?: string },
) {
  const raw = options?.raw || fallback;
  const host = options?.baseUrl ? getProviderHost(options.baseUrl) : "上游服务";
  if (isCloudflare524(raw, options?.status)) {
    return `图片模型服务超时，请稍后重试。当前上游 ${host} 返回 524。`;
  }
  if (isHtmlResponse(raw)) {
    return `图片模型服务返回了非 JSON 页面（HTTP ${options?.status || "unknown"}），请稍后重试。`;
  }
  const message = !data?.error
    ? data?.message || fallback
    : typeof data.error === "string"
      ? data.error
      : data.error.message || fallback;
  return normalizeProviderErrorText(message);
}

function isRetryableProviderError(status: number | undefined, raw: string) {
  return isCloudflare524(raw, status) || status === 408 || status === 429 || Boolean(status && status >= 500);
}

async function readImageProviderResponse(
  response: Response,
  baseUrl: string,
  context: string,
): Promise<ImageGenerationResponse> {
  const text = await response.text();
  const data = safeParseJson<ImageGenerationResponse>(text) || {};

  if (!response.ok) {
    throw new ImageProviderRequestError(
      getProviderErrorMessage(data, text || `${context} returned ${response.status}`, {
        status: response.status,
        baseUrl,
        raw: text,
      }),
      response.status,
      isRetryableProviderError(response.status, text),
    );
  }

  return data;
}

async function withImageProviderRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const shouldRetry = error instanceof ImageProviderRequestError
      ? error.retryable
      : error instanceof TypeError;
    if (!shouldRetry) throw error;
    await delay(imageProviderRetryDelayMs);
    return operation();
  }
}

async function fetchImageProvider(
  endpoint: string,
  init: RequestInit,
  context: string,
  details: { model?: string; operation: "generate" | "chat" | "edit" },
): Promise<ImageProviderFetchResult> {
  const requestId = createImageProviderRequestId();
  const startedAt = Date.now();
  const logBase = {
    requestId,
    operation: details.operation,
    model: details.model || "unknown",
    host: getProviderHost(endpoint),
    path: getProviderEndpointPath(endpoint),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), imageProviderRequestTimeoutMs);
  console.info("[image-provider]", {
    event: "request-start",
    ...logBase,
    timeoutMs: imageProviderRequestTimeoutMs,
  });
  try {
    const response = await fetch(endpoint, { ...init, signal: controller.signal });
    console.info("[image-provider]", {
      event: "response",
      ...logBase,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return { response, requestId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[image-provider]", {
        event: "timeout",
        ...logBase,
        durationMs: Date.now() - startedAt,
      });
      await recordImageProviderFailure({
        ...logBase,
        kind: "timeout",
        durationMs: Date.now() - startedAt,
        error: `${context} timed out`,
      }).catch(logError => console.warn("[image-provider] failed to persist timeout", logError));
      throw new ImageProviderRequestError(
        `${context} timed out after ${Math.round(imageProviderRequestTimeoutMs / 1000)} seconds`,
        504,
        false,
        requestId,
      );
    }
    console.warn("[image-provider]", {
      event: "network-error",
      ...logBase,
      errorName: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    await recordImageProviderFailure({
      ...logBase,
      kind: "network-error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.name : "unknown network error",
    }).catch(logError => console.warn("[image-provider] failed to persist network error", logError));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeImageProviderError(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 220);
}

function isUnsupportedImagesApiError(message: string) {
  return /images api is not supported|not supported for this platform|unsupported.*images/i.test(message);
}

function isImageEditEndpointUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const status = error instanceof ImageProviderRequestError ? error.status : undefined;
  return status === 404 ||
    /not found|no available channel|not supported model for image generation|images\/edits/i.test(message);
}

function shouldFallbackSmartAnnotationEdit(error: unknown) {
  if (isImageEditEndpointUnavailable(error)) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  const status = error instanceof ImageProviderRequestError ? error.status : undefined;
  return Boolean(status && (status === 408 || status === 429 || status >= 500)) ||
    isProviderGatewayError(message) ||
    isProviderCapacityError(message) ||
    isProviderModelCompatibilityError(message) ||
    isUnsupportedImagesApiError(message) ||
    /not supported|unsupported|no available channel/i.test(message);
}

function isSmartAnnotationNoVisibleChangeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /智能注释模型没有在标记区域做出可见修改|没有在指定区域做出可见修改|no visible/i.test(message);
}

function isChatCompatibleImageModel(model?: string) {
  return Boolean(model && chatCompatibleImageModels.has(model));
}

function shouldUseReferenceImageChatPath(model?: string, images?: Array<{ src?: string }>) {
  return isChatCompatibleImageModel(model) || Boolean(images?.length);
}

export function __testResolveReferenceImageRoute(
  model: string,
  hasReferenceImages: boolean,
  preferImageApiForReferences: boolean,
) {
  const usesChatPath = isChatCompatibleImageModel(model) || (
    hasReferenceImages && !preferImageApiForReferences
  );
  return {
    usesChatPath,
    fallbackModel:
      hasReferenceImages && preferImageApiForReferences && !isChatCompatibleImageModel(model)
        // 2026-09-12：原为已下线的中转站模型 gemini-3.5-flash-preview，
        // 改用全站默认的 VOD 模型作参考图兜底。
        ? DEFAULT_IMAGE_MODEL_ID
        : model,
  };
}

function isMissingReferenceImagesError(message: string) {
  return /no reference images found|reference images?.*not found|missing reference images/i.test(message);
}

function isImageGroupPermissionError(message: string) {
  return /无权访问|permission|not authorized|forbidden|分组/i.test(message) && /image|图片|专用/i.test(message);
}

function isProviderCapacityError(message: string) {
  /**
   * 上游「容量/通道不足」类错误 —— 属于**临时性**故障，
   * 应当继续尝试 fallback 链上的下一个模型，而不是直接让整次生成失败。
   *
   * `all available accounts exhausted` 是 2026-09-11 实测补入的：
   * 中转站对 gemini-3.5-flash-preview 返回
   *   503 {"error":{"message":"All available accounts exhausted","type":"server_error"}}
   * 而该模型正是 auto 优先级链上的**第 2 个**（IMAGE_MODEL_PRIORITY_IDS[1]）。
   *
   * 旧正则里 `no available compatible accounts` 只覆盖了「没有兼容账号」这一种措辞，
   * 匹配不到「账号已耗尽」，于是这个本可重试的错误走到了 :4179 的
   * `throw new Error("图片生成接口暂不可用")` —— **整条链在第 2 个模型上就断了**，
   * 后面 6 个可用模型一个都没试到。
   *
   * 用户侧表现为「调用 skill 生图报错」，且因为 auto 链一撞就停，
   * 重试往往仍失败，看起来像全站出图能力挂掉。
   */
  return /no available channel|no available compatible accounts|all available accounts exhausted|accounts exhausted|system cpu overloaded|overloaded|capacity|账号池|兼容账号/i.test(message);
}

function isProviderGatewayError(message: string) {
  return isProviderNetworkError(message) ||
    /openai_error|bad_response_status_code|bad response status|图片生成服务暂时没有返回可用结果|image (chat )?provider model .* timed out/i.test(message);
}

function isProviderNetworkError(message: string) {
  return /fetch failed|network-error|network error|socket hang up|connection (reset|closed|refused)|econnreset|etimedout/i.test(message);
}

function isProviderModelCompatibilityError(message: string) {
  return /model .*not (found|exist|available)|model_not_found|invalid.*model|unsupported.*model|not supported model|does not support|unsupported parameter|invalid.*parameter|response_format/i.test(message);
}

function resolveProviderImageModel(model: string) {
  if (model === "gemini-3.1-flash-image-preview") return "gemini-3.1-flash-image";
  if (model === "gpt-image-2-4k") return "gemini-3.1-flash-image";
  return model;
}

function stripReferenceContextFromPrompt(prompt: string) {
  return prompt
    .split("\n")
    .filter((line) => !/参考当前画布|引用素材|上下文：当前画布|reference image/i.test(line))
    .join("\n")
    .replace(/用户请求：/g, "")
    .trim() || prompt.trim();
}

function getImageProviderJsonHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "Hermes-Agent/0.16.0",
  };
}

function getImageProviderHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "Hermes-Agent/0.16.0",
  };
}

async function callImageProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  return withImageProviderRetry(async () => {
    const { response, requestId } = await fetchImageProvider(getImagesEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderJsonHeaders(apiKey),
      body: JSON.stringify(body),
    }, `Image provider model ${String(body.model || "unknown")}`, {
      model: String(body.model || "unknown"),
      operation: "generate",
    });

    try {
      return await readImageProviderResponse(response, baseUrl, "Image provider");
    } catch (error) {
      if (error instanceof ImageProviderRequestError) {
        await recordImageProviderFailure({
          requestId,
          operation: "generate",
          model: String(body.model || "unknown"),
          host: getProviderHost(baseUrl),
          path: getProviderEndpointPath(getImagesEndpoint(baseUrl)),
          status: error.status,
          kind: "http-error",
          error: summarizeImageProviderError(error.message),
        }).catch(logError => console.warn("[image-provider] failed to persist HTTP error", logError));
        throw new ImageProviderRequestError(error.message, error.status, error.retryable, requestId);
      }
      throw error;
    }
  });
}

async function callImageChatProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const referenceImages = Array.isArray(body.images)
    ? (body.images as Array<{ src?: string; title?: string }>).filter(image => typeof image.src === "string" && image.src.trim())
    : [];
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{
    type: "text",
    text: [
      "请根据下面的提示生成图片，并在回复中返回图片 URL、markdown 图片链接或 base64 图片。",
      "如果提供了引用图，必须严格理解每张引用图的用途：例如提取某张图里的物件、把另一张图作为主体/背景/姿态参考。",
      "不要凭空生成无关人物、场景或道具；输出必须和用户指定的引用关系一致。",
      String(body.prompt || ""),
      `目标尺寸：${body.size || "1024x1024"}。`,
      referenceImages.length
        ? [
            "引用图说明：",
            ...referenceImages.map((image, index) => `引用图 ${index + 1}：${image.title || "未命名图片"}`),
          ].join("\n")
        : "",
    ].filter(Boolean).join("\n"),
  }];
  referenceImages.slice(0, 8).forEach(image => {
    content.push({ type: "image_url", image_url: { url: image.src! } });
  });

  return withImageProviderRetry(async () => {
    const { response, requestId } = await fetchImageProvider(getChatEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderJsonHeaders(apiKey),
      body: JSON.stringify({
        model: body.model,
        messages: [{ role: "user", content }],
      }),
    }, `Image chat provider model ${String(body.model || "unknown")}`, {
      model: String(body.model || "unknown"),
      operation: "chat",
    });

    try {
      return await readImageProviderResponse(response, baseUrl, "Image chat provider");
    } catch (error) {
      if (error instanceof ImageProviderRequestError) {
        await recordImageProviderFailure({
          requestId,
          operation: "chat",
          model: String(body.model || "unknown"),
          host: getProviderHost(baseUrl),
          path: getProviderEndpointPath(getChatEndpoint(baseUrl)),
          status: error.status,
          kind: "http-error",
          error: summarizeImageProviderError(error.message),
        }).catch(logError => console.warn("[image-provider] failed to persist HTTP error", logError));
        throw new ImageProviderRequestError(error.message, error.status, error.retryable, requestId);
      }
      throw error;
    }
  });
}

async function callImageEditProvider(
  body: FormData,
  apiKey: string,
  baseUrl: string,
): Promise<ImageGenerationResponse> {
  return withImageProviderRetry(async () => {
    const { response, requestId } = await fetchImageProvider(getImageEditsEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderHeaders(apiKey),
      body,
    }, "Image edit provider", { operation: "edit" });

    try {
      return await readImageProviderResponse(response, baseUrl, "Image edit provider");
    } catch (error) {
      if (error instanceof ImageProviderRequestError) {
        await recordImageProviderFailure({
          requestId,
          operation: "edit",
          model: "unknown",
          host: getProviderHost(baseUrl),
          path: getProviderEndpointPath(getImageEditsEndpoint(baseUrl)),
          status: error.status,
          kind: "http-error",
          error: summarizeImageProviderError(error.message),
        }).catch(logError => console.warn("[image-provider] failed to persist HTTP error", logError));
        throw new ImageProviderRequestError(error.message, error.status, error.retryable, requestId);
      }
      throw error;
    }
  });
}

function getImageFileName(mimeType: string) {
  if (mimeType.includes("svg")) return "source.svg";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "source.jpg";
  if (mimeType.includes("webp")) return "source.webp";
  return "source.png";
}

// 把 /uploads/... 这类站内相对路径映射回本地磁盘文件。
//
// 前端在本地开发时传给后端的图片 src 是同源相对路径（画布的
// getCanvasRenderableImageSrc 在 localhost 下保持同源，不再改写成远程域名），
// 而 fetch() 只接受绝对 URL，直接传相对路径会抛
// "Failed to parse URL from /uploads/..."，导致所有需要读取源图的能力
// （抠图/高清/去水印/擦除/扩图等）全部失败。
//
// 这些文件本来就落在本机 ARTX_DATA_DIR 下，直接读盘即可，
// 比绕一圈 HTTP 回环更快也更可靠。
function resolveLocalUploadFile(src: string): string | null {
  if (!src.startsWith("/uploads/") && !src.startsWith("/api/uploads/")) return null;
  try {
    const uploadsRoot = path.resolve(getUploadsRoot());
    // 去掉查询串（画布会挂 ?artxv=xxx 做缓存失效）和 /api 前缀
    const pathname = src.split("?")[0].split("#")[0].replace(/^\/api(?=\/uploads\/)/, "");
    const relative = decodeURIComponent(pathname.slice("/uploads/".length));
    const resolved = path.resolve(uploadsRoot, relative);
    // 目录穿越防护：解析后必须仍在 uploads 根目录内
    if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) return null;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return resolved;
  } catch {
    return null;
  }
}

function mimeTypeForFileExtension(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

async function imageSrcToBuffer(src: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mimeType = match[1] || "image/png";
    const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    return { buffer, mimeType };
  }

  const localFile = resolveLocalUploadFile(src);
  if (localFile) {
    return {
      buffer: await fs.promises.readFile(localFile),
      mimeType: mimeTypeForFileExtension(localFile),
    };
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }
  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0];
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

function bufferToImageFile(buffer: Buffer, mimeType: string) {
  return new File([buffer], getImageFileName(mimeType), { type: mimeType });
}

type PicWishVisualTaskType = "segmentation" | "scale" | "self-face-cutout" | "watermark" | "inpaint" | "r-background" | "advanced-image-expand";

function getPicWishTaskEndpoint(baseUrl: string, taskType: PicWishVisualTaskType) {
  return `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/${taskType}`;
}

function getPicWishWatermarkRemovalEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/external/watermark-remove`;
}

function getPicWishImageExpansionEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/advanced-image-expand`;
}

function getPicWishObjectsRemovalEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/inpaint`;
}

function getPicWishResultImageUrl(data: PicWishSegmentationResponse, taskType?: PicWishVisualTaskType) {
  return getPicWishResultImageUrls(data, taskType)[0] || "";
}

function getPicWishResultImageUrls(data: PicWishSegmentationResponse, taskType?: PicWishVisualTaskType) {
  if (taskType === "segmentation") {
    return [data.data?.image_obj || data.data?.image || ""].filter(Boolean);
  }
  if (taskType === "watermark") {
    return [data.data?.file || data.data?.image || data.data?.image_obj || ""].filter(Boolean);
  }
  if (taskType === "advanced-image-expand" || taskType === "r-background") {
    const record = (data.data || {}) as Record<string, unknown>;
    const urls = [record.image, record.image1];
    for (let index = 1; index <= 9; index += 1) {
      urls.push(record[`image_${index}`], record[`image${index}`]);
    }
    return Array.from(new Set(urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)));
  }
  return [data.data?.image || data.data?.image_obj || ""].filter(Boolean);
}

function getPicWishTaskId(data: PicWishSegmentationResponse) {
  return data.data?.task_id || data.data?.taskId || data.task_id || data.taskId || "";
}

function getPicWishErrorMessage(data: PicWishSegmentationResponse | null, fallback: string) {
  return data?.message || fallback || "PicWish background removal failed";
}

async function readPicWishJson(response: Response, context: string): Promise<PicWishSegmentationResponse> {
  const text = await response.text();
  const data = safeParseJson<PicWishSegmentationResponse>(text);
  if (!response.ok || !data) {
    throw new Error(getPicWishErrorMessage(data, `${context} returned ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`));
  }
  if (typeof data.status === "number" && data.status !== 200) {
    throw new Error(getPicWishErrorMessage(data, `${context} returned status ${data.status}`));
  }
  return data;
}

async function downloadUrlToBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PicWish result: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadPicWishImageAsTransparentPng(url: string, fallbackSize?: { width?: number; height?: number }): Promise<{ images: GeneratedImage[] }> {
  const buffer = await downloadUrlToBuffer(url);
  const normalized = await normalizeTransparentPng(buffer);
  const image = normalized.images[0];
  if (!image) return normalized;
  return {
    images: [{
      ...image,
      width: fallbackSize?.width || image.width,
      height: fallbackSize?.height || image.height,
    }],
  };
}

async function pollPicWishTask(taskType: PicWishVisualTaskType, taskId: string, apiKey: string, baseUrl: string): Promise<PicWishSegmentationResponse> {
  const endpoint = `${getPicWishTaskEndpoint(baseUrl, taskType)}/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), `PicWish ${taskType} polling`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType, endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    logPicWishEvent("poll", {
      taskType,
      endpoint,
      taskId,
      status: data.status,
      state: data.data?.state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (getPicWishResultImageUrl(data, taskType)) {
      logPicWishEvent("success", {
        taskType,
        endpoint,
        taskId,
        status: data.status,
        state: data.data?.state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return data;
    }
    if (data.data?.state && data.data.state < 0) {
      const message = getPicWishErrorMessage(data, `PicWish ${taskType} task failed`);
      logPicWishEvent("failure", { taskType, endpoint, taskId, status: data.status, state: data.data.state, progress: data.data.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType, endpoint, taskId, durationMs: Date.now() - startedAt, error: `PicWish ${taskType} timed out` });
  throw new Error(`PicWish ${taskType} timed out`);
}

async function pollPicWishWatermarkRemovalTask(taskId: string, apiKey: string, baseUrl: string): Promise<PicWishSegmentationResponse> {
  const endpoint = `${getPicWishWatermarkRemovalEndpoint(baseUrl)}/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), "PicWish watermark removal polling");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType: "watermark", endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    logPicWishEvent("poll", {
      taskType: "watermark",
      endpoint,
      taskId,
      status: data.status,
      state: data.data?.state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (getPicWishResultImageUrl(data, "watermark")) {
      logPicWishEvent("success", {
        taskType: "watermark",
        endpoint,
        taskId,
        status: data.status,
        state: data.data?.state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return data;
    }
    if (data.data?.state && data.data.state < 0) {
      const message = getPicWishErrorMessage(data, "PicWish watermark removal task failed");
      logPicWishEvent("failure", { taskType: "watermark", endpoint, taskId, status: data.status, state: data.data.state, progress: data.data.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType: "watermark", endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish watermark removal timed out" });
  throw new Error("PicWish watermark removal timed out");
}

async function runPicWishImageTask(
  taskType: PicWishVisualTaskType,
  buffer: Buffer,
  mimeType: string,
  options?: { maskBuffer?: Buffer; maskMimeType?: string; fields?: Record<string, string | number | boolean | undefined> },
): Promise<GeneratedImageResult> {
  const { apiKey, baseUrl } = getPicWishConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const body = new FormData();
  body.append("sync", "0");
  body.append("image_file", bufferToImageFile(buffer, mimeType));
  if (options?.maskBuffer) {
    body.append("mask_file", bufferToImageFile(options.maskBuffer, options.maskMimeType || "image/png"));
  }
  Object.entries(options?.fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.append(key, String(value));
  });

  const endpoint = getPicWishTaskEndpoint(baseUrl, taskType);
  const startedAt = Date.now();
  logPicWishEvent("request", { taskType, endpoint, hasMask: Boolean(options?.maskBuffer) });

  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), `PicWish ${taskType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType, endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: Boolean(options?.maskBuffer) });
    throw error;
  }

  const immediateResult = getPicWishResultImageUrl(created, taskType);
  const taskId = getPicWishTaskId(created);
  logPicWishEvent("created", {
    taskType,
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: Boolean(options?.maskBuffer),
  });
  const result = immediateResult
    ? created
    : taskId
      ? await pollPicWishTask(taskType, taskId, apiKey, baseUrl)
      : null;
  if (!result) {
    logPicWishEvent("failure", { taskType, endpoint, durationMs: Date.now() - startedAt, error: "PicWish did not return a task id", hasMask: Boolean(options?.maskBuffer) });
    throw new Error("PicWish did not return a task id");
  }
  const imageUrls = getPicWishResultImageUrls(result, taskType);
  if (imageUrls.length === 0) {
    logPicWishEvent("failure", { taskType, endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish did not return a result image", hasMask: Boolean(options?.maskBuffer) });
    throw new Error("PicWish did not return a result image");
  }
  logPicWishEvent("download", {
    taskType,
    endpoint: imageUrls[0],
    taskId: getPicWishTaskId(result) || taskId,
    durationMs: Date.now() - startedAt,
    width: result.data?.image_width,
    height: result.data?.image_height,
  });
  const resolvedTaskId = getPicWishTaskId(result) || taskId;
  const downloadedImages: GeneratedImage[] = [];
  for (const imageUrl of taskType === "r-background" ? imageUrls : imageUrls.slice(0, 1)) {
    const downloaded = await downloadPicWishImageAsTransparentPng(imageUrl, {
      width: result.data?.image_width,
      height: result.data?.image_height,
    });
    downloadedImages.push(...downloaded.images);
  }
  return withProviderTaskIds({ images: downloadedImages }, resolvedTaskId ? [resolvedTaskId] : []);
}

async function removeBackgroundWithPicWish(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  return runPicWishImageTask("segmentation", buffer, mimeType, {
    fields: {
      return_type: 1,
      output_type: 2,
      crop: 0,
      format: "png",
    },
  });
}

async function removeFaceWithPicWish(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  return runPicWishImageTask("self-face-cutout", buffer, mimeType);
}

async function createPicWishInpaintTask(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
    sync?: boolean;
  },
): Promise<{ taskId?: string; apiKey: string; baseUrl: string; created: PicWishSegmentationResponse; imageUrl?: string }> {
  const { apiKey, baseUrl } = getPicWishObjectsRemovalConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const endpoint = getPicWishObjectsRemovalEndpoint(baseUrl);
  const body = new FormData();
  body.append("sync", input.sync ? "1" : "0");
  body.append("return_type", "1");
  if (input.imageUrl) {
    body.append("image_url", input.imageUrl);
  } else if (input.imageBuffer) {
    body.append("image_file", bufferToImageFile(input.imageBuffer, input.imageMimeType || "image/png"));
  } else {
    throw new Error("Missing image source for PicWish inpaint");
  }
  if (input.maskUrl) {
    body.append("mask_url", input.maskUrl);
  } else if (input.maskBuffer) {
    body.append("mask_file", bufferToImageFile(input.maskBuffer, input.maskMimeType || "image/png"));
  } else if (input.rectangles) {
    body.append("rectangles", typeof input.rectangles === "string" ? input.rectangles : JSON.stringify(input.rectangles));
  } else {
    throw new Error("Missing removal area for PicWish inpaint");
  }

  const startedAt = Date.now();
  logPicWishEvent("request", { taskType: "inpaint", endpoint, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), "PicWish inpaint");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType: "inpaint", endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
    throw error;
  }

  const taskId = getPicWishTaskId(created);
  const imageUrl = getPicWishResultImageUrl(created, "inpaint");
  logPicWishEvent("created", {
    taskType: "inpaint",
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: Boolean(input.maskBuffer || input.maskUrl),
  });
  if (!taskId && !imageUrl) {
    logPicWishEvent("failure", {
      taskType: "inpaint",
      endpoint,
      status: created.status,
      durationMs: Date.now() - startedAt,
      error: "PicWish inpaint did not return a task id",
      hasMask: Boolean(input.maskBuffer || input.maskUrl),
    });
    throw new Error("PicWish inpaint did not return a task id");
  }
  return { taskId, apiKey, baseUrl, created, imageUrl };
}

async function pollPicWishInpaintTask(taskId: string, apiKey: string, baseUrl: string): Promise<{ images: GeneratedImage[] }> {
  const endpoint = `${getPicWishObjectsRemovalEndpoint(baseUrl)}/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (attempt > 0) await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), "PicWish inpaint polling");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    const state = Number(data.data?.state || 0);
    logPicWishEvent("poll", {
      taskType: "inpaint",
      endpoint,
      taskId,
      status: data.status,
      state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (state > 0) {
      const imageUrl = getPicWishResultImageUrl(data, "inpaint");
      if (state !== 1 && !imageUrl) continue;
      if (!imageUrl) {
        logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: "PicWish inpaint did not return a result image" });
        throw new Error("PicWish inpaint did not return a result image");
      }
      logPicWishEvent("success", {
        taskType: "inpaint",
        endpoint,
        taskId,
        status: data.status,
        state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      logPicWishEvent("download", {
        taskType: "inpaint",
        endpoint: imageUrl,
        taskId,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return downloadPicWishImageAsTransparentPng(imageUrl, {
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
    }
    if (state < 0) {
      const message = getPicWishErrorMessage(data, "PicWish inpaint task failed");
      logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish inpaint timed out" });
  throw new Error("PicWish inpaint timed out");
}

function appendOptionalPicWishNumber(body: FormData, key: string, value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  body.append(key, String(value));
}

export function __testNormalizePicWishExpansionRatio(value: unknown): number | undefined {
  const numberValue = coerceOptionalNumber(value);
  if (numberValue === undefined || numberValue <= 0) return undefined;
  return Math.min(1, Math.max(0, numberValue));
}

function hasPicWishExpansionMargins(input: { top?: number; bottom?: number; left?: number; right?: number }) {
  return [input.top, input.bottom, input.left, input.right].some(
    value => typeof value === "number" && Number.isFinite(value) && value > 0
  );
}

export const __testHasPicWishExpansionMargins = hasPicWishExpansionMargins;

async function createPicWishImageExpansionTask(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    sync?: boolean;
    prompt?: string;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    strength?: number;
    scale?: number;
    steps?: number;
    seed?: number;
  },
): Promise<{ taskId: string; apiKey: string; baseUrl: string; created: PicWishSegmentationResponse; imageUrl?: string }> {
  const { apiKey, baseUrl } = getPicWishConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const endpoint = getPicWishImageExpansionEndpoint(baseUrl);
  const body = new FormData();
  body.append("sync", input.sync ? "1" : "0");
  body.append("return_type", "1");
  if (input.imageUrl) {
    body.append("image_url", input.imageUrl);
  } else if (input.imageBuffer) {
    body.append("image_file", bufferToImageFile(input.imageBuffer, input.imageMimeType || "image/png"));
  } else {
    throw new Error("Missing image source for PicWish image expansion");
  }
  const top = __testNormalizePicWishExpansionRatio(input.top);
  const bottom = __testNormalizePicWishExpansionRatio(input.bottom);
  const left = __testNormalizePicWishExpansionRatio(input.left);
  const right = __testNormalizePicWishExpansionRatio(input.right);
  const hasExpansionMargins = hasPicWishExpansionMargins({ top, bottom, left, right });
  if (!hasExpansionMargins && input.maskUrl) {
    body.append("mask_url", input.maskUrl);
  } else if (!hasExpansionMargins && input.maskBuffer) {
    body.append("mask_file", bufferToImageFile(input.maskBuffer, input.maskMimeType || "image/png"));
  }
  if (input.prompt?.trim()) body.append("prompt", input.prompt.trim().slice(0, 500));
  if (hasExpansionMargins) {
    appendOptionalPicWishNumber(body, "top", top);
    appendOptionalPicWishNumber(body, "bottom", bottom);
    appendOptionalPicWishNumber(body, "left", left);
    appendOptionalPicWishNumber(body, "right", right);
  }
  appendOptionalPicWishNumber(body, "strength", input.strength);
  appendOptionalPicWishNumber(body, "scale", input.scale);
  appendOptionalPicWishNumber(body, "steps", input.steps);
  appendOptionalPicWishNumber(body, "seed", input.seed);

  const startedAt = Date.now();
  logPicWishEvent("request", { taskType: "advanced-image-expand", endpoint, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), "PicWish advanced-image-expand");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType: "advanced-image-expand", endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
    throw error;
  }

  const taskId = getPicWishTaskId(created);
  const imageUrl = getPicWishResultImageUrl(created, "advanced-image-expand");
  logPicWishEvent("created", {
    taskType: "advanced-image-expand",
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: Boolean(input.maskBuffer || input.maskUrl),
  });
  if (!taskId) {
    logPicWishEvent("failure", {
      taskType: "advanced-image-expand",
      endpoint,
      status: created.status,
      durationMs: Date.now() - startedAt,
      error: imageUrl
        ? "PicWish advanced-image-expand returned an image but no task id"
        : "PicWish advanced-image-expand did not return a task id",
      hasMask: Boolean(input.maskBuffer || input.maskUrl),
    });
    throw new Error("PicWish advanced-image-expand did not return a task id");
  }
  return { taskId, apiKey, baseUrl, created, imageUrl };
}

async function pollPicWishImageExpansionTask(taskId: string, apiKey: string, baseUrl: string): Promise<{ images: GeneratedImage[] }> {
  const endpoint = `${getPicWishImageExpansionEndpoint(baseUrl)}/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (attempt > 0) await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), "PicWish advanced-image-expand polling");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType: "advanced-image-expand", endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    const state = Number(data.data?.state || 0);
    logPicWishEvent("poll", {
      taskType: "advanced-image-expand",
      endpoint,
      taskId,
      status: data.status,
      state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (state === 1) {
      const imageUrl = getPicWishResultImageUrl(data, "advanced-image-expand");
      if (!imageUrl) {
        logPicWishEvent("failure", { taskType: "advanced-image-expand", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: "PicWish advanced-image-expand did not return a result image" });
        throw new Error("PicWish advanced-image-expand did not return a result image");
      }
      logPicWishEvent("success", {
        taskType: "advanced-image-expand",
        endpoint,
        taskId,
        status: data.status,
        state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      logPicWishEvent("download", {
        taskType: "advanced-image-expand",
        endpoint: imageUrl,
        taskId,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return downloadPicWishImageAsTransparentPng(imageUrl, {
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
    }
    if (state < 0) {
      const message = getPicWishErrorMessage(data, "PicWish advanced-image-expand task failed");
      logPicWishEvent("failure", { taskType: "advanced-image-expand", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType: "advanced-image-expand", endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish advanced-image-expand timed out" });
  throw new Error("PicWish advanced-image-expand timed out");
}

async function runPicWishImageExpansion(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    sync?: boolean;
    prompt?: string;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    strength?: number;
    scale?: number;
    steps?: number;
    seed?: number;
  },
): Promise<GeneratedImageResult> {
  const { taskId, apiKey, baseUrl, created, imageUrl } = await createPicWishImageExpansionTask(input);
  if (imageUrl) {
    const result = await downloadPicWishImageAsTransparentPng(imageUrl, {
      width: created.data?.image_width,
      height: created.data?.image_height,
    });
    return withProviderTaskIds(result, [taskId]);
  }
  const result = await pollPicWishImageExpansionTask(taskId, apiKey, baseUrl);
  return withProviderTaskIds(result, [taskId]);
}

async function eraseWithPicWish(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
    sync?: boolean;
  },
): Promise<GeneratedImageResult> {
  const { taskId, apiKey, baseUrl, created, imageUrl } = await createPicWishInpaintTask(input);
  if (imageUrl) {
    const result = await downloadPicWishImageAsTransparentPng(imageUrl, {
      width: created.data?.image_width,
      height: created.data?.image_height,
    });
    return withProviderTaskIds(result, taskId ? [taskId] : []);
  }
  if (!taskId) {
    throw new Error("PicWish inpaint did not return a task id");
  }
  const result = await pollPicWishInpaintTask(taskId, apiKey, baseUrl);
  return withProviderTaskIds(result, [taskId]);
}

async function createPicWishEraseMask(maskBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const erasePixels = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 4) {
    // The canvas eraser stores painted strokes as transparent pixels.
    if (data[index + 3] < 250) erasePixels[index / 4] = 1;
  }

  const expandedErasePixels = new Uint8Array(erasePixels);
  const expansionRadius = Math.max(2, Math.min(10, Math.round(Math.max(width, height) * 0.006)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!erasePixels[pixel]) continue;
      for (let dy = -expansionRadius; dy <= expansionRadius; dy += 1) {
        for (let dx = -expansionRadius; dx <= expansionRadius; dx += 1) {
          if ((dx * dx) + (dy * dy) > expansionRadius * expansionRadius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          expandedErasePixels[ny * width + nx] = 1;
        }
      }
    }
  }

  const providerMask = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < expandedErasePixels.length; pixel += 1) {
    const index = pixel * 4;
    const shouldErase = expandedErasePixels[pixel] === 1;
    // PicWish inpaint follows the documented mask contract:
    // white = remove area, black = preserve area.
    providerMask[index] = shouldErase ? 255 : 0;
    providerMask[index + 1] = shouldErase ? 255 : 0;
    providerMask[index + 2] = shouldErase ? 255 : 0;
    providerMask[index + 3] = 255;
  }

  const providerMaskBuffer = await sharp(providerMask, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
  return providerMaskBuffer;
}

async function createPicWishForegroundRemovalMask(
  foregroundBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(foregroundBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const removePixels = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 8) removePixels[index / 4] = 1;
  }

  const expandedRemovePixels = new Uint8Array(removePixels);
  const expansionRadius = Math.max(1, Math.min(6, Math.round(Math.max(width, height) * 0.003)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!removePixels[pixel]) continue;
      for (let dy = -expansionRadius; dy <= expansionRadius; dy += 1) {
        for (let dx = -expansionRadius; dx <= expansionRadius; dx += 1) {
          if ((dx * dx) + (dy * dy) > expansionRadius * expansionRadius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          expandedRemovePixels[ny * width + nx] = 1;
        }
      }
    }
  }

  const providerMask = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < expandedRemovePixels.length; pixel += 1) {
    const index = pixel * 4;
    const shouldRemove = expandedRemovePixels[pixel] === 1;
    providerMask[index] = shouldRemove ? 255 : 0;
    providerMask[index + 1] = shouldRemove ? 255 : 0;
    providerMask[index + 2] = shouldRemove ? 255 : 0;
    providerMask[index + 3] = 255;
  }

  return sharp(providerMask, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
}

export const __testCreatePicWishForegroundRemovalMask = createPicWishForegroundRemovalMask;

async function enhanceImageWithPicWish(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return runPicWishImageTask("scale", buffer, mimeType);
}

async function removeWatermarkWithPicWish(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  const { apiKey, baseUrl } = getPicWishConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const body = new FormData();
  body.append("sync", "0");
  body.append("file", bufferToImageFile(buffer, mimeType));

  const endpoint = getPicWishWatermarkRemovalEndpoint(baseUrl);
  const startedAt = Date.now();
  logPicWishEvent("request", { taskType: "watermark", endpoint, hasMask: false });

  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), "PicWish watermark removal");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType: "watermark", endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: false });
    throw error;
  }

  const immediateResult = getPicWishResultImageUrl(created, "watermark");
  const taskId = getPicWishTaskId(created);
  logPicWishEvent("created", {
    taskType: "watermark",
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: false,
  });

  const result = immediateResult
    ? created
    : taskId
      ? await pollPicWishWatermarkRemovalTask(taskId, apiKey, baseUrl)
      : null;
  if (!result) {
    logPicWishEvent("failure", { taskType: "watermark", endpoint, durationMs: Date.now() - startedAt, error: "PicWish watermark removal did not return a task id", hasMask: false });
    throw new Error("PicWish watermark removal did not return a task id");
  }

  const imageUrl = getPicWishResultImageUrl(result, "watermark");
  if (!imageUrl) {
    logPicWishEvent("failure", { taskType: "watermark", endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish watermark removal did not return a result image", hasMask: false });
    throw new Error("PicWish watermark removal did not return a result image");
  }

  logPicWishEvent("download", {
    taskType: "watermark",
    endpoint: imageUrl,
    taskId: getPicWishTaskId(result) || taskId,
    durationMs: Date.now() - startedAt,
    width: result.data?.image_width,
    height: result.data?.image_height,
  });
  const resolvedTaskId = getPicWishTaskId(result) || taskId;
  const downloaded = await downloadPicWishImageAsTransparentPng(imageUrl, {
    width: result.data?.image_width,
    height: result.data?.image_height,
  });
  return withProviderTaskIds(downloaded, resolvedTaskId ? [resolvedTaskId] : []);
}

function getBackgroundOutputSize(input: CreateBackgroundInput, fallbackWidth: number, fallbackHeight: number) {
  const customWidth = coerceTargetDimension(input.customWidth);
  const customHeight = coerceTargetDimension(input.customHeight);
  if (customWidth && customHeight) return { width: customWidth, height: customHeight };

  const baseLongSide = input.resolution === "4k" ? 3840 : 2048;
  const ratio = ratioToSize[input.ratio || "1:1"];
  if (ratio) {
    const aspect = ratio.width / Math.max(1, ratio.height);
    if (aspect >= 1) {
      return { width: baseLongSide, height: Math.max(1, Math.round(baseLongSide / aspect)) };
    }
    return { width: Math.max(1, Math.round(baseLongSide * aspect)), height: baseLongSide };
  }

  const aspect = fallbackWidth / Math.max(1, fallbackHeight);
  if (aspect >= 1) {
    return { width: baseLongSide, height: Math.max(1, Math.round(baseLongSide / aspect)) };
  }
  return { width: Math.max(1, Math.round(baseLongSide * aspect)), height: baseLongSide };
}

export function __testResolveSmartProductLayout(composition?: string, productScale?: string) {
  const scale = productScale === "small" || productScale === "large" ? productScale : "medium";
  const placement = composition === "left" || composition === "right" || composition === "bottom" || composition === "diagonal"
    ? composition
    : "center";
  const scaleLimits = {
    small: { width: 0.46, height: 0.54 },
    medium: { width: 0.66, height: 0.72 },
    large: { width: 0.82, height: 0.84 },
  } as const;
  const anchors = {
    center: { x: 0.5, y: 0.56 },
    left: { x: 0.12, y: 0.56 },
    right: { x: 0.88, y: 0.56 },
    bottom: { x: 0.5, y: 0.84 },
    diagonal: { x: 0.76, y: 0.24 },
  } as const;
  return { ...scaleLimits[scale], ...anchors[placement], composition: placement, productScale: scale };
}

async function prepareProductCutoutForBackgroundGenerator(
  cutoutSrc: string,
  outputWidth: number,
  outputHeight: number,
  composition?: string,
  productScale?: string,
): Promise<{ imageSrc: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const { buffer } = await imageSrcToBuffer(cutoutSrc);
  const normalizedCutout = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .png()
    .toBuffer();

  let productBuffer = normalizedCutout;
  try {
    const trimmed = await sharp(normalizedCutout, { limitInputPixels: false })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      .png()
      .toBuffer();
    const trimmedMetadata = await sharp(trimmed, { limitInputPixels: false }).metadata();
    if ((trimmedMetadata.width || 0) > 0 && (trimmedMetadata.height || 0) > 0) {
      productBuffer = trimmed;
    }
  } catch {
    productBuffer = normalizedCutout;
  }

  const layout = __testResolveSmartProductLayout(composition, productScale);
  const maxProductWidth = Math.max(1, Math.round(outputWidth * layout.width));
  const maxProductHeight = Math.max(1, Math.round(outputHeight * layout.height));
  const resized = await sharp(productBuffer, { limitInputPixels: false })
    .resize(maxProductWidth, maxProductHeight, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.max(0, Math.min(outputWidth - resized.info.width, Math.round((outputWidth - resized.info.width) * layout.x)));
  const top = Math.max(0, Math.min(outputHeight - resized.info.height, Math.round((outputHeight - resized.info.height) * layout.y)));
  const canvas = await sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized.data, left, top }])
    .png()
    .toBuffer();

  return {
    imageSrc: `data:image/png;base64,${canvas.toString("base64")}`,
    width: outputWidth,
    height: outputHeight,
  };
}

function buildSmartProductVariationPrompt(prompt: string, index: number, total: number) {
  if (total <= 1) return prompt;
  const directions = [
    "Use a clean hero composition with a distinct background structure, balanced props, and soft directional lighting.",
    "Use a premium editorial composition with different depth, surface material, camera angle, and background color rhythm.",
    "Use a lifestyle commercial composition with a different spatial layout, supporting props, light direction, and atmosphere.",
    "Use a minimalist studio composition with a different floor-wall relationship, shadow shape, and product staging.",
    "Use a bold campaign composition with a different backdrop geometry, accent color, and foreground-background contrast.",
    "Use a natural retail composition with a different scene depth, environmental texture, and photographic lighting setup.",
    "Use a refined catalog composition with a different prop arrangement, horizon height, and contact shadow direction.",
    "Use an immersive product-scene composition with a different perspective, background layering, and material palette.",
    "Use a polished ecommerce composition with a different scene arrangement, lighting mood, and visual hierarchy.",
  ];
  return [
    prompt,
    `Variation ${index + 1}/${total}: ${directions[index % directions.length]}`,
    "This variation must be visibly different from the other requested outputs while following the same user prompt. Keep the exact product unchanged.",
  ].join("\n");
}

export function __testBuildSmartProductPrompt(input: CreateBackgroundInput) {
  const userPrompt = input.prompt?.trim();
  const fallbackPrompt = input.style?.trim()
    ? `Create a clean commercial product background with ${input.style.trim()} marketplace visual polish.`
    : "Create a realistic clean commercial product background.";
  const hasBackgroundReference = Boolean(input.backgroundReferenceSrc?.trim());
  return [
    userPrompt || fallbackPrompt,
    userPrompt && input.style
      ? `补充风格标签：${input.style}。风格只能影响背景、道具和环境氛围；如与用户明确要求冲突，以用户明确要求为准。`
      : "",
    input.composition
      ? `用户选择的产品构图：${input.composition}。遵守该构图位置、留白和视觉重心；如与用户明确文字要求冲突，以用户明确要求为准。`
      : "",
    input.productScale
      ? `用户选择的产品占画面比例：${input.productScale}。保持产品完整可见，不得裁切或遮挡。`
      : "",
    hasBackgroundReference
      ? "A background reference image was provided by the user, but the written prompt is the main requirement. Follow the requested scene, mood, lighting, perspective, material texture, spatial depth, and commercial photography feel."
      : "Create a realistic commercial background around the product. Match the requested scene, lighting, shadows, perspective, depth, and contact shadow naturally.",
    "The transparent product PNG is the protected foreground subject. Do not change the product pixels, logo, text, shape, material, color, or proportions.",
    "Return one complete product commercial image with the requested scene clearly visible. Do not crop, distort, redraw, recolor, or reinterpret the product.",
  ].filter(Boolean).join("\n");
}

async function createBackgroundWithPicWish(input: CreateBackgroundInput): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(input.imageSrc);
  const batchSize = Math.max(1, Math.min(Number(input.count) || 1, 2));
  const prompt = [
    input.prompt || "为产品图生成干净、真实、商业化的背景，保持产品主体完整清晰。",
    "Generate only the background scene around the transparent product PNG.",
    "Keep the original product intact and unchanged. Match lighting, perspective, scale, and contact shadows naturally.",
  ].filter(Boolean).join("\n");

  return runPicWishImageTask("r-background", buffer, mimeType, {
    fields: {
      ...(input.sceneType ? { scene_type: input.sceneType } : { prompt }),
      negative_prompt:
        "changed product, distorted product, altered logo, altered text, cropped product, extra product, duplicate product, blurry product, low quality background",
      batch_size: batchSize,
      width: input.customWidth,
      height: input.customHeight,
    },
  });
}

async function getImageBufferDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  return {
    width: metadata.width || 1024,
    height: metadata.height || 1024,
  };
}

export async function __testPreparePicWishEraseSourceImage(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

export async function __testCompositeSourcePreservingImageEdit(
  sourceBuffer: Buffer,
  editedBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const [sourcePixels, editedPixels, maskPixels] = await Promise.all([
    sharp(sourceBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(editedBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(maskBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  const output = Buffer.alloc(width * height * 4);
  for (let index = 0; index < output.length; index += 4) {
    const preserveWeight = maskPixels[index + 3] / 255;
    const editWeight = 1 - preserveWeight;
    for (let channel = 0; channel < 4; channel += 1) {
      output[index + channel] = Math.round(
        sourcePixels[index + channel] * preserveWeight +
        editedPixels[index + channel] * editWeight
      );
    }
  }
  return sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
}

async function createLocalEditGuideImage(
  sourceBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const [sourcePixels, maskPixels] = await Promise.all([
    sharp(sourceBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(maskBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  const output = Buffer.from(sourcePixels);

  for (let index = 0; index < output.length; index += 4) {
    const editableWeight = 1 - maskPixels[index + 3] / 255;
    if (editableWeight <= 0.02) continue;
    const overlayWeight = Math.min(0.62, 0.38 + editableWeight * 0.24);
    output[index] = Math.round(sourcePixels[index] * (1 - overlayWeight) + 255 * overlayWeight);
    output[index + 1] = Math.round(sourcePixels[index + 1] * (1 - overlayWeight) + 91 * overlayWeight);
    output[index + 2] = Math.round(sourcePixels[index + 2] * (1 - overlayWeight) + 46 * overlayWeight);
  }

  return sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
}

// VOD 参考图生成中支持 mask 蒙版编辑的模型（白=编辑区）。
// VOD AIGC 的 CreateImageTask 接口本身支持 ReferenceType: "mask"，理论上所有 VOD 模型
// 都能传入蒙版参考图做局部编辑；各模型对蒙版的理解能力不同，这里统一放开，
// 由 fallback 机制自动挑选效果最好的模型。
function isVodMaskEditModel(modelId: string): boolean {
  return modelId.startsWith("vod-");
}

// 二维 box-max（形态学膨胀）：白色(255) 像素会把周边 radius 像素内的邻居"染白"。
// 用于把蒙版白色（编辑）区域向外扩展，避免紧贴物体轮廓导致补丁感/错位。
function boxDilateBinary(
  singleChannel: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return singleChannel;
  const horizontal = new Uint8Array(singleChannel.length);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    const deque: number[] = [];
    for (let right = 0; right < width; right++) {
      const value = singleChannel[base + right];
      while (deque.length > 0 && singleChannel[base + deque[deque.length - 1]] <= value) deque.pop();
      deque.push(right);
      while (deque.length > 0 && deque[0] < right - 2 * radius) deque.shift();
      const outX = right - radius;
      if (outX >= 0) horizontal[base + outX] = singleChannel[base + deque[0]];
    }
  }
  const output = new Uint8Array(singleChannel.length);
  for (let x = 0; x < width; x++) {
    const deque: number[] = [];
    for (let bottom = 0; bottom < height; bottom++) {
      const value = horizontal[bottom * width + x];
      while (deque.length > 0 && horizontal[deque[deque.length - 1] * width + x] <= value) deque.pop();
      deque.push(bottom);
      while (deque.length > 0 && deque[0] < bottom - 2 * radius) deque.shift();
      const outY = bottom - radius;
      if (outY >= 0) output[outY * width + x] = horizontal[deque[0] * width + x];
    }
  }
  return output;
}

// 生成给 VOD OG 蒙版编辑用的 mask（白色=编辑区、黑色=保留区）。
// 前端注释 mask 语义为「透明=编辑区、不透明=保留区」，此处做反相并输出 PNG。
// mode="add"（加物体）：编辑区向上扩展约 45% 高度作为新物体（帽子/头饰）的生成空间，
// 并整体膨胀+羽化，让 OG 生成的新物体有足够区域并自然融合（否则只涂头顶会生硬塞入）。
// mode="edit"（换色/换材质）：只做轻度膨胀+羽化，避免编辑溢出到目标区域之外。
async function createOgdEditMaskDataUrl(
  maskBuffer: Buffer,
  width: number,
  height: number,
  mode: "add" | "edit" = "edit",
  editPrompt: string = "",
): Promise<{ dataUrl: string; compositeMaskBuffer: Buffer }> {
  const sharp = (await import("sharp")).default;
  const maskPixels = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const editBinary = new Uint8Array(width * height); // 1 = 可编辑
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (maskPixels[index + 3] < 250) { // 透明 = 编辑区
        editBinary[y * width + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 按请求类型动态选择 mask 扩展策略：帽子需要较大空间，眼镜/小配饰必须保守避免覆盖脸部。
  const promptLower = editPrompt.toLowerCase();
  const isHatRequest = /(帽|hat\b|cap\b|bonnet|visor|headwear|头饰|贝雷帽|鸭舌帽|针织帽|棒球帽|毛线帽)/i.test(editPrompt);
  const isGlassesRequest = /(眼镜|glasses|sunglasses|墨镜|goggles|镜框|镜片|一副眼镜|一副墨镜)/i.test(editPrompt);
  let finalBinary: Uint8Array = editBinary;
  if (maxX >= 0 && maxY >= 0) {
    if (mode === "add") {
      let extendRatioX = 0.12;
      let extendRatioY = 0.12;
      if (isHatRequest) {
        // 帽子：上下左右各扩展 20%，向下贴发际线、向上给帽顶、左右防截断
        extendRatioX = 0.20;
        extendRatioY = 0.20;
      } else if (isGlassesRequest) {
        // 眼镜：只轻微扩展 8%，避免覆盖眼睛/鼻梁/脸颊导致脸部变形
        extendRatioX = 0.08;
        extendRatioY = 0.08;
      }
      const extendY = Math.max(6, Math.ceil((maxY - minY) * extendRatioY));
      const extendX = Math.max(6, Math.ceil((maxX - minX) * extendRatioX));
      const newMinY = Math.max(0, minY - extendY);
      const newMaxY = Math.min(height - 1, maxY + extendY);
      const newMinX = Math.max(0, minX - extendX);
      const newMaxX = Math.min(width - 1, maxX + extendX);
      for (let y = newMinY; y <= newMaxY; y++) {
        for (let x = newMinX; x <= newMaxX; x++) {
          editBinary[y * width + x] = 1;
        }
      }
    }
    // 膨胀：编辑区向外扩展，避免紧贴轮廓导致补丁感
    const expandRadius = mode === "add"
      ? (isHatRequest ? 18 : isGlassesRequest ? 5 : 10)
      : 10;
    finalBinary = boxDilateBinary(editBinary, width, height, expandRadius);
  }

  const output = Buffer.alloc(width * height * 4);
  for (let index = 0; index < output.length; index += 4) {
    const value = finalBinary[index / 4] * 255;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  // 羽化：Gaussian blur 让硬边界变软，避免生成后一圈接缝
  const feather = mode === "add"
    ? (isHatRequest ? 8 : isGlassesRequest ? 4 : 5)
    : 5;
  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })
    .blur(feather)
    .png()
    .toBuffer();

  // 供后端合成用的 alpha 语义蒙版：编辑区 = 透明(alpha 0)，保留区 = 不透明(alpha 255)。
  // VOD 是在「扩展后的编辑区」内绘制新物体的，合成时必须使用这份扩展蒙版，
  // 否则用用户原始涂抹的小块蒙版会把生成出来的新物体（帽子/眼镜）擦掉、贴回原图。
  const compositeRaw = Buffer.alloc(width * height * 4);
  for (let index = 0; index < compositeRaw.length; index += 4) {
    const isEdit = finalBinary[index / 4] === 1;
    compositeRaw[index] = 0;
    compositeRaw[index + 1] = 0;
    compositeRaw[index + 2] = 0;
    compositeRaw[index + 3] = isEdit ? 0 : 255;
  }
  const compositeMaskBuffer = await sharp(compositeRaw, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })
    .blur(feather)
    .png()
    .toBuffer();

  return {
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    compositeMaskBuffer,
  };
}

async function hasVisibleLocalEdit(
  sourceBuffer: Buffer,
  editedBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number,
  options?: {
    pixelDifferenceThreshold?: number;
    minChangedPixels?: number;
    minChangedRatio?: number;
  },
): Promise<boolean> {
  const sharp = (await import("sharp")).default;
  const [sourcePixels, editedPixels, maskPixels] = await Promise.all([
    sharp(sourceBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(editedBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(maskBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  let editablePixels = 0;
  let visiblyChangedPixels = 0;

  const pixelDiffThreshold = options?.pixelDifferenceThreshold ?? 24;
  const minChanged = options?.minChangedPixels ?? 24;
  const minRatio = options?.minChangedRatio ?? 0.001;

  for (let index = 0; index < sourcePixels.length; index += 4) {
    if (maskPixels[index + 3] > 127) continue;
    editablePixels += 1;
    const difference =
      Math.abs(sourcePixels[index] - editedPixels[index]) +
      Math.abs(sourcePixels[index + 1] - editedPixels[index + 1]) +
      Math.abs(sourcePixels[index + 2] - editedPixels[index + 2]);
    if (difference >= pixelDiffThreshold) visiblyChangedPixels += 1;
  }

  return visiblyChangedPixels >= Math.max(minChanged, Math.ceil(editablePixels * minRatio));
}

export function __testAssertSourcePreservingMask(
  operation: string | undefined,
  maskSrc: string | undefined,
) {
  if (operation === "text_edit" && !maskSrc?.trim()) {
    throw new Error("未能定位原图文字区域，请关闭窗口后重新提取文案再试");
  }
  if (operation === "annotation_edit" && !maskSrc?.trim()) {
    throw new Error("未能定位智能注释区域，请重新添加注释后再试");
  }
}

function coerceCameraAxis(value: unknown, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function buildCameraViewEditInstruction(input: EditImageInput) {
  const view = input.cameraView || {};
  const x = coerceCameraAxis(view.x, -180, 180);
  const y = coerceCameraAxis(view.y, -75, 75);
  const z = coerceCameraAxis(view.z, -60, 60);
  const note = typeof view.prompt === "string" ? view.prompt.trim() : "";
  return [
    "This is a generative camera-view reconstruction, not a local image edit.",
    "Maximize the requested camera viewpoint change while keeping the same objects present in the scene.",
    // 注意：这里绝对不能出现 "fixed scene / fixed background objects" 这类措辞。
    // 那会和下面「整个场景一起转」的约束直接矛盾，模型会取省力解 —— 只转主体、背景保持原样。
    // 正确表述是「同一批物体（identity 锁定）」，而不是「画面固定」。
    "The source image defines WHICH things exist: same subject/product identity, same set of background objects and props, same materials, same colors, same clothing/packaging, same lighting setup, same mood. It does NOT define the viewing angle.",
    `Target camera controls: X horizontal orbit ${x} degrees, Y vertical pitch ${y} degrees, Z camera distance ${z} percent.`,
    // 关键约束：必须把整个场景当成刚性 3D 空间一起转。
    // 只写 "fixed scene / fixed background" 会被模型理解成「背景像素别动」，
    // 导致只有主体换了角度、背景仍是原视角，主体与环境透视割裂（贴图感）。
    "CRITICAL — THE ENTIRE SCENE ROTATES TOGETHER: Treat the source image as a real 3D space where the subject, ground plane, walls, background objects, and props are all physical entities at fixed positions in that space.",
    "The camera orbits around this whole space. Therefore the subject AND the background must change viewpoint together, obeying one single consistent perspective with a shared vanishing point and a shared horizon line.",
    "The background must NEVER stay at its original angle. Whatever angle the subject rotates by, the background, ground, walls, and environment lines must rotate by exactly the same angle. A rotated subject composited against a front-facing background is strictly forbidden and looks like a pasted cutout.",
    "What stays locked is WHICH objects exist and how they look, NOT the angle they are viewed from. Same objects, same materials, same colors, same lighting setup — but seen from the new camera position.",
    "Only change the camera position, lens direction, perspective, occlusion, visible sides, contact shadows, and spatial depth according to the target X/Y/Z controls.",
    // 「不要改背景」必须限定成「不要换成别的背景」，否则又会被读成「背景别动」。
    "Do not swap in a different location, do not remove or add props, do not redesign the environment into something else, and do not change clothing/product/package details. Re-rendering the SAME environment from the new camera angle is required, not a violation.",
    "Reconstruct newly visible sides, back-facing surfaces, occlusion, perspective, contact shadows, and background depth so the result looks like the same scene photographed from a different camera position.",
    "Background areas that were previously hidden must be plausibly reconstructed from the new camera position, and areas that rotate out of frame should naturally leave the frame.",
    "Lighting must stay physically consistent with the rotated space: light sources keep their original position in the 3D scene, so shadows and highlights shift accordingly rather than staying pinned to the old view.",
    "Keep one single consistent subject and one single consistent scene. Do not create duplicates, mirrored collages, unrelated people/products, a pasted cutout look, or a newly imagined scene.",
    note ? `User additional direction: ${note}` : "",
  ].filter(Boolean).join("\n");
}

const PICWISH_MAX_INPUT_BYTES = 4.8 * 1024 * 1024;
const PICWISH_MAX_INPUT_SIDE = 4096;
const IMAGE_PROVIDER_REFERENCE_MAX_SIDE = 1536;
const IMAGE_PROVIDER_REFERENCE_MAX_BYTES = 1.8 * 1024 * 1024;

async function prepareImageProviderReferenceDataUrl(
  buffer: Buffer,
  mimeType = "image/png",
): Promise<string> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  const sourceWidth = Math.max(1, metadata.width || 1);
  const sourceHeight = Math.max(1, metadata.height || 1);
  const scale = Math.min(1, IMAGE_PROVIDER_REFERENCE_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const normalizedMimeType = mimeType.toLowerCase();

  if (
    scale === 1 &&
    buffer.length <= IMAGE_PROVIDER_REFERENCE_MAX_BYTES &&
    /png|jpe?g|webp/.test(normalizedMimeType)
  ) {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  for (const quality of [88, 82, 76, 70]) {
    const output = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (output.length <= IMAGE_PROVIDER_REFERENCE_MAX_BYTES || quality === 70) {
      return `data:image/jpeg;base64,${output.toString("base64")}`;
    }
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function __testPreparePicWishExpansionSourceImage(
  buffer: Buffer,
  mimeType = "image/png",
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  const sourceWidth = Math.max(1, metadata.width || 1);
  const sourceHeight = Math.max(1, metadata.height || 1);
  const scale = Math.min(1, PICWISH_MAX_INPUT_SIDE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const shouldResize = width !== sourceWidth || height !== sourceHeight;
  const normalizedMimeType = mimeType.toLowerCase();

  if (!shouldResize && buffer.length <= PICWISH_MAX_INPUT_BYTES && /png|jpe?g/.test(normalizedMimeType)) {
    return { buffer, mimeType, width, height };
  }

  for (const quality of [94, 90, 86, 82, 78, 72]) {
    const output = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (output.length <= PICWISH_MAX_INPUT_BYTES || quality === 72) {
      return { buffer: output, mimeType: "image/jpeg", width, height };
    }
  }

  throw new Error("PicWish image expansion source preparation failed");
}

async function preparePicWishExpansionMask(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

function getEditSizeForAspect(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  if (aspect > 1.2) return "1536x1024";
  if (aspect < 0.85) return "1024x1536";
  return "1024x1024";
}

function coerceTargetDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

export function __testResolveHighDefinitionTargetSize(
  requestedWidth: unknown,
  requestedHeight: unknown,
  sourceWidth: number,
  sourceHeight: number,
) {
  const sourceW = Math.max(1, Math.round(sourceWidth || 1));
  const sourceH = Math.max(1, Math.round(sourceHeight || 1));
  let width = coerceTargetDimension(requestedWidth) || sourceW;
  let height = coerceTargetDimension(requestedHeight) || sourceH;

  if (width < sourceW || height < sourceH) {
    const sourceScale = Math.max(sourceW / width, sourceH / height);
    width = Math.round(width * sourceScale);
    height = Math.round(height * sourceScale);
  }

  const longSide = Math.max(width, height);
  if (longSide < MIN_AI_IMAGE_OUTPUT_LONG_SIDE) {
    const hdScale = MIN_AI_IMAGE_OUTPUT_LONG_SIDE / longSide;
    width = Math.round(width * hdScale);
    height = Math.round(height * hdScale);
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function coerceOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export async function __testNormalizeGeneratedImagesToTargetAspect(
  images: GeneratedImage[],
  targetWidth: number,
  targetHeight: number,
): Promise<GeneratedImage[]> {
  const sharp = (await import("sharp")).default;

  return Promise.all(images.map(async (image) => {
    const { buffer } = await imageSrcToBuffer(image.src);
    const png = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize(targetWidth, targetHeight, {
        fit: "cover",
        position: "centre",
      })
      .png()
      .toBuffer();

    return {
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: targetWidth,
      height: targetHeight,
    };
  }));
}

function pixelDistance(data: Buffer, index: number, color: [number, number, number]) {
  const dr = data[index] - color[0];
  const dg = data[index + 1] - color[1];
  const db = data[index + 2] - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function detectDominantEdgeColor(data: Buffer, width: number, height: number): [number, number, number] {
  const histogram = new Map<string, { count: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 8) return;
    const key = `${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`;
    const item = histogram.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    item.count += 1;
    item.r += data[index];
    item.g += data[index + 1];
    item.b += data[index + 2];
    histogram.set(key, item);
  };

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    add(width - 1, y);
  }

  let dominant: { count: number; r: number; g: number; b: number } | undefined;
  for (const item of Array.from(histogram.values())) {
    if (!dominant || item.count > dominant.count) dominant = item;
  }
  if (!dominant || dominant.count === 0) return [255, 255, 255];
  return [
    Math.round(dominant.r / dominant.count),
    Math.round(dominant.g / dominant.count),
    Math.round(dominant.b / dominant.count),
  ];
}

function createConnectedEdgeBackgroundMask(data: Buffer, width: number, height: number, threshold = 42) {
  const backgroundColor = detectDominantEdgeColor(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const index = pixel * 4;
    if (data[index + 3] < 8 || pixelDistance(data, index, backgroundColor) <= threshold) {
      visited[pixel] = 1;
      queue.push(pixel);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return visited;
}

function createConnectedMaskFromEdgeCandidates(candidates: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel] || !candidates[pixel]) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return visited;
}

function createForegroundProtectionMaskFromAlpha(alphaAt: (pixel: number) => number, width: number, height: number) {
  const totalPixels = width * height;
  const foreground = new Uint8Array(totalPixels);
  const likelyForegroundThreshold = 72;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (alphaAt(pixel) >= likelyForegroundThreshold) foreground[pixel] = 1;
  }

  const closeRadius = Math.max(2, Math.min(6, Math.round(Math.max(width, height) / 280)));
  const closed = erodeBinaryMask(dilateBinaryMask(foreground, width, height, closeRadius), width, height, Math.max(1, closeRadius - 1));
  const inverse = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    inverse[pixel] = closed[pixel] ? 0 : 1;
  }

  const edgeBackground = createConnectedMaskFromEdgeCandidates(inverse, width, height);
  const protectedForeground = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    protectedForeground[pixel] = edgeBackground[pixel] ? 0 : 1;
  }

  return dilateBinaryMask(protectedForeground, width, height, 1);
}

function dilateBinaryMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask);
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;

      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let nextY = minY; nextY <= maxY; nextY += 1) {
        for (let nextX = minX; nextX <= maxX; nextX += 1) {
          const dx = nextX - x;
          const dy = nextY - y;
          if (dx * dx + dy * dy <= radiusSquared) output[nextY * width + nextX] = 1;
        }
      }
    }
  }

  return output;
}

function erodeBinaryMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask);
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      let keep = true;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let nextY = minY; nextY <= maxY && keep; nextY += 1) {
        for (let nextX = minX; nextX <= maxX; nextX += 1) {
          const dx = nextX - x;
          const dy = nextY - y;
          if (dx * dx + dy * dy > radiusSquared) continue;
          if (!mask[nextY * width + nextX]) {
            keep = false;
            break;
          }
        }
      }
      if (!keep) output[pixel] = 0;
    }
  }

  return output;
}

function clearNearTransparentPixels(data: Buffer, alphaThreshold = 20) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > alphaThreshold) continue;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
  }
}

async function returnOriginalImageAsTransparentPng(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;

  const png = await sharp(data, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function removeBackgroundByConservativeEdgeColor(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const output = Buffer.from(data);
  const backgroundMask = createConnectedEdgeBackgroundMask(output, width, height, 58);

  let transparentPixels = 0;
  for (let pixel = 0; pixel < backgroundMask.length; pixel += 1) {
    if (!backgroundMask[pixel]) continue;
    output[pixel * 4 + 3] = 0;
    transparentPixels += 1;
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / (width * height) < 0.01) {
    throw new Error("Edge-color fallback did not find removable background");
  }

  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function applyConservativeAlphaMaskToOriginalImage(originalBuffer: Buffer, maskPngBuffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: maskData } = await sharp(maskPngBuffer, { limitInputPixels: false })
    .rotate()
    .resize(originalInfo.width, originalInfo.height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = originalInfo.width;
  const height = originalInfo.height;
  const totalPixels = width * height;
  const output = Buffer.from(originalData);
  const backgroundCandidates = new Uint8Array(totalPixels);
  for (let index = 0; index < maskData.length; index += 4) {
    const pixel = index / 4;
    if (maskData[index + 3] <= 112) backgroundCandidates[pixel] = 1;
  }
  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => maskData[pixel * 4 + 3],
    width,
    height,
  );
  const edgeBackground = createConnectedEdgeBackgroundMask(originalData, width, height, 58);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (!foregroundProtection[pixel] && edgeBackground[pixel]) backgroundCandidates[pixel] = 1;
    if (foregroundProtection[pixel]) backgroundCandidates[pixel] = 0;
  }
  const connectedBackground = createConnectedMaskFromEdgeCandidates(backgroundCandidates, width, height);
  const hardBackground = erodeBinaryMask(connectedBackground, width, height, 1);
  const featherBackground = dilateBinaryMask(hardBackground, width, height, 1);
  let transparentPixels = 0;
  for (let index = 0; index < output.length; index += 4) {
    const pixel = index / 4;
    if (hardBackground[pixel]) {
      output[index + 3] = 0;
      transparentPixels += 1;
    } else if (!foregroundProtection[pixel] && featherBackground[pixel] && maskData[index + 3] < 240) {
      output[index + 3] = Math.min(originalData[index + 3], Math.max(64, maskData[index + 3]));
    } else {
      output[index + 3] = originalData[index + 3];
    }
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / totalPixels < 0.03) {
    console.warn("Background removal produced little transparent area; using edge-color fallback");
    return removeBackgroundByConservativeEdgeColor(originalBuffer);
  }

  const png = await sharp(output, {
    raw: { width: originalInfo.width, height: originalInfo.height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: originalInfo.width,
      height: originalInfo.height,
    }],
  };
}

async function normalizeTransparentPng(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const png = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: info.width,
      height: info.height,
    }],
  };
}

async function combineForegroundAlphaFromCutouts(originalBuffer: Buffer, cutoutBuffers: Buffer[]): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = originalInfo.width;
  const height = originalInfo.height;
  const output = Buffer.from(originalData);
  const totalPixels = width * height;
  const combinedAlpha = new Uint8Array(totalPixels);

  for (const cutoutBuffer of cutoutBuffers) {
    const { data: cutoutData } = await sharp(cutoutBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let pixel = 0; pixel < totalPixels; pixel += 1) {
      const alpha = cutoutData[pixel * 4 + 3];
      if (alpha > combinedAlpha[pixel]) combinedAlpha[pixel] = alpha;
    }
  }

  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => combinedAlpha[pixel],
    width,
    height,
  );
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * 4;
    const alpha = Math.max(combinedAlpha[pixel], foregroundProtection[pixel] ? Math.min(255, combinedAlpha[pixel] + 18) : 0);
    output[index + 3] = alpha < 12 ? 0 : alpha;
  }
  clearNearTransparentPixels(output, 12);

  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function removeBackgroundWithQualityCutout(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  const cutoutBuffers: Buffer[] = [];
  const segmentation = await removeBackgroundWithPicWish(buffer, mimeType);
  const providerTaskIds = collectProviderTaskIds(segmentation);
  const segmentationSrc = segmentation.images[0]?.src;
  if (segmentationSrc) {
    cutoutBuffers.push((await imageSrcToBuffer(segmentationSrc)).buffer);
  }

  try {
    const faceCutout = await removeFaceWithPicWish(buffer, mimeType);
    providerTaskIds.push(...collectProviderTaskIds(faceCutout));
    const faceSrc = faceCutout.images[0]?.src;
    if (faceSrc) cutoutBuffers.push((await imageSrcToBuffer(faceSrc)).buffer);
  } catch (faceError) {
    console.warn("PicWish face cutout enhancement failed; using segmentation cutout only", faceError);
  }

  if (cutoutBuffers.length === 0) return segmentation;
  const combined = await combineForegroundAlphaFromCutouts(buffer, cutoutBuffers);
  return withProviderTaskIds(combined, providerTaskIds);
}

async function applyRawAlphaMaskToOriginalImage(originalBuffer: Buffer, alphaMaskBuffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = originalInfo.width * originalInfo.height;
  if (alphaMaskBuffer.length !== totalPixels) {
    throw new Error(`Unexpected alpha mask size: ${alphaMaskBuffer.length}`);
  }

  const width = originalInfo.width;
  const height = originalInfo.height;
  const output = Buffer.from(originalData);
  const backgroundCandidates = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (alphaMaskBuffer[pixel] <= 112) backgroundCandidates[pixel] = 1;
  }
  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => alphaMaskBuffer[pixel],
    width,
    height,
  );
  const edgeBackground = createConnectedEdgeBackgroundMask(originalData, width, height, 58);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (!foregroundProtection[pixel] && edgeBackground[pixel]) backgroundCandidates[pixel] = 1;
    if (foregroundProtection[pixel]) backgroundCandidates[pixel] = 0;
  }
  const connectedBackground = createConnectedMaskFromEdgeCandidates(backgroundCandidates, width, height);
  const hardBackground = erodeBinaryMask(connectedBackground, width, height, 1);
  const featherBackground = dilateBinaryMask(hardBackground, width, height, 1);

  let transparentPixels = 0;
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * 4;
    if (hardBackground[pixel]) {
      output[index + 3] = 0;
      transparentPixels += 1;
    } else if (!foregroundProtection[pixel] && featherBackground[pixel] && alphaMaskBuffer[pixel] < 240) {
      output[index + 3] = Math.min(originalData[index + 3], Math.max(64, alphaMaskBuffer[pixel]));
    } else {
      output[index + 3] = originalData[index + 3];
    }
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / totalPixels < 0.03) {
    console.warn("Raw alpha mask did not remove enough background; using edge-color fallback");
    return removeBackgroundByConservativeEdgeColor(originalBuffer);
  }

  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function removeBackgroundPreservingForegroundPixels(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);

  try {
    return await withTimeout(
      removeBackgroundWithQualityCutout(buffer, mimeType),
      REMOVE_BACKGROUND_PICWISH_TIMEOUT_MS,
      "PicWish quality background removal timed out",
    );
  } catch (picWishError) {
    console.warn("PicWish quality background removal failed, using edge-color fallback", picWishError);
    try {
      return await removeBackgroundByConservativeEdgeColor(buffer);
    } catch (fallbackError) {
      console.warn("Edge-color background removal failed, preserving original image", fallbackError);
      return returnOriginalImageAsTransparentPng(buffer);
    }
  }
}

async function removeBackgroundWithPurePicWish(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return withTimeout(
    removeBackgroundWithPicWish(buffer, mimeType),
    REMOVE_BACKGROUND_PICWISH_TIMEOUT_MS,
    "PicWish background removal timed out",
  );
}

async function imageSrcToFile(src: string): Promise<File> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return bufferToImageFile(buffer, mimeType);
}

async function pollAsyncImageTask(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  maxAttempts = 150,
): Promise<ImageGenerationResponse> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const apiRoot = `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}`;
  const endpoints = [
    `${apiRoot}/async-images/${encodeURIComponent(taskId)}`,
    `${apiRoot}/images/generations/${encodeURIComponent(taskId)}`,
    `${apiRoot}/async/images/generations/${encodeURIComponent(taskId)}`,
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let lastError = "";
    let sawActiveTask = false;
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: getImageProviderJsonHeaders(apiKey),
      });

      const text = await response.text();
      const data = safeParseJson<AsyncImageTaskResponse>(text) || {};
      const normalizedTask = normalizeAsyncTaskResult(data);
      const status = (normalizedTask.status || "").toLowerCase();

      if (!response.ok) {
        lastError = normalizedTask.error || `Image polling returned ${response.status}`;
        if (response.status === 404) continue;
        throw new Error(lastError);
      }

      if (status === "failed" || status === "error") {
        throw new Error(normalizedTask.error || "Image generation failed");
      }

      if (normalizedTask.result) {
        const resultImages = extractGeneratedImages(normalizedTask.result, baseUrl, 1, 1);
        if (resultImages.length > 0 || status === "succeeded" || status === "completed" || status === "success") {
          return normalizedTask.result;
        }
      }

      if (status && status !== "queued" && status !== "processing" && status !== "pending" && status !== "running") {
        throw new Error(`Unexpected image task status: ${status}`);
      }

      if (status === "queued" || status === "processing" || status === "pending" || status === "running") {
        sawActiveTask = true;
        break;
      }
    }

    if (sawActiveTask) continue;

    if (lastError && attempt === 0 && !/404/.test(lastError)) {
      throw new Error(lastError);
    }
  }

  throw new Error("Image generation timed out");
}

function resolveSmartAnnotationEditModel(requestedModel: string | undefined, configuredModel: string) {
  const requested = (requestedModel || "").trim();
  // 前端可能把画布模型选择器里的 chat 类模型（如 gemini-3.5-flash-preview）传给智能注释，
  // 但 chat 模型不能做「参考图编辑」，直接视为未指定，回落到默认参考图模型。
  if (!requested || requested.toLowerCase() === "auto" || requested === "gpt-image-2" || isChatCompatibleImageModel(requested)) {
    return DEFAULT_IMAGE_MODEL_ID;
  }
  return requested || configuredModel || DEFAULT_IMAGE_MODEL_ID;
}

/**
 * 判断智能注释请求类型。模型选择与蒙版扩展策略共用同一份判断，
 * 避免两处正则各写一套导致结果打架（例如换色时模型走 GEM 但蒙版却按新增物件大幅扩展）。
 * - add-object：凭空新增物件（帽子/眼镜/道具），OG 更擅长；蒙版要大扩展给新物体留空间
 * - edit-property：改已有内容（换色/换材质/修瑕疵），GEM 更擅长；蒙版只轻度膨胀避免溢出
 * - unknown：判断不出，按新增物件处理
 */
/**
 * 从带系统前缀的 prompt 中剥离出用户真实请求。
 * prompt 实际形如「大段系统约束……\n用户修改建议：给她戴个皇冠」，
 * 系统前缀里充满「禁止把画面改成新的场景」「最小必要修改」「颜色、风格保持不变」这类措辞，
 * 直接拿整段做意图判断一定会被带偏，所以必须先切出用户那句。
 */
function extractUserRequest(prompt: string): string {
  const markers = ["用户修改建议：", "用户修改建议:", "User request:", "用户请求：", "用户请求:"];
  for (const marker of markers) {
    const index = (prompt || "").lastIndexOf(marker);
    if (index >= 0) {
      const tail = prompt.slice(index + marker.length).trim();
      if (tail) return tail;
    }
  }
  return (prompt || "").trim();
}

function classifyAnnotationPrompt(prompt: string): "add-object" | "edit-property" | "unknown" {
  const text = extractUserRequest(prompt);
  const isAddObjectRequest = /(加|添加|戴上|戴|放|道具|帽子|眼镜|墨镜|增加|新增|add\s+(a|the)|put\s+(a|the)|wear|with\s+(a|the))/i.test(text);
  // text 已由 extractUserRequest 剥离系统前缀，这里只需覆盖用户会怎么说话：
  // 用「修复/修掉/修补」等完整词避免口语里的「修一下」被误判，
  // 并补上「改成蓝色」「换成红色」这类「动词+成+值」的表达（用户很少会照着「换色」这种书面词说）。
  const isEditPropertyRequest = new RegExp(
    [
      "换色", "换颜色", "改色", "改颜色", "换材质", "改材质", "改变颜色", "改变材质",
      "换风格", "换款式", "修复", "修掉", "修补", "修瑕疵", "修图", "瑕疵",
      "去掉", "消除", "移除",
      "(改|换|变|调|染|涂)\\s*成\\s*\\S+",
      "remove", "fix", "repair", "erase", "retouch",
      "change\\s+(color|material|texture)",
    ].join("|"),
    "i",
  ).test(text);

  if (isEditPropertyRequest && !isAddObjectRequest) return "edit-property";
  if (isAddObjectRequest && !isEditPropertyRequest) return "add-object";
  // 两者都命中（如「把帽子换成红色」）时按具体动词判断：同样不能用单字，理由同上。
  if (isEditPropertyRequest && isAddObjectRequest) {
    return /(改成|换成|变成|调成|染成|涂成|换色|改色|换材质|改材质|换风格|换款式|修复|修掉|修补|去掉|消除|移除|remove|fix|repair|erase|change)/i.test(text)
      ? "edit-property"
      : "add-object";
  }
  return "unknown";
}

function getSmartAnnotationReferenceEditModels(selectedModel: string, prompt: string = "") {
  // 智能注释局部编辑按请求类型自动挑选 VOD 参考图模型：
  // - 新增物件（帽子/眼镜/道具等）：首选 OG（GPT-Image2），它原生支持 mask 编辑、
  //   对"红色棒球帽"这类具体颜色/款式遵循强、凭空加东西效果好。
  // - 改已有属性（换色/换材质/修瑕疵）：首选 GEM（Gemini 3.1），它对人脸/身份保持度更好、
  //   融合更柔和，适合修改已有内容而不引入新物体。
  const promptType = classifyAnnotationPrompt(prompt);

  // 智能注释固定只用这两个模型：OG（GPT-Image2）和 GEM（Gemini 3.1），两者互为兜底。
  // 不再回落到 MJ / Kling / Hunyuan / chat 等其他模型——实测它们在这类局部编辑上
  // 要么保持度差、要么直接忽略指令，与其出一张不对的图，不如失败后由用户重试。
  const addObjectVodModels = ["vod-og", "vod-gem"];
  const editPropertyVodModels = ["vod-gem", "vod-og"];
  const vodReferenceModels = promptType === "edit-property"
    ? editPropertyVodModels
    : addObjectVodModels;

  if (selectedModel === DEFAULT_IMAGE_MODEL_ID) {
    return Array.from(new Set(vodReferenceModels));
  }
  return Array.from(new Set([selectedModel, ...vodReferenceModels]));
}

async function editSmartAnnotationImage(input: EditImageInput): Promise<{ images: GeneratedImage[] }> {
  const maskSource = input.maskSrc?.trim() || (input.maskUrl || input.mask_url || "").trim();
  __testAssertSourcePreservingMask(input.operation, maskSource);
  console.log("[智能注释] enter", JSON.stringify({
    provider: input.provider,
    promptKind: input.promptKind,
    operation: input.operation,
    model: input.model,
    prompt: (input.prompt || "").slice(0, 80),
    maskSrcLen: maskSource.length,
  }));

  const sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const maskImageData = await imageSrcToBuffer(maskSource);
  const sourceImageDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const targetWidth = sourceImageDimensions.width;
  const targetHeight = sourceImageDimensions.height;
  const annotationBasePrompt = input.promptKind === "edit"
    ? [
        "This is a STRICT local image edit for ArtX smart annotation.",
        "Use the uploaded source image as the ONLY canvas.",
        "The mask marks a small annotation area. Edit ONLY inside the transparent area of the uploaded mask.",
        "ABSOLUTE RULE 1: Inside the mask, change ONLY the attribute the user asks for (such as color, material, texture, style). Apply the requested change to the existing content directly.",
        "ABSOLUTE RULE 2: Do NOT alter the shape, silhouette, position, structure, or identity of the object inside the mask. Keep its outline, proportions, pose, and facial features exactly the same. Only recolor or re-texture it.",
        "ABSOLUTE RULE 3: Do NOT add, remove, or replace any objects, clothing, hairstyle, or body parts inside the mask. Do not create new shapes or items.",
        "The result inside the mask must look like the SAME object from the original image, just with the user-requested color/material change applied.",
      ]
    : [
        "This is a STRICT local image edit for ArtX smart annotation.",
        "Use the uploaded source image as the ONLY canvas.",
        "The mask marks a small annotation area. Edit ONLY inside the transparent area of the uploaded mask.",
        "ABSOLUTE RULE 1: You must NOT redraw, regenerate, replace, or modify ANY existing person, face, body, clothing, background, or object inside the mask. The existing content inside the mask must remain 100% identical.",
        "ABSOLUTE RULE 2: Your ONLY job is to ADD the user-requested item ON TOP OF the existing content. Place it naturally on the existing content without altering anything underneath.",
        "EXAMPLES: If the user asks for a hat, put the hat ON the existing person's head. Do NOT redraw the person. If the user asks for glasses, put the glasses ON the existing person's face. Do NOT redraw the face. If the user asks for a prop, add it beside or on the existing subject without changing the subject.",
        "The existing person inside the mask must keep the EXACT same face, body, clothing, pose, lighting, and all details. Only the requested new item may appear.",
      ];
  const annotationPrompt = [
    ...annotationBasePrompt,
    "Every pixel outside the mask will be restored from the original source image.",
    "Return exactly one complete edited image.",
    `User request: ${input.prompt.trim()}`,
  ].join("\n");

  // 注意：这三个常量必须在「美图局部重绘分支」之前声明。
  // 美图分支的 catch 会调用 editAnnotationViaReferenceGeneration()，
  // 该函数闭包引用 selectedModel / editSize，若声明在分支之后，
  // 降级时会抛 TDZ 错误 "Cannot access 'selectedModel' before initialization"，
  // 把「美图无可见修改」这类可恢复情况变成整体失败（表现为美图能力全线报错）。
  // apiKey 的存在性校验仍留在下方原位置 —— 美图通道不需要 AI_IMAGE_API_KEY。
  const { apiKey, baseUrl, model } = getProviderConfig();
  const selectedModel = resolveSmartAnnotationEditModel(input.model, model);
  const editSize = getEditSizeForAspect(targetWidth, targetHeight);

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", bufferToImageFile(sourceImageData.buffer, sourceImageData.mimeType));
    body.append("mask", bufferToImageFile(maskImageData.buffer, maskImageData.mimeType));
    body.append("prompt", annotationPrompt);
    body.append("n", "1");
    body.append("size", editSize);
    if (withResponseFormat) body.append("response_format", "b64_json");
    return body;
  };
  const finalizeAnnotationImages = async (candidateImages: GeneratedImage[], compositeMaskBuffer?: Buffer) => {
    const effectiveMaskBuffer = compositeMaskBuffer || maskImageData.buffer;
    const normalizedImages = await __testNormalizeGeneratedImagesToTargetAspect(
      candidateImages.slice(0, 1),
      targetWidth,
      targetHeight,
    );
    const images = await Promise.all(normalizedImages.map(async image => {
      const editedImageData = await imageSrcToBuffer(image.src);
      const composited = await __testCompositeSourcePreservingImageEdit(
        sourceImageData.buffer,
        editedImageData.buffer,
        effectiveMaskBuffer,
        targetWidth,
        targetHeight,
      );
      return {
        src: `data:image/png;base64,${composited.toString("base64")}`,
        width: targetWidth,
        height: targetHeight,
      };
    }));

    const firstImage = images[0];
    if (firstImage) {
      const editedImageData = await imageSrcToBuffer(firstImage.src);
      const hasVisibleChange = await hasVisibleLocalEdit(
        sourceImageData.buffer,
        editedImageData.buffer,
        effectiveMaskBuffer,
        targetWidth,
        targetHeight,
      );
      if (!hasVisibleChange) {
        throw new Error("智能注释模型没有在标记区域做出可见修改，请扩大注释区域或换一种更明确的描述");
      }
    }

    return { images };
  };

  // 美图局部重绘通道：注释蒙版（透明=编辑区）经 buildMeituMask 转为白=重绘区/黑=保留区。
  // 美图 InPainting 只适合「局部重绘/换属性」类编辑（edit）；
  // 加物体（add）语义是「在保留内容上叠加新物体」，美图无法可靠执行（实测加帽子等会返回无变化图），
  // 因此 add 类直接走参考图生成链路（降级列表已把 VOD GEM 排到最前）。
  if (input.provider === "meitu" && input.promptKind === "edit") {
    console.log(
      `[智能注释] 进入「美图局部重绘」分支 | provider=${input.provider}, ` +
      `targetWidth=${targetWidth}, targetHeight=${targetHeight}, ` +
      `promptPos="${input.promptPos?.trim() || input.prompt.trim()}", ` +
      `源图=${sourceImageData.buffer.length}B, 原始注释蒙版=${maskImageData.buffer.length}B`,
    );
    const meituMaskBuffer = await buildMeituMask(maskImageData.buffer, targetWidth, targetHeight, "hat");
    console.log(`[智能注释] buildMeituMask 完成 | 输出=${meituMaskBuffer.length}B`);
    const meituResult = await inpaintWithMeitu({
      imageBuffer: sourceImageData.buffer,
      maskBuffer: meituMaskBuffer,
      width: targetWidth,
      height: targetHeight,
      // promptPos 仅传用户原始请求，基础约束由 meitu-client.ts 统一拼接。
      // 智能注释是"局部修改属性"（换色/换材质等），用 edit 约束而非默认 add（add 禁止改动 mask 内内容，会导致换色失败）
      promptKind: "edit",
      promptPos: input.promptPos?.trim() || input.prompt.trim(),
      numSamples: 1,
    });
    console.log(
      `[智能注释] inpaintWithMeitu 返回 | ${meituResult.images.length} 张: ` +
      `${meituResult.images.map((i) => `${i.src}(${i.width}x${i.height})`).join(", ")}`,
    );
    const rawImages = meituResult.images.map((image) => ({
      src: image.src,
      width: targetWidth,
      height: targetHeight,
    }));
    if (rawImages.length === 0) {
      throw new Error("美图局部重绘未返回结果图");
    }

    // 把美图白/黑 mask 转成 alpha mask（白=重绘→alpha=0(编辑区)，黑=保留→alpha=255(保留区)），
    // 让合成阶段只替换美图实际重绘的头顶小区域，面部、身体、背景等全部保留原图。
    const sharp = (await import("sharp")).default;
    const { data: meituMaskRaw } = await sharp(meituMaskBuffer, { limitInputPixels: false })
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaMask = Buffer.alloc(targetWidth * targetHeight * 4);
    for (let i = 0; i < targetWidth * targetHeight; i++) {
      const r = meituMaskRaw[i * 3];
      const g = meituMaskRaw[i * 3 + 1];
      const b = meituMaskRaw[i * 3 + 2];
      const luminance = Math.round((r + g + b) / 3);
      const alpha = 255 - luminance; // 白色(255)→alpha=0(编辑区), 黑色(0)→alpha=255(保留区)
      alphaMask[i * 4] = 0;
      alphaMask[i * 4 + 1] = 0;
      alphaMask[i * 4 + 2] = 0;
      alphaMask[i * 4 + 3] = alpha;
    }
    const alphaMaskBuffer = await sharp(alphaMask, { raw: { width: targetWidth, height: targetHeight, channels: 4 } })
      .png()
      .toBuffer();

    console.log(
      `[智能注释] 开始合成 | alphaMask=${alphaMaskBuffer.length}B, 源图=${sourceImageData.buffer.length}B, 美图结果=${rawImages[0]?.src.slice(0, 80)}`,
    );
    try {
      const finalized = await finalizeAnnotationImages(rawImages, alphaMaskBuffer);
      console.log(
        `[智能注释] 合成完成 | ${finalized.images.length} 张, src前缀=${finalized.images[0]?.src.slice(0, 50)}, src长度=${(finalized.images[0]?.src || "").length}`,
      );
      return finalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[智能注释] 合成失败 | ${message}`);
      if (isSmartAnnotationNoVisibleChangeError(error)) {
        if (!apiKey) {
          // 没有直连图片 key 时无法降级，直接把美图的原始结论抛给用户，
          // 避免变成含义不明的 "Missing AI_IMAGE_API_KEY"。
          console.log(`[智能注释] 无 AI_IMAGE_API_KEY，跳过降级，沿用美图结论`);
          throw error;
        }
        console.log(`[智能注释] 降级到参考图生成（需要 AI_IMAGE_API_KEY）`);
        return editAnnotationViaReferenceGeneration();
      }
      throw error;
    }
  }

  // selectedModel / editSize / apiKey 已在函数上方（美图分支之前）声明，避免 TDZ。
  // 这里只做非美图直连通道的必需校验。
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }
  // 用函数声明而非 const 箭头函数，避免 catch 块提前引用导致的 "used before declaration" 检查报错。
  async function editAnnotationViaReferenceGeneration() {
    const sourceDataUrl = await prepareImageProviderReferenceDataUrl(
      sourceImageData.buffer,
      sourceImageData.mimeType,
    );
    const editGuideDataUrl = await prepareImageProviderReferenceDataUrl(await createLocalEditGuideImage(
      sourceImageData.buffer,
      maskImageData.buffer,
      targetWidth,
      targetHeight,
    ), "image/png");
    const aspect = targetWidth / Math.max(1, targetHeight);
    // 原图比例 2:3 (~0.67) 与 9:16 (~0.56) 相差较远，与源图相近的比例能减少 VOD 参考图生成时的构图漂移。
    const ratio = aspect > 1.2
      ? "16:9"
      : aspect < 0.85
        ? (aspect < 0.65 ? "9:16" : "2:3")
        : "1:1";
    const promptType = classifyAnnotationPrompt(input.prompt || "");
    const fallbackModels = getSmartAnnotationReferenceEditModels(selectedModel, input.prompt || "");
    // OG（GPT-Image2）支持 mask 蒙版编辑（白=编辑区），生成反相后的蒙版供其使用。
    // 明确是「新增物件」时才大幅扩展蒙版给新物体留空间；
    // 改属性（换色/换材质/修瑕疵）以及判断不出时都只做轻度膨胀，避免改色溢出。
    const ogMask = await createOgdEditMaskDataUrl(
      maskImageData.buffer,
      targetWidth,
      targetHeight,
      promptType === "add-object" ? "add" : "edit",
      input.prompt || "",
    );
    const ogMaskDataUrl = ogMask.dataUrl;
    const ogCompositeMaskBuffer = ogMask.compositeMaskBuffer;
    console.log("[智能注释] reference edit", JSON.stringify({
      selectedModel,
      defaultModel: DEFAULT_IMAGE_MODEL_ID,
      promptType,
      firstVodModel: fallbackModels.find(isVodModelId),
      fallbackModels: Array.from(new Set(fallbackModels)),
      vodAigc: isVodAigcConfigured(),
      maskDataUrlPrefix: ogMaskDataUrl.slice(0, 30),
      // 打印剥离系统前缀后的用户真实请求，这是路由判断的唯一依据
      userRequest: extractUserRequest(input.prompt || ""),
    }));
    let lastError: unknown;
    for (const fallbackModel of Array.from(new Set(fallbackModels))) {
      const isVodModel = isVodModelId(fallbackModel);
      const isVodMaskModel = isVodModel && isVodMaskEditModel(fallbackModel);
      console.log("[智能注释] try model:", fallbackModel, "| isVod:", isVodModel, "| mask:", isVodMaskModel, "| vodAigc:", isVodAigcConfigured());
      // 支持 mask 的 VOD 模型（OG）：传 source + mask（ReferenceType:"mask"），
      // 并在白色蒙版区域内做精确「加物体」编辑，蒙版外保持原图。
      const userPrompt = input.prompt.trim();
      const isHatRequest = /(帽|hat\b|cap\b|bonnet|visor|headwear|头饰|贝雷帽|鸭舌帽|针织帽|棒球帽|毛线帽)/i.test(userPrompt);
      const isGlassesRequest = /(眼镜|glasses|sunglasses|墨镜|goggles|镜框|镜片|一副眼镜|一副墨镜)/i.test(userPrompt);
      const baseVodMaskLines = [
        userPrompt,
        "参考图 1 是原图，必须作为目标画布。参考图 2 是编辑意图标注图（红橙色半透明覆盖区域表示用户指定的编辑位置）。参考图 3 是精确蒙版：白色区域为可编辑/可添加物体的区域，黑色区域必须保持原样。",
        "只允许在白色蒙版区域内完成用户请求（例如给人物添加帽子、眼镜等新物体），新物体的颜色、款式、材质必须严格遵循用户请求。",
        "新物体必须与人物自然融合：底部要紧贴发际线/头皮/对应部位轮廓，不能悬浮在头部上方，注意透视、遮挡、比例和光影一致，边缘过渡自然。",
        "蒙版之外的内容、人物身份、姿势、场景、光线与整体风格必须保持完全不变。",
      ];
      if (isHatRequest) {
        baseVodMaskLines.push("如果请求是帽子，必须严格按用户描述的款式生成：棒球帽（baseball cap）必须有硬帽檐（visor）并遮住前额、紧贴发际线；不能是针织帽/毛线帽/贝雷帽/无檐帽。");
      }
      if (isGlassesRequest) {
        baseVodMaskLines.push("如果请求是眼镜/墨镜，必须严格按用户描述的款式生成：镜框左右对称、镜腿自然架在耳朵上，镜片按描述透明或着色，不得遮挡、扭曲或重绘眼睛、眉毛、鼻子和脸颊轮廓。");
      }
      const vodMaskAnnotationPrompt = baseVodMaskLines.join("\n");
      // 不支持 mask 的 VOD 模型（GEM 等）：只接受单张参考图，不要复用含 mask 指令的提示词，
      // 否则会因看不到 mask 而过度保守。直接用用户请求 + 保持原图约束即可。
      const vodAnnotationPrompt = [
        input.prompt.trim(),
        "保持原图的人物、姿势、服装、背景、光线和整体构图完全不变，只按上述请求进行修改。",
      ].join("\n");
      try {
        const result = await generateImages({
          prompt: isVodMaskModel
            ? vodMaskAnnotationPrompt
            : isVodModel
              ? vodAnnotationPrompt
              : [
                  annotationPrompt,
                  "Reference image 1 is the exact source image and must be treated as the target canvas.",
                  "Reference image 2 is only an orange visual guide for the editable annotation area. The orange guide must not appear in the result.",
                  "Make the requested change only in the guided area. Preserve identity, pose, scene, lens, lighting, style, and all unmentioned details.",
                  "Do not leave the guided area unchanged. If the user asks for an accessory such as glasses or sunglasses, add it clearly on the same subject inside the guided area.",
                ].join("\n\n"),
          model: fallbackModel,
          ratio,
          count: 1,
          preferImageApiForReferences: true,
          enhancePrompt: false,
          // VOD OG mask 编辑用 negativePrompt 排除易混淆款式和面部伪影
          negativePrompt: isVodMaskModel
            ? [
                "distorted face, deformed facial features, extra face, face artifacts, blurry face, watermark, text, logo, signature, low quality",
                isHatRequest ? "beanie, knit cap, toque, winter hat, skull cap, woolen cap, beret, bucket hat, flat cap" : "",
                isGlassesRequest ? "distorted glasses, asymmetrical glasses, melted glasses, broken glasses, one lens, missing temple arms" : "",
              ].filter(Boolean).join(", ")
            : undefined,
          images: isVodMaskModel
            ? [
                { src: sourceDataUrl, title: "target source image" },
                { src: editGuideDataUrl, title: "annotation editable area guide" },
                { src: ogMaskDataUrl, title: "annotation mask" },
              ]
            : isVodModel
              ? [
                  { src: sourceDataUrl, title: "target source image" },
                  { src: editGuideDataUrl, title: "annotation editable area guide" },
                ]
              : [
                  { src: sourceDataUrl, title: "target source image" },
                  { src: editGuideDataUrl, title: "annotation editable area guide" },
                ],
        });
        // VOD mask 模型（vod-og 等）本身通过 ReferenceType: "mask" 做了局部编辑，
        // VOD 服务端已经保证蒙版外保持原图；后端再做一次 source-preserving 合成
        // 反而会擦掉超出原始涂鸦点的生成内容（如眼镜跨双眼时只保留了一半）。
        // 因此直接返回 VOD 结果并归一化尺寸即可。
        if (isVodMaskModel) {
          const normalized = await __testNormalizeGeneratedImagesToTargetAspect(result.images.slice(0, 1), targetWidth, targetHeight);
          return { images: normalized };
        }
        // 非 mask 模型（chat/GEM 等）需要自己用扩展蒙版做 source-preserving 合成。
        return finalizeAnnotationImages(result.images, ogCompositeMaskBuffer);
      } catch (error) {
        lastError = error;
        console.log("[智能注释] model FAIL:", fallbackModel, "->", error instanceof Error ? error.message : String(error));
      }
    }
    throw lastError || new Error("智能注释参考图编辑失败");
  };

  let providerData: ImageGenerationResponse | undefined;
  try {
    providerData = await callImageEditProvider(createBody(true), apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldFallbackSmartAnnotationEdit(error)) {
      return editAnnotationViaReferenceGeneration();
    }
    if (!message.toLowerCase().includes("response_format")) throw error;
    try {
      providerData = await callImageEditProvider(createBody(false), apiKey, baseUrl);
    } catch (fallbackError) {
      if (shouldFallbackSmartAnnotationEdit(fallbackError)) {
        return editAnnotationViaReferenceGeneration();
      }
      throw fallbackError;
    }
  }

  const asyncTaskId = providerData?.task_id || providerData?.taskId;
  if (asyncTaskId) {
    try {
      providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
    } catch (error) {
      if (shouldFallbackSmartAnnotationEdit(error)) {
        return editAnnotationViaReferenceGeneration();
      }
      throw error;
    }
  }

  const rawImages = extractGeneratedImages(providerData || {}, baseUrl, targetWidth, targetHeight);
  if (rawImages.length === 0) {
    return editAnnotationViaReferenceGeneration();
  }

  try {
    return await finalizeAnnotationImages(rawImages);
  } catch (error) {
    if (isSmartAnnotationNoVisibleChangeError(error)) {
      return editAnnotationViaReferenceGeneration();
    }
    throw error;
  }
}

export async function generateImages(input: ImageGenerateInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.prompt?.trim()) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();

  const ratio = ratioToSize[input.ratio || "1:1"] || ratioToSize["1:1"];
  const count = Math.max(1, Math.min(Number(input.count) || 1, 9));
  const referenceImages = input.images?.filter(image => image.src?.trim()) || [];
  const targetSize = __testResolveHighDefinitionTargetSize(ratio.width, ratio.height, ratio.width, ratio.height);
  /**
   * 必须**归一化后**再参与路由与下发。
   *
   * 原先这里直接 trim 就用，于是已下线的中转站 id（如 `jimeng-4.0`）
   * 会被原样传进 VOD 链路 —— 而腾讯侧根本不认识这个名字，
   * tencent-vod-aigc.ts 的 resolveModelName 又会**静默兜底**成默认模型，
   * 最终「用户选了 jimeng，实际用别的模型出图」且日志里毫无痕迹。
   *
   * 归一化会把旧 id 迁移成等价的 vod-* 模型（jimeng-4.0 -> vod-jimeng），
   * 保证「所选即所用」。normalizeImageModelId 对 "auto" 返回空串，
   * 这里要保留 "auto" 字面值给下面的 fallback 分支判断。
   */
  const rawRequestedModel = (input.model || model).trim();
  const requestedModel = rawRequestedModel.toLowerCase() === "auto"
    ? rawRequestedModel
    : (normalizeImageModelId(rawRequestedModel) || rawRequestedModel);
  console.log("[generate] requestedModel:", requestedModel, "| raw:", rawRequestedModel, "| isVodModelId:", isVodModelId(requestedModel), "| isVodAigcConfigured:", isVodAigcConfigured());

  /**
   * 用腾讯 VOD AIGC 直连生成。抽成函数是为了让 **auto fallback 链里的每个
   * vod-\* 模型都能走到这条路**，而不只是「用户显式选中 vod-\* 」的那一次。
   *
   * 这里曾有一个隐蔽且代价很大的 bug：路由判断只看 `requestedModel`，
   * 而 auto 模式下它的字面值就是字符串 "auto"，`isVodModelId("auto")` 为 false，
   * 于是**整个请求**落进下面的中转站分支，再由中转站去遍历 fallback 链 ——
   * 结果 `vod-og25-*`、`vod-gem` 这些**根本不存在于中转站**的 id
   * 被当成中转站模型发了出去，上游回 `model_not_found: No available channel`，
   * 链条一路降级，最终真正出图的是排在链尾的中转站模型。
   * 表面看「出图成功」，实际默认模型形同虚设、钱还是按中转站价格花的。
   */
  const tryVodGeneration = async (vodModelId: string) => {
    const maskImage = referenceImages.find(image => image.title === "annotation mask");
    const nonMaskImages = referenceImages.filter(image => image.title !== "annotation mask");
    console.log("[generate] VOD branch entered, model:", vodModelId, "| maskPresent:", !!maskImage, "| refImages:", nonMaskImages.length);
    const vodInput: VodImageGenerationInput = {
      prompt: buildPrompt(input),
      model: vodModelId,
      aspectRatio: input.ratio || "1:1",
      count,
      // 智能注释等场景会传入 source + edit guide 多张参考图；用 imageUrls 全部传给 VOD OG。
      imageUrls: nonMaskImages.length > 0 ? nonMaskImages.map(image => image.src) : undefined,
      // 智能注释等场景会把「白=编辑区」的蒙版传入，由 VOD OG 系列做精确局部编辑。
      maskDataUrl: isVodMaskEditModel(vodModelId) ? maskImage?.src : undefined,
      // 参考图编辑等对指令精确性要求高的场景（如智能注释），VOD 服务端 prompt 增强会改写用户请求，
      // 导致「加帽子」等具体指令被稀释；由调用方通过 enhancePrompt=false 显式关闭。
      enhancePrompt: input.enhancePrompt ?? true,
      negativePrompt: input.negativePrompt,
    };

    const result = await generateImageWithVod(vodInput);
    const images = result.images.map(img => ({
      src: img.src,
      width: img.width,
      height: img.height,
    }));
    console.log("[generate] VOD success:", vodModelId, "| count:", images.length, "| src:", (images[0]?.src || "").slice(0, 100));
    return { images: images.slice(0, count) };
  };

  // 用户显式选中某个 vod-* 模型时，失败就直接报错，不静默改用别的模型 ——
  // 「我选了 A，你却用 B 出了图」比直接失败更糟。
  if (isVodModelId(requestedModel) && isVodAigcConfigured()) {
    try {
      return await tryVodGeneration(requestedModel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[image-provider]", {
        event: "generation-attempt-failed",
        model: requestedModel,
        provider: "vod-aigc",
        error: summarizeImageProviderError(message),
      });
      throw new Error(`VOD AIGC image generation failed: ${message}`);
    }
  }

  const attemptModels = requestedModel.toLowerCase() === "auto"
    ? getImageModelFallbackAttempts(requestedModel)
    : [requestedModel];

  /**
   * apiKey 的校验必须放在 attemptModels 之后、且**只拦截中转站模型**。
   *
   * 原先它是一道前置的无条件 throw，意味着只要没配中转站 key，
   * 连纯 VOD 的 auto 出图都会被挡下 —— 而 VOD 用的是腾讯云 SID/SKEY，
   * 跟中转站 key 完全无关。用户要求「图片全部走 VOD、中转站只留文本」之后，
   * 中转站图片 key 缺失会成为常态，这道前置校验必须降级为按模型判断。
   */
  if (!apiKey && !attemptModels.some(id => isVodModelId(id) && isVodAigcConfigured())) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  /**
   * 2026-09-12 中转站图片模型下线后，注册表里**只剩 vod-\* 模型**，
   * 这让 VOD 凭证成为全站出图的单点依赖 —— 兜底链没了，配置错误不再被掩盖。
   *
   * 若不在这里显式拦截，下面的循环会把每个模型都 `continue` 掉
   * （因为 isVodAigcConfigured() 为 false），最终落到循环外那句
   * 「系统已按默认优先级重试：unknown error」——
   * 这个报错完全指不出真正的原因是「腾讯云凭证没配」，排查成本极高。
   */
  if (attemptModels.every(isVodModelId) && !isVodAigcConfigured()) {
    throw new Error(
      "图片生成不可用：腾讯 VOD AIGC 凭证未配置（需要 TENCENT_VOD_SID / TENCENT_VOD_SKEY / TENCENT_VOD_SUB_APP_ID）。"
      + "全站图片模型已于 2026-09-12 统一切换为 VOD 直连，中转站不再提供图片兜底。"
    );
  }

  let lastError = "";
  for (const attemptModel of attemptModels) {
    // auto 链里的 vod-* 模型走 VOD 直连；失败则继续试链上的下一个。
    if (isVodModelId(attemptModel)) {
      if (!isVodAigcConfigured()) continue;
      try {
        return await tryVodGeneration(attemptModel);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        console.warn("[image-provider]", {
          event: "generation-attempt-failed",
          model: attemptModel,
          provider: "vod-aigc",
          error: summarizeImageProviderError(message),
        });
        continue;
      }
    }

    // 剩下的是中转站模型，没有 key 就没法试，直接跳过而不是抛错 ——
    // 前面可能还有 VOD 模型没试完，或者 VOD 已经试过全失败了，
    // 两种情况都应该让循环结束后由 lastError 给出真实原因。
    if (!apiKey) continue;

    const providerModel = resolveProviderImageModel(attemptModel);
    const referenceRoute = __testResolveReferenceImageRoute(
      providerModel,
      referenceImages.length > 0,
      Boolean(input.preferImageApiForReferences),
    );
    const requestBody = {
      model: providerModel,
      prompt: buildPrompt(input),
      n: count,
      size: ratio.size,
      response_format: "b64_json",
      images: referenceImages,
    };

    try {
      let providerData: ImageGenerationResponse;
      try {
        providerData = referenceRoute.usesChatPath
          ? await callImageChatProvider(requestBody, apiKey, baseUrl)
          : await callImageProvider(requestBody, apiKey, baseUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (referenceRoute.fallbackModel !== requestBody.model) {
          providerData = await callImageChatProvider({
            ...requestBody,
            model: referenceRoute.fallbackModel,
          }, apiKey, baseUrl);
        } else if (isUnsupportedImagesApiError(message)) {
          providerData = await callImageChatProvider({
            ...requestBody,
          }, apiKey, baseUrl);
        } else if (isMissingReferenceImagesError(message) && !referenceRoute.usesChatPath) {
          providerData = await callImageProvider({
            ...requestBody,
            prompt: stripReferenceContextFromPrompt(String(requestBody.prompt || "")),
          }, apiKey, baseUrl);
        } else if (message.toLowerCase().includes("response_format") && !referenceRoute.usesChatPath) {
          const { response_format: _responseFormat, ...fallbackBody } = requestBody;
          providerData = await callImageProvider(fallbackBody, apiKey, baseUrl);
        } else {
          throw error;
        }
      }

      let asyncTaskId = providerData.task_id || providerData.taskId;
      if (asyncTaskId) {
        try {
          providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/timed out/i.test(message) || referenceRoute.usesChatPath) {
            throw error;
          }
          providerData = await callImageProvider(requestBody, apiKey, baseUrl);
          asyncTaskId = providerData.task_id || providerData.taskId;
          if (asyncTaskId) {
            providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
          }
        }
      }

      const images = extractGeneratedImages(providerData, baseUrl, targetSize.width, targetSize.height).slice(0, count);
      const normalizedImages = await __testNormalizeGeneratedImagesToTargetAspect(images, targetSize.width, targetSize.height);
      if (normalizedImages.length > 0) {
        if (normalizedImages.length < count) {
          const remainingCount = count - normalizedImages.length;
          const remaining = await Promise.all(
            Array.from({ length: remainingCount }, (_, index) =>
              generateImages({
                ...input,
                count: 1,
                prompt: [
                  input.prompt,
                  `生成第 ${normalizedImages.length + index + 1} 张差异化结果，保持同一需求但不要重复已有构图。`,
                ].join("\n"),
              }),
            ),
          );
          return {
            images: [...normalizedImages, ...remaining.flatMap(result => result.images)].slice(0, count),
          };
        }
        return { images: normalizedImages };
      }
      lastError = `${providerModel} returned no usable images`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const status = error instanceof ImageProviderRequestError ? error.status : undefined;
      console.warn("[image-provider]", {
        event: "generation-attempt-failed",
        model: providerModel,
        host: getProviderHost(baseUrl),
        status,
        requestId: error instanceof ImageProviderRequestError ? error.requestId : undefined,
        error: summarizeImageProviderError(lastError),
        kind: /timed out/i.test(lastError)
          ? "timeout"
          : isProviderGatewayError(lastError)
            ? "gateway"
            : "provider-error",
      });
      if (!isProviderCapacityError(lastError) && !isUnsupportedImagesApiError(lastError) && !isImageGroupPermissionError(lastError) && !isProviderGatewayError(lastError)) {
        throw new Error(`图片生成接口暂不可用：${lastError}`);
      }
      console.warn(`Image generation with ${providerModel} failed; retrying next priority model`, error);
    }
  }

  throw new Error(`图片模型未返回可用图片，系统已按默认优先级重试：${lastError || "unknown error"}`);
}

export async function removeImageBackground(input: RemoveBackgroundInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return removeBackgroundWithPurePicWish(input.imageSrc);
}

export async function enhanceImage(input: EnhanceImageInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return enhanceImageWithPicWish(input.imageSrc);
}

export async function removeImageWatermark(input: RemoveWatermarkInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return removeWatermarkWithPicWish(input.imageSrc);
}

/**
 * OCR 对外入口。
 *
 * 在原始识别结果之上统一追加一步「bbox 像素级校正」：
 * 视觉大模型返回的坐标是估计值，实测存在随行序递增的系统性偏移
 * （一张 1024x640 海报上三行文字分别偏上 49px / 86px / 100px）。
 * 若不校正，后续擦除与绘制都会作用在空白处，表现为「改了等于没改」。
 *
 * 放在这一层是因为前端 mask 生成、服务端擦除、确定性绘制三处共用同一份 regions，
 * 在出口修一次即可让三者同时受益，且完全不需要改动前端。
 */
export async function extractImageText(input: ExtractImageTextInput): Promise<{
  text: string;
  regions: ImageTextRegion[];
  provider: string;
}> {
  const result = await extractImageTextRaw(input);
  if (result.regions.length === 0) return result;
  try {
    const { buffer } = await imageSrcToBuffer(input.imageSrc);
    const calibrated = await calibrateTextRegions(buffer, result.regions);
    let movedCount = 0;
    for (let i = 0; i < calibrated.length; i++) {
      if (Math.abs(calibrated[i].y - result.regions[i].y) > 0.005) movedCount++;
    }
    if (movedCount > 0) {
      console.log(`[ocr] bbox 像素校正：${movedCount}/${calibrated.length} 个区域已吸附到真实文字带`);
    }
    return { ...result, regions: calibrated };
  } catch (error) {
    // 校正是增强步骤，失败时退回未校正结果，绝不阻断 OCR
    console.warn(`[ocr] bbox 像素校正失败，使用原始坐标: ${String(error)}`);
    return result;
  }
}

async function extractImageTextRaw(input: ExtractImageTextInput): Promise<{
  text: string;
  regions: ImageTextRegion[];
  provider: string;
}> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const response = await fetch(getChatEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model || model,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "请识别图片中所有可见文字，并返回严格 JSON，不要输出解释或 Markdown。",
              "格式：{\"text\":\"按阅读顺序排列的全部原文\",\"regions\":[{\"text\":\"该区域原文\",\"x\":0.1,\"y\":0.2,\"width\":0.3,\"height\":0.1,\"rotate\":0,\"fontColor\":\"#ffffff\"}]}。",
              "x、y、width、height 必须是相对整张图片的 0 到 1 小数坐标，区域应完整覆盖对应文字。",
              "rotate 是文字相对水平方向的倾斜角度（度，正值顺时针，多数场景为 0）；",
              "fontColor 是该区域文字的主色十六进制值（如 #ffffff）；两者都尽量准确填写。",
              "保持原有语言、大小写、标点和换行，不要翻译。没有可读文字时返回 {\"text\":\"\",\"regions\":[]}。",
            ].join("\n"),
          },
          { type: "image_url", image_url: { url: input.imageSrc } },
        ],
      }],
      // claude 系列对 temperature 直接返回 400
      // （"`temperature` is deprecated for this model."）。
      // 这条 OCR 路径默认走图片模型，但 input.model 可由调用方传入，
      // 万一传进 claude，带上 temperature 会让整条 OCR 失败。
      // 详见 server/text-generation.ts 的 supportsTemperature 注释。
      ...(isClaudeTextModelId(input.model || model) ? {} : { temperature: 0 }),
    }),
  });
  const raw = await response.text();
  const data = safeParseJson<ImageTextResponse>(raw) || {};
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(message || `Image OCR provider returned ${response.status}`);
  }

  const parsed = __testParseStructuredImageText(
    data.choices?.[0]?.message?.content || data.output_text || ""
  );
  if (parsed.text && parsed.regions.length > 0) {
    return {
      ...parsed,
      provider: "vision-chat-ocr",
    };
  }

  const fallback = await generateText({
    module: "multimodal-text-extraction",
    // 不要写死模型名：网关会下线型号（gpt-5.4-mini、gpt-5.4 现均已下线）。
    // 写死会让这条兜底每次都先打死模型，再靠 text-generation.ts:210 的降级链
    // 逐个重试才落到存活型号——实测整条链路 ~134s，而智能文案编辑正走这里，
    // 用户侧表现为「点了很久没反应」。改读环境变量后由 .env 统一收口；
    // 留空则交给 getProviderConfig() 决定，行为与原先一致。
    model: process.env.AI_TEXT_MODEL || undefined,
    images: [{ src: input.imageSrc, title: "OCR target image" }],
    prompt: [
      "请识别图片中所有可见文字，并返回严格 JSON，不要输出解释或 Markdown。",
      "格式：{\"text\":\"按阅读顺序排列的全部原文\",\"regions\":[{\"text\":\"该区域原文\",\"x\":0.1,\"y\":0.2,\"width\":0.3,\"height\":0.1,\"rotate\":0,\"fontColor\":\"#ffffff\"}]}。",
      "坐标使用相对整张图片的 0 到 1 小数，区域完整覆盖对应文字。",
      "rotate 是文字倾斜角度（度，正值顺时针，多数为 0），fontColor 是文字主色十六进制值，尽量准确填写。",
      "保持原有语言、大小写、标点和换行；没有可读文字时返回空 text 和空 regions。",
    ].join("\n"),
  });
  const fallbackParsed = __testParseStructuredImageText(fallback.text);

  return {
    text: fallbackParsed.text || parsed.text,
    regions: fallbackParsed.regions.length > 0 ? fallbackParsed.regions : parsed.regions,
    provider: "vision-chat-ocr+text-fallback",
  };
}

export async function createProductBackground(input: CreateBackgroundInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  const count = Math.max(1, Math.min(Number(input.count) || 1, 9));
  const { buffer, mimeType } = await imageSrcToBuffer(input.imageSrc);
  const sourceDimensions = await getImageBufferDimensions(buffer);
  const output = getBackgroundOutputSize(input, sourceDimensions.width, sourceDimensions.height);
  const productCutout = await removeBackgroundWithPicWish(buffer, mimeType);
  const productImageSrc = productCutout.images[0]?.src;
  if (!productImageSrc) {
    throw new Error("PicWish background removal did not return a product cutout");
  }
  const preparedProductImage = await prepareProductCutoutForBackgroundGenerator(
    productImageSrc,
    output.width,
    output.height,
    input.composition,
    input.productScale,
  );
  const prompt = __testBuildSmartProductPrompt(input);

  const outputs: GeneratedImage[] = [];
  const taskIds: string[] = collectProviderTaskIds(productCutout);
  for (let index = 0; index < count && outputs.length < count; index += 1) {
    const result = await createBackgroundWithPicWish({
      imageSrc: preparedProductImage.imageSrc,
      prompt: buildSmartProductVariationPrompt(prompt, index, count),
      sceneType: input.sceneType,
      ratio: input.ratio,
      resolution: input.resolution,
      count: 1,
      customWidth: output.width,
      customHeight: output.height,
    });
    outputs.push(...result.images.slice(0, 1));
    taskIds.push(...collectProviderTaskIds(result));
  }

  const images = outputs.slice(0, count);
  if (images.length === 0) {
    throw new Error("PicWish background generator did not return any images");
  }
  return withProviderTaskIds({ images }, taskIds);
}

export async function editImageWithPrompt(input: EditImageInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  if (!input.prompt?.trim()) {
    throw new Error("Missing prompt");
  }
  if (input.operation === "annotation_edit") {
    return editSmartAnnotationImage(input);
  }

  const maskSource = input.maskSrc?.trim() || (input.maskUrl || input.mask_url || "").trim();
  __testAssertSourcePreservingMask(input.operation, maskSource);

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  let sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const maskSrc = input.maskSrc?.trim();
  const maskUrl = (input.maskUrl || input.mask_url || "").trim();
  const maskImageData = maskSource ? await imageSrcToBuffer(maskSource) : null;
  const sourceImageDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const isTextEditOperation = input.operation === "text_edit";
  const isCameraViewOperation = input.operation === "camera_view";
  const requiresVisibleLocalChange = isTextEditOperation;
  const isSourcePreservingEdit = isTextEditOperation || input.preserveSource === true;
  const targetSize = isSourcePreservingEdit
    ? sourceImageDimensions
    : __testResolveHighDefinitionTargetSize(
        input.targetWidth,
        input.targetHeight,
        sourceImageDimensions.width,
        sourceImageDimensions.height,
      );
  const targetWidth = targetSize.width;
  const targetHeight = targetSize.height;
  let sourceImage = bufferToImageFile(sourceImageData.buffer, sourceImageData.mimeType);
  const requestedModel = (input.model || model).trim();
  const usesCameraViewAutoModel = isCameraViewOperation && requestedModel === "camera-view-auto";
  const usesAutoModel = requestedModel.toLowerCase() === "auto" || usesCameraViewAutoModel;
  const selectedModels = usesAutoModel
    ? [
        ...(isCameraViewOperation ? ["vod-gem", "vod-og"] : []),
        ...getImageModelFallbackAttempts(requestedModel),
      ].filter((modelId, index, values) => values.indexOf(modelId) === index)
    : [requestedModel];
  const selectedModel = selectedModels[0] || DEFAULT_IMAGE_MODEL_ID;
  const referenceImages = input.images?.filter(image => image.src?.trim()) || [];
  const editSize = getEditSizeForAspect(targetWidth, targetHeight);
  const aspectInstruction = `Keep the final image canvas aspect ratio exactly ${targetWidth}:${targetHeight}. Do not return a square image unless the source is square.`;
  let textEditInstruction = isTextEditOperation
    ? [
        "This is a local text replacement edit, not a new image generation request.",
        "Use the source image as the only target canvas. Preserve every non-text region, including background, subject, product, logo, decorative elements, colors, lighting, composition, camera angle, and aspect ratio.",
        "Only remove the original readable text and place the requested replacement text back into the same visual text areas with matching typography, hierarchy, spacing, alignment, and poster design quality.",
        "Do not change the image category, scene, product type, or overall visual identity.",
      ].join("\n")
    : "";
  // 负面约束：OpenAI 系接口无 negative_prompt 字段，以 "Avoid" 形式并入正向提示词，
  // 降低 AI 在文字重绘时误改画面其他内容的风险。
  const textEditNegativeInstruction = isTextEditOperation
    ? "Avoid in the final result: 画面变形、背景改动、图案偏移、多余元素、画面裁切、文字错位、修改蒙版外内容、模糊、噪点、水印、扭曲。Keep every pixel outside the marked text areas unchanged."
    : "";

  // 记录擦字前的原始图：叠字结果 composite 时用它还原 mask 外像素，
  // 避免美图对 mask 外像素的微小改动（JPEG 压缩等）被带入最终结果
  const originalSourceImageData = sourceImageData;

  // ── 阶段 A：美图擦字（text_edit 专用）────────────────────────────
  // 先用美图局部重绘把文字区域擦成干净背景，再让主模型只负责"叠字"，
  // 避免主模型在 mask 内重新生成背景导致"重绘文字区域背景不正常"。
  if (isTextEditOperation && maskImageData) {
    try {
      // 膨胀 mask 透明区域，让美图把文字边缘也擦进去，减少原文字残留。
      //
      // 这些参数原先是针对某张具体测试图调出来的绝对像素值（radius=8 / shiftY=30 /
      // extraX=13 / shrinkY=20）。绝对值在不同分辨率下表现差异极大：同样 30px 的上移，
      // 在 4K 图上几乎看不出，在 512px 小图上会把整行文字移出蒙版范围。
      // 这里改为按图像短边比例自适应，并保留合理上下限。
      const shortEdge = Math.max(1, Math.min(targetWidth, targetHeight));
      const clampMaskPx = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(Math.round(value), max));
      const maskParams = {
        radius: clampMaskPx(shortEdge * 0.008, 3, 14),
        // 不再默认整体上移 30px：bbox 的系统性偏移应由 OCR 侧修正，
        // 这里只保留很小的补偿量，避免文字顶部被截断。
        shiftY: clampMaskPx(shortEdge * 0.004, 0, 8),
        extraX: clampMaskPx(shortEdge * 0.012, 4, 20),
        shrinkY: clampMaskPx(shortEdge * 0.006, 0, 12),
      };
      console.log(
        `[text_edit] 自适应蒙版参数 短边=${shortEdge} radius=${maskParams.radius} ` +
          `shiftY=${maskParams.shiftY} extraX=${maskParams.extraX} shrinkY=${maskParams.shrinkY}`,
      );
      const dilatedMaskBuffer = await dilateMaskTransparent(
        maskImageData.buffer,
        targetWidth,
        targetHeight,
        maskParams.radius,
        maskParams.shiftY,
        maskParams.extraX,
        maskParams.shrinkY,
      );
      /**
       * 是否存在「删除整行」（targetText 被显式置空）。
       *
       * 删除行与改字有本质区别：改字之后有新文案盖住残留笔画，擦得不彻底也看不出来；
       * 删除之后那块是裸露的背景，任何残留都会直接暴露给用户。
       *
       * 2026-09-12 实测（894x817 横幅，删除 "COLORS · IMAGE · TEXT"）：
       *   参数化引擎  ：墨迹 0.235% → 0.147%，擦净率仅 37.3%，OCR 仍能读出原文
       *   本地像素擦除：墨迹 0.235% → 0.000%，擦净率 100%
       *
       * 引擎弱在这类行上是设计使然——它为「大标题换字」调优，擦到够画新字就停；
       * 而删除行往往是小字 + 低对比度（浅底深字），Otsu 二分容易把笔画判成背景。
       */
      const hasLineDeletion = Boolean(
        input.textRegions?.length &&
        input.editedText?.trim() &&
        resolveRegionTargetTexts(input.textRegions, input.editedText)
          .some(item => item.changed && item.targetText === ""),
      );

      // 擦除通道按「背景还原质量」排序，任一成功即可进入确定性绘制。
      //
      // 关键设计：确定性渲染是唯一能保证文字内容零错误的路径，而它只需要一张干净底图。
      // 原实现一旦美图不可用（超时/限流/未配密钥）就整条降级到 AI 叠字，文字准确性随之失守。
      // 这里改为多通道兜底，把「拿到干净底图」的成功率拉到接近 100%。
      //
      // 删除整行时整条前置链路（引擎/美图/佐糖）全部跳过，直接用本地像素擦除：
      // 它是三者里唯一实测能把残留清到 0.000% 的通道，且同一载荷下改字区照常
      // 改动 78.77%、其余 5 个未改动区域误伤 0.00%，不存在「为删除行牺牲改字」的取舍。
      const eraseChannels: Array<{ name: string; run: () => Promise<Buffer | null> }> = hasLineDeletion ? [] : [
        {
          // 参数化引擎排在最前：实测在纯色印刷体上擦净率与背景保真都优于其它通道
          // （banner CUSTOM 行 98.1% / 背景改动 11.7，本地兜底是 94.6% / 25.8）。
          //
          // 但它**不是无条件更好**：金色渐变艺术字上只有 46.9%，因为 Otsu 二分
          // 会把渐变字的暗部判成背景。所以这里同样要过下面的 hasVisibleLocalEdit
          // 校验，不合格就自然让位给美图/佐糖/本地兜底，不做特判。
          //
          // 未配置 TEXT_ENGINE_BASE_URL 时返回 null，整条链路行为与接入前完全一致。
          name: "参数化引擎",
          run: async () => {
            if (!isTextEngineConfigured()) return null;
            if (!input.textRegions?.length || !input.editedText?.trim()) return null;
            // 只把「真的被改了文案」的区域交给引擎，避免擦掉用户没动的行。
            //
            // targetText 不能直接用：前端只在**删除整行**时才写它（InfiniteCanvas
            // :7573 传 "" 或 undefined），普通改字时是 undefined。
            // 所以必须复用站点既有的行匹配口径 resolveRegionTargetTexts，
            // 与 createModifiedRegionsMask / drawTextReplacement 保持同一套判定，
            // 否则会出现「引擎擦了 A 行、绘制却写在 B 行」的错位。
            const resolved = resolveRegionTargetTexts(input.textRegions, input.editedText);
            const regions = resolved.filter(item => item.changed);
            if (regions.length === 0) return null;

            const result = await eraseTextWithEngine({
              imageBuffer: sourceImageData.buffer,
              regions: regions.map(item => ({
                text: item.region.text || "",
                targetText: item.targetText,
                x: item.region.x,
                y: item.region.y,
                width: item.region.width,
                height: item.region.height,
              })),
            });
            return result.buffer;
          },
        },
        {
          name: "美图局部重绘",
          run: async () => {
            const meituMaskBuffer = await buildMeituMask(
              dilatedMaskBuffer,
              targetWidth,
              targetHeight,
              "full",
            );
            const meituResult = await inpaintWithMeitu({
              imageBuffer: sourceImageData.buffer,
              maskBuffer: meituMaskBuffer,
              width: targetWidth,
              height: targetHeight,
              promptKind: "erase",
              promptPos:
                "Remove the text characters inside the mask and restore the clean original background.",
              numSamples: 1,
            });
            const src = meituResult.images[0]?.src;
            return src ? (await imageSrcToBuffer(src)).buffer : null;
          },
        },
        {
          name: "佐糖物体擦除",
          run: async () => {
            // 佐糖 inpaint 的 mask 契约与美图一致：白=擦除区、黑=保留区，
            // 因此可以直接复用同一张膨胀后的蒙版。
            const picwishMask = await buildMeituMask(
              dilatedMaskBuffer,
              targetWidth,
              targetHeight,
              "full",
            );
            const result = await eraseWithPicWish({
              imageBuffer: sourceImageData.buffer,
              imageMimeType: sourceImageData.mimeType,
              maskBuffer: picwishMask,
              maskMimeType: "image/jpeg",
              sync: true,
            });
            const src = result.images[0]?.src;
            return src ? (await imageSrcToBuffer(src)).buffer : null;
          },
        },
      ];

      let cleanedBuffer: Buffer | null = null;
      let usedChannel = "";
      if (hasLineDeletion) {
        console.log(
          "[text_edit] 检测到删除整行，跳过引擎/美图/佐糖，直接用本地像素擦除" +
          "（实测擦净率 100%，引擎仅 37.3%）",
        );
      }
      for (const channel of eraseChannels) {
        try {
          const candidate = await channel.run();
          if (!candidate) {
            console.log(`[text_edit] ${channel.name} 未返回有效图片，尝试下一通道`);
            continue;
          }
          const erased = await hasVisibleLocalEdit(
            sourceImageData.buffer,
            candidate,
            maskImageData.buffer,
            targetWidth,
            targetHeight,
            { pixelDifferenceThreshold: 10, minChangedPixels: 30, minChangedRatio: 0.001 },
          );
          if (!erased) {
            console.log(`[text_edit] ${channel.name} 完成但 mask 区域无明显变化，尝试下一通道`);
            continue;
          }
          cleanedBuffer = candidate;
          usedChannel = channel.name;
          break;
        } catch (error) {
          console.log(
            `[text_edit] ${channel.name} 失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // 最后一道保障：本地像素擦除。不依赖任何外部服务，
      // 保证只要有 OCR 区域就能拿到底图，从而始终走确定性渲染。
      if (!cleanedBuffer && input.textRegions?.length && input.editedText?.trim()) {
        try {
          cleanedBuffer = await eraseTextRegionsLocally(
            sourceImageData.buffer,
            input.textRegions,
            input.editedText,
            targetWidth,
            targetHeight,
          );
          usedChannel = "本地像素擦除";
        } catch (error) {
          console.log(
            `[text_edit] 本地擦除失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (cleanedBuffer) {
        const cleanedData = { buffer: cleanedBuffer, mimeType: "image/png" };
        sourceImageData = cleanedData;
        sourceImage = bufferToImageFile(cleanedData.buffer, cleanedData.mimeType);
        textEditInstruction +=
          "\nThe masked text areas have already been cleared to clean original background. " +
          "Keep that cleaned background unchanged and only paint the replacement text inside the mask.";
        /**
         * 擦字成功后，源图里已经没有原文字了。
         * 但上面 textEditInstruction 基线还写着「移除原有可读文字」——
         * 模型读到一个不存在的指令，可能会去"找文字"并误伤画面元素。
         * 这里把要写入的目标文案显式喂进去，把任务从「改写」收敛为「写入」。
         */
        if (input.editedText?.trim()) {
          textEditInstruction +=
            `\nThe exact replacement text to render is:\n${input.editedText.trim()}\n` +
            "Render this text verbatim — do not translate, paraphrase, reorder, or add any extra words. " +
            "Match the original typography style, weight, color, perspective and lighting of the area.";
        }
        console.log(
          `[text_edit] 擦字成功（通道：${usedChannel}），` +
          `贴回方式=${input.textApplyMode === "ai" ? "AI 叠字(image2.5)" : "本地确定性绘制"}`,
        );
      } else {
        console.log(`[text_edit] 所有擦除通道均失败，降级为直接编辑`);
      }
    } catch (error) {
      console.log(
        `[text_edit] 擦字阶段异常，降级为直接编辑: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ── 阶段 B：确定性文字绘制（text_edit + 携带 OCR 区域 + 擦字成功）──────
  // 美图擦字成功（sourceImageData 已被替换为擦字图）时，直接按 OCR 区域把新文字
  // 绘制到擦字图上，跳过 AI 叠字，彻底避免模型在 mask 内重造背景导致"背景不正常"。
  if (
    isTextEditOperation &&
    // 默认走本地确定性绘制（逐字 100% 准确）。只有显式要求 "ai" 时才跳过这里，
    // 把叠字交给 image2.5 —— 风格还原更好，但实测会漏字/错字，需人工核字。
    // 注意：选了 "ai" 之后失败不会回落到这里（阶段 B 已被跳过），
    // 而是沿 editViaReferenceGeneration 的 fallback 链换下一个模型重试。
    input.textApplyMode !== "ai" &&
    maskImageData &&
    input.textRegions?.length &&
    input.editedText?.trim() &&
    sourceImageData !== originalSourceImageData
  ) {
    try {
      console.log(
        `[text_edit debug] editedText="${input.editedText}", regions=${JSON.stringify(input.textRegions)}, target=${targetWidth}x${targetHeight}`,
      );
      const drawn = await drawTextReplacement({
        imageBuffer: sourceImageData.buffer,
        originalBuffer: originalSourceImageData.buffer,
        textRegions: input.textRegions,
        editedText: input.editedText,
        targetWidth,
        targetHeight,
      });

      // 步骤 5：质量自检。绘制没画上或画成色块时主动放弃方案 B，
      // 交给后面的 AI 叠字兜底，避免把明显有问题的结果直接返回给用户。
      const quality = await verifyDrawnTextQuality(
        sourceImageData.buffer,
        drawn,
        input.textRegions,
        input.editedText,
        targetWidth,
        targetHeight,
      );
      if (!quality.ok) {
        throw new Error(`确定性绘制质量校验未通过：${quality.reason}`);
      }

      // 用"仅覆盖被修改文字区域"的精确 mask 做合成：
      // 被修改 region 内使用擦字图+新文字；其余区域（含未修改文字、多余背景）全部用原图恢复，
      // 彻底解决"只改一行却擦了两行"导致的背景色块问题。
      const modifiedMask = await createModifiedRegionsMask(
        input.textRegions!,
        input.editedText!,
        targetWidth,
        targetHeight,
      );
      const composited = await __testCompositeSourcePreservingImageEdit(
        originalSourceImageData.buffer,
        drawn,
        modifiedMask,
        targetWidth,
        targetHeight,
      );
      await writeTextEditDebugArtifacts({
        cleaned: sourceImageData.buffer,
        drawn,
        mask: modifiedMask,
        composited,
      });
      console.log(
        `[text_edit] 确定性文字绘制完成（${input.textRegions.length} 个区域，走方案 B）`,
      );
      return {
        images: [
          {
            src: `data:image/png;base64,${composited.toString("base64")}`,
            width: targetWidth,
            height: targetHeight,
          },
        ],
      };
    } catch (error) {
      console.log(
        `[text_edit] 确定性文字绘制失败，降级为 AI 叠字: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const cameraViewInstruction = isCameraViewOperation
    ? buildCameraViewEditInstruction(input)
    : "";
  const finalizeImages = async (images: GeneratedImage[]) => {
    const normalizedImages = await __testNormalizeGeneratedImagesToTargetAspect(
      images,
      targetWidth,
      targetHeight,
    );
    if (!isSourcePreservingEdit || !maskImageData) return normalizedImages;
    return Promise.all(normalizedImages.map(async image => {
      const editedImageData = await imageSrcToBuffer(image.src);
      const composited = await __testCompositeSourcePreservingImageEdit(
        originalSourceImageData.buffer,
        editedImageData.buffer,
        maskImageData.buffer,
        targetWidth,
        targetHeight,
      );
      return {
        src: `data:image/png;base64,${composited.toString("base64")}`,
        width: targetWidth,
        height: targetHeight,
      };
    }));
  };
  const editViaReferenceGeneration = async () => {
    const sourceDataUrl = `data:${sourceImageData.mimeType};base64,${sourceImageData.buffer.toString("base64")}`;
    const usesLocalEditGuide = requiresVisibleLocalChange && Boolean(maskImageData);
    const editGuideDataUrl = usesLocalEditGuide && maskImageData
      ? `data:image/png;base64,${(await createLocalEditGuideImage(
          sourceImageData.buffer,
          maskImageData.buffer,
          targetWidth,
          targetHeight,
        )).toString("base64")}`
      : "";
    const aspect = targetWidth / Math.max(1, targetHeight);
    // 优先使用与源图比例接近的 2:3，避免 VOD 参考图生成被错误地裁剪到 9:16。
    const ratio = aspect > 1.2
      ? "16:9"
      : aspect < 0.85
        ? (aspect < 0.65 ? "9:16" : "2:3")
        : "1:1";
    const referenceModels =
      usesAutoModel && (requiresVisibleLocalChange || usesCameraViewAutoModel)
        ? selectedModels
        : requiresVisibleLocalChange
          ? Array.from(new Set([requestedModel, ...getImageModelFallbackAttempts("auto")]))
          : [requestedModel];
    let lastError: unknown;

    for (const referenceModel of referenceModels) {
      try {
        const result = await generateImages({
          prompt: [
            input.prompt,
            textEditInstruction,
            cameraViewInstruction,
            isCameraViewOperation
              ? "Reference image 1 tells you what the scene contains and what everything looks like — it is NOT the target composition. Re-render that entire scene, subject and environment together, from the new camera position described above."
              : "Use reference image 1 as the target canvas. Preserve its subject identity, composition, camera angle, lighting, proportions, and aspect ratio unless the user explicitly asks to change them.",
            editGuideDataUrl
              ? "Reference image 2 is a visual edit guide derived from reference image 1. Its translucent orange overlay marks the only area allowed to change; the overlay itself is not content and must not appear in the result. Every unmarked area must remain visually identical to reference image 1."
              : "",
            "Use any later reference images only for the requested object, accessory, style, texture, or detail.",
            "Return one complete edited image, not a text explanation.",
            aspectInstruction,
            textEditNegativeInstruction,
          ].join("\n\n"),
          model: referenceModel,
          ratio,
          count: 1,
          preferImageApiForReferences: requiresVisibleLocalChange,
          // 视角转换必须关掉 VOD 服务端的 prompt 增强：
          // 它会把这段 3000+ 字符的空间约束整体重写，「整个场景一起转」这类
          // 精确指令会在重写中被稀释掉，退化成普通的「保持原图风格」，
          // 表现就是主体转了、背景没转。同 :3922 智能注释的处理。
          enhancePrompt: isCameraViewOperation ? false : undefined,
          images: [
            { src: sourceDataUrl, title: "target image" },
            ...(editGuideDataUrl ? [{ src: editGuideDataUrl, title: "local edit guide" }] : []),
            ...referenceImages,
          ],
        });
        const images = await finalizeImages(result.images);
        if (requiresVisibleLocalChange && maskImageData && images[0]) {
          const editedImageData = await imageSrcToBuffer(images[0].src);
          if (!await hasVisibleLocalEdit(
            sourceImageData.buffer,
            editedImageData.buffer,
            maskImageData.buffer,
            targetWidth,
            targetHeight,
            isTextEditOperation
              ? { pixelDifferenceThreshold: 12, minChangedPixels: 8, minChangedRatio: 0.0005 }
              : undefined,
          )) {
            throw new Error("图片模型没有在指定区域做出可见修改");
          }
        }
        return { images };
      } catch (error) {
        lastError = error;
        if (!usesAutoModel || !(requiresVisibleLocalChange || usesCameraViewAutoModel)) throw error;
      }
    }

    throw lastError || new Error("图片模型未返回可用局部编辑结果");
  };

  /**
   * VOD 系模型（vod-gem / vod-og…）必须直接走参考图生成路径。
   *
   * 它们不是 OpenAI 兼容通道，没有 /images/edits 这个端点：
   * 下面 createBody 那套 multipart 请求发过去必然失败，只能靠
   * isImageEditEndpointUnavailable 兜底再绕回 editViaReferenceGeneration，
   * 白白多打一次注定失败的请求，还得指望上游的错误信息刚好能被识别成
   * 「端点不可用」——一旦上游改了文案，兜底就会失灵，直接把错误抛给用户。
   *
   * editViaReferenceGeneration 内部调 generateImages，那里的 :4026
   * 会把 vod-* 正确路由到 VOD AIGC 异步任务链路，才是这些模型该走的路。
   */
  if (isChatCompatibleImageModel(selectedModel) || isVodModelId(selectedModel)) {
    return editViaReferenceGeneration();
  }

  const createBody = async (
    withResponseFormat: boolean,
    providerModel = selectedModel,
  ) => {
    const body = new FormData();
    body.append("model", providerModel);
    body.append("image", sourceImage);
    if (maskImageData) {
      body.append("mask", bufferToImageFile(maskImageData.buffer, maskImageData.mimeType));
    } else if (maskUrl) {
      body.append("mask_url", maskUrl);
    }
    for (const image of referenceImages.slice(0, 6)) {
      body.append("image", await imageSrcToFile(image.src));
    }
    body.append("prompt", [
      input.prompt,
      textEditInstruction,
      cameraViewInstruction,
      referenceImages.length
        ? [
            "Use the source image as the target canvas and preserve its subject identity, pose, composition, background, lighting, and aspect ratio.",
            "Use the additional reference images only as visual references for the specific objects, accessories, style, texture, or details requested by the user.",
            "Do not create a new unrelated person, scene, or background.",
            ...referenceImages.map((image, index) => `Reference image ${index + 1}: ${image.title || "untitled"}`),
          ].join("\n")
        : "",
      maskImageData || maskUrl
        ? "A local edit mask is provided. Edit only the transparent/bright marked area from the mask and preserve all unmasked pixels from the source image."
        : "",
      isCameraViewOperation
        ? "For this camera-view operation, the source image is the locked visual content reference. Generate a new coherent camera viewpoint while keeping scene content stable; do not treat it as a masked local edit."
        : "",
      aspectInstruction,
      textEditNegativeInstruction,
    ].filter(Boolean).join("\n\n"));
    body.append("n", "1");
    body.append("size", editSize);
    if (withResponseFormat) body.append("response_format", "b64_json");
    return body;
  };

  let providerData: ImageGenerationResponse | undefined;
  try {
    providerData = await callImageEditProvider(await createBody(true), apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isTextEditOperation && isProviderGatewayError(message)) {
      let fallbackError: unknown = error;
      for (const fallbackModel of selectedModels.slice(1)) {
        if (isChatCompatibleImageModel(fallbackModel)) continue;
        try {
          providerData = await callImageEditProvider(
            await createBody(true, fallbackModel),
            apiKey,
            baseUrl,
          );
          fallbackError = null;
          break;
        } catch (candidateError) {
          fallbackError = candidateError;
        }
      }
      if (!fallbackError) {
        // A compatible image-edit provider succeeded and stays on the source-preserving path.
      } else {
        throw fallbackError;
      }
    } else {
    if (isImageEditEndpointUnavailable(error)) {
      return editViaReferenceGeneration();
    }
    if (!message.toLowerCase().includes("response_format")) throw error;
    try {
      providerData = await callImageEditProvider(await createBody(false), apiKey, baseUrl);
    } catch (fallbackError) {
      if (isImageEditEndpointUnavailable(fallbackError)) {
        return editViaReferenceGeneration();
      }
      throw fallbackError;
    }
    }
  }

  if (!providerData) {
    throw new Error("图片模型未返回可用编辑结果，请稍后重试");
  }

  const asyncTaskId = providerData.task_id || providerData.taskId;
  if (asyncTaskId) {
    providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
  }

  const images = await finalizeImages(
    extractGeneratedImages(providerData, baseUrl, targetWidth, targetHeight)
  );

  if (images.length === 0) {
    if (isTextEditOperation) {
      throw new Error("图片模型未返回保真文字编辑结果，已停止生成以保护原图，请稍后重试");
    }
    return editViaReferenceGeneration();
  }

  if (requiresVisibleLocalChange && maskImageData && images[0]) {
    const editedImageData = await imageSrcToBuffer(images[0].src);
    const hasVisibleChange = await hasVisibleLocalEdit(
      sourceImageData.buffer,
      editedImageData.buffer,
      maskImageData.buffer,
      targetWidth,
      targetHeight,
      isTextEditOperation
        ? { pixelDifferenceThreshold: 12, minChangedPixels: 8, minChangedRatio: 0.0005 }
        : undefined,
    );
    if (!hasVisibleChange) {
      if (usesAutoModel) return editViaReferenceGeneration();
      throw new Error("图片模型没有在指定区域做出可见修改");
    }
  }

  return { images };
}

export async function eraseImageObjects(input: EraseImageInput): Promise<GeneratedImageResult> {
  const sourceImageSrc = input.imageSrc?.trim();
  const sourceImageUrl = (input.imageUrl || input.image_url || "").trim();
  const maskSrc = input.maskSrc?.trim();
  const maskUrl = (input.maskUrl || input.mask_url || "").trim();
  if (!sourceImageSrc && !sourceImageUrl) {
    throw new Error("Missing imageSrc");
  }
  if (!maskSrc && !maskUrl && !input.rectangles) {
    throw new Error("Missing maskSrc");
  }

  const sourceImageData = sourceImageSrc ? await imageSrcToBuffer(sourceImageSrc) : null;
  const maskImageData = maskSrc ? await imageSrcToBuffer(maskSrc) : null;
  const sourceImageDimensions = sourceImageData
    ? await getImageBufferDimensions(sourceImageData.buffer)
    : { width: coerceTargetDimension(input.targetWidth) || 1024, height: coerceTargetDimension(input.targetHeight) || 1024 };
  const targetSize = __testResolveHighDefinitionTargetSize(
    input.targetWidth,
    input.targetHeight,
    sourceImageDimensions.width,
    sourceImageDimensions.height,
  );
  const targetWidth = targetSize.width;
  const targetHeight = targetSize.height;
  const providerMaskBuffer = maskImageData
    ? await createPicWishEraseMask(maskImageData.buffer, targetWidth, targetHeight)
    : undefined;
  const providerImageBuffer = sourceImageData
    ? await __testPreparePicWishEraseSourceImage(sourceImageData.buffer, targetWidth, targetHeight)
    : undefined;
  const sync = input.sync === true || input.sync === 1 || input.sync === "1";
  const picWishResult = await eraseWithPicWish({
    imageBuffer: providerImageBuffer,
    imageMimeType: providerImageBuffer ? "image/png" : undefined,
    imageUrl: sourceImageUrl || undefined,
    maskBuffer: providerMaskBuffer,
    maskMimeType: providerMaskBuffer ? "image/png" : undefined,
    maskUrl: maskUrl || undefined,
    rectangles: input.rectangles,
    sync,
  });
  const normalized = await __testNormalizeGeneratedImagesToTargetAspect(picWishResult.images, targetWidth, targetHeight);
  if (normalized.length === 0) {
    throw new Error("AI 擦除未返回可用内容，请稍后重试");
  }
  return withProviderTaskIds({ images: normalized }, collectProviderTaskIds(picWishResult));
}

export async function createElementBackgroundLayer(input: ElementBackgroundInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  if (!input.foregroundLayerSrc?.trim()) {
    throw new Error("Missing foregroundLayerSrc");
  }

  const sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const foregroundLayerData = await imageSrcToBuffer(input.foregroundLayerSrc);
  const sourceImageDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const targetSize = __testResolveHighDefinitionTargetSize(
    input.targetWidth,
    input.targetHeight,
    sourceImageDimensions.width,
    sourceImageDimensions.height,
  );
  const targetWidth = targetSize.width;
  const targetHeight = targetSize.height;
  const providerMaskBuffer = await createPicWishForegroundRemovalMask(
    foregroundLayerData.buffer,
    targetWidth,
    targetHeight,
  );
  const providerImageBuffer = await __testPreparePicWishEraseSourceImage(
    sourceImageData.buffer,
    targetWidth,
    targetHeight,
  );
  const sync = input.sync === true || input.sync === 1 || input.sync === "1";
  const picWishResult = await eraseWithPicWish({
    imageBuffer: providerImageBuffer,
    imageMimeType: "image/png",
    maskBuffer: providerMaskBuffer,
    maskMimeType: "image/png",
    sync,
  });
  const normalized = await __testNormalizeGeneratedImagesToTargetAspect(
    picWishResult.images,
    targetWidth,
    targetHeight,
  );
  if (normalized.length === 0) {
    throw new Error("背景层未返回可用图片");
  }
  return withProviderTaskIds({ images: normalized }, collectProviderTaskIds(picWishResult));
}

export async function expandImageWithPicWish(input: ExpandImageInput): Promise<GeneratedImageResult> {
  const sourceImageSrc = input.imageSrc?.trim();
  const sourceImageUrl = (input.imageUrl || input.image_url || "").trim();
  const maskSrc = input.maskSrc?.trim();
  const maskUrl = (input.maskUrl || input.mask_url || "").trim();
  if (!sourceImageSrc && !sourceImageUrl) {
    throw new Error("Missing imageSrc");
  }

  const sourceImageData = sourceImageSrc ? await imageSrcToBuffer(sourceImageSrc) : null;
  const maskImageData = maskSrc ? await imageSrcToBuffer(maskSrc) : null;
  const sourceImageDimensions = sourceImageData
    ? await getImageBufferDimensions(sourceImageData.buffer)
    : { width: coerceTargetDimension(input.targetWidth) || 1024, height: coerceTargetDimension(input.targetHeight) || 1024 };
  const providerImageData = sourceImageData
    ? await __testPreparePicWishExpansionSourceImage(sourceImageData.buffer, sourceImageData.mimeType)
    : null;
  const providerMaskBuffer = maskImageData && providerImageData
    ? await preparePicWishExpansionMask(maskImageData.buffer, providerImageData.width, providerImageData.height)
    : maskImageData?.buffer;
  const requestedWidth = coerceTargetDimension(input.targetWidth) || sourceImageDimensions.width;
  const requestedHeight = coerceTargetDimension(input.targetHeight) || sourceImageDimensions.height;
  const targetSize = __testResolveHighDefinitionTargetSize(
    requestedWidth,
    requestedHeight,
    sourceImageDimensions.width,
    sourceImageDimensions.height,
  );
  const targetWidth = targetSize.width;
  const targetHeight = targetSize.height;
  const top = coerceOptionalNumber(input.top);
  const bottom = coerceOptionalNumber(input.bottom);
  const left = coerceOptionalNumber(input.left);
  const right = coerceOptionalNumber(input.right);
  const sync = input.sync === true || input.sync === 1 || input.sync === "1";
  const picWishResult = await runPicWishImageExpansion({
    imageBuffer: providerImageData?.buffer,
    imageMimeType: providerImageData?.mimeType,
    imageUrl: sourceImageUrl || undefined,
    maskBuffer: providerMaskBuffer,
    maskMimeType: providerMaskBuffer ? "image/png" : maskImageData?.mimeType,
    maskUrl: maskUrl || undefined,
    sync,
    prompt: input.prompt,
    top,
    bottom,
    left,
    right,
    strength: coerceOptionalNumber(input.strength),
    scale: coerceOptionalNumber(input.scale),
    steps: coerceOptionalNumber(input.steps),
    seed: coerceOptionalNumber(input.seed),
  });
  const normalized = await __testNormalizeGeneratedImagesToTargetAspect(picWishResult.images, targetWidth, targetHeight);
  if (normalized.length === 0) {
    throw new Error("AI 扩图未返回可用内容，请稍后重试");
  }
  return withProviderTaskIds({ images: normalized }, collectProviderTaskIds(picWishResult));
}
