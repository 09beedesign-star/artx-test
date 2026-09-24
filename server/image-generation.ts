import fs from "fs";
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
import { DEFAULT_TEXT_MODEL, isClaudeTextModelId } from "../shared/text-models";
import { resolveImageResolutionTier } from "../shared/ai-credit-policy";
import { DEFAULT_AUTO_RATIO, resolveImageRatio } from "../shared/image-ratios";
import { clampImageExpansionPrompt, VOD_EXPANSION_PROMPT_MAX_LENGTH } from "../shared/image-expansion";
import { buildTextEditGlobalPrompt, buildTextEditLanguageHint } from "../shared/text-edit-global-prompt";
import { generateText } from "./text-generation";
import { recordImageProviderFailure } from "./image-provider-failure-log";
import { buildInpaintMask, measureMaskSurroundingFlatness } from "./inpaint-mask";
import { eraseTextWithEngine, isTextEngineConfigured } from "./text-engine-client";
import {
  drawTextReplacement,
  eraseTextInkLocally,
  createModifiedRegionsMask,
  createInkLevelEditMask,
  dilateMaskTransparent,
  verifyDrawnTextQuality,
  eraseTextRegionsLocally,
  measureRegionEdgeEnergy,
  calibrateTextRegions,
  resolveRegionTargetTexts,
} from "./text-replace-precise";
import {
  generateImageWithVod,
  isVodAigcConfigured,
  createVodImageExpandTask,
  pollVodTask,
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
  /**
   * 提示词里解析出来的目标像素（来自 shared/prompt-size-intent.ts）。
   *
   * ⚠️⚠️ 为什么必须是「像素」而不是「4k」这种标签：
   * 上游档位有限（ratioToSize 长边最大 1536），没有任何参数能让它直出 4K。
   * 4K 只能是「上游出 1536 → 落库前等比放大到目标像素」，
   * 所以这里必须拿到具体数字，标签没人能消费。
   *
   * ⚠️⚠️ 不传时行为与改造前**完全一致**（targetSize 仍由 ratio 推导）。
   * 这是刻意的：没有尺寸意图的请求一个像素都不该变。
   */
  targetWidth?: number;
  targetHeight?: number;
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
  sceneType?: number;
  ratio?: string;
  resolution?: "1k" | "2k" | "4k";
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
  /**
   * 「输出尺寸必须等于原图像素」的显式信号（2026-09-22）。
   *
   * ⚠️⚠️ 刻意**不**复用 preserveSource：那个字段还兼管「蒙版外回贴」，
   * 搭车会让普通重绘意外获得像素级回贴行为（重绘内容被原图盖回去）。
   * 📌 判据：一个布尔同时控两种语义时，新需求必须另开字段。
   */
  preserveSourceSize?: boolean;
  /**
   * 「这是画布框选式局部重绘」的显式信号（2026-09-23）。
   *
   * ⚠️⚠️⚠️ 存在的唯一理由：`editSmartAnnotationImage` 里 `isVodMaskModel` 分支
   * 会**直接 return、跳过蒙版贴回**，理由写的是「VOD 服务端已保证蒙版外保持原图」。
   * 该前提对涂鸦式智能注释成立（贴回会擦掉超出涂鸦点的生成内容，如眼镜只剩一半），
   * 但对框选式局部重绘**不成立** —— 2026-09-23 线上实测：OG 出图带外改动率 16.27%
   * （白字区 51%、右下角 74%、maxDelta 239），即上游压根没真守蒙版，且零报错。
   *
   * 📌⭐⭐⭐ 判据：「上游承诺了约束」永远不能替代「自己再贴回一次」。
   *    两条链路对同一个 early-return 的正确性要求相反时，必须靠显式字段分流，
   *    不能复用 preserveSource（智能注释也传它，复用等于把两条链路一起改掉）。
   */
  regionSelectEdit?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  images?: Array<{ src: string; title?: string }>;
  cameraView?: {
    x?: number;
    y?: number;
    z?: number;
    prompt?: string;
  };
  /**
   * 基础约束语义（智能注释）：
   * - "add"（默认）：mask 内保留原内容，只在上方添加请求物体（帽子/眼镜等）
   * - "edit"：mask 内修改用户指定的属性（换色/换材质/换纹理等），保持形状结构与其余区域不变
   *
   * ⚠️ 2026-09-13 核实：**当前没有任何调用方传这个字段**。它不在 OrchestrateRequest
   * 里，ai-orchestrator 透传时也没带它，前端更没有。所以下面那个 `=== "edit"` 分支
   * 恒假，实际永远走 "add" 模板。保留它是因为 "edit" 模板本身有价值（换色/换材质
   * 场景需要），属于「待接线的功能缺口」，不是残留死代码 —— 要用就得从前端一路传下来。
   */
  promptKind?: "add" | "edit";
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
  // 3:2 此前缺失，选了它会静默落到 1:1。
  "3:2": { size: "1536x1024", width: 1536, height: 1024 },
  "16:9": { size: "1536x1024", width: 1536, height: 864 },
  "9:16": { size: "1024x1536", width: 864, height: 1536 },
  "21:9": { size: "1536x1024", width: 1536, height: 658 },
};

/**
 * 【2026-09-13】比例 → 尺寸的统一入口。
 *
 * 原先各调用点写的是 `ratioToSize[input.ratio || "1:1"] || ratioToSize["1:1"]`：
 * 表里没有 "auto"，传 auto 会**静默**变成 1024×1024 方图，零报错。
 * 现在先用 shared/image-ratios 的 resolveImageRatio 归一化，默认值与前端同源。
 */
function resolveRatioSize(ratio?: string | null) {
  const resolved = resolveImageRatio(ratio);
  return ratioToSize[resolved] || ratioToSize[DEFAULT_AUTO_RATIO] || ratioToSize["1:1"];
}

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
 *
 * ⚠️ 写作口径（2026-09-13 按用户要求定稿，别再写回去）：
 * 这里是**用户选型时看的能力优势**，不是价格表。
 *   - ❌ 不写具体单价（"70 积分/张""约 0.5 元"）—— 那是计费口径，由张数面板和
 *        计费提示负责，写进来既重复又会在调价后静默失效。
 *   - ✅ 可以写"高性价比"这类定性判断，但**只能贴在性能/价格比确实突出的档位**。
 *        ⚠️ 性价比 ≠ 便宜：low 档 40 积分是全站最低，但出图是草稿级，
 *        贴"高性价比"等于把用户往质量不达标的档位上引 → 它只写"适合打草稿"。
 *        当前允许贴的三个：medium 两系（70 积分，全站默认基准，质量够日常成稿）
 *        与 vod-jimeng（120 积分，非 og25 系里最低价且效果扎实）。
 *        ⚠️ 改 shared/ai-credit-policy.ts 的单价时必须回头复核这三条还成不成立。
 *   - ❌ 不写"另一画风"这类相对说法 —— 脱离上一行就没有意义。
 *   - ✅ 写行业通用的能力标签：人像、写实、国风电商、中文排版、指令理解、出图速度。
 *   - ✅ 长度 ≤20 字（UI 那行 maxWidth 150px + truncate，超了直接被截断）。
 * 防护测试：server/image-model-descriptions.test.ts。
 */
const imageModelDescriptions: Record<string, string> = {
  "gpt-image-2": "通用场景，表现稳定",
  "gpt-image-2-4k": "4K 超清，细节丰富",
  "gemini-3.1-flash-image": "响应快，适合批量出图",
  "gemini-3.1-flash-image-preview": "预览版，出图速度快",
  // OG image2.5（腾讯 VOD 直连，2026-09-11 起为全站默认）
  // sunburst / flare 是两个并列画风系列，价格完全相同（tencent-vod-aigc.ts:352），
  // 所以文案只描述画风差异，不能写成"另一画风"这种零信息量的相对说法 ——
  // 用户在下拉里看到"另一画风"根本不知道该不该切。
  "vod-og25-sunburst-medium": "高性价比，日常首选",
  "vod-og25-flare-medium": "高性价比，色彩浓郁",
  "vod-og25-sunburst-low": "出图快，适合打草稿",
  "vod-og25-flare-low": "快速试风格与配色",
  "vod-og25-sunburst-high": "高清细节，适合成稿",
  "vod-og25-flare-high": "高清质感，氛围感强",
  // 其余 VOD 直连模型。这些此前只在前端 workspace-data.ts 里有文案，
  // 服务端目录接口没有，导致 /api/ai/models 把它们回成裸 id + 默认图标 ——
  // UI 因为有本地清单看不出来，直接消费该接口的第三方才会踩到。
  "vod-gem": "指令理解准，改图听话",
  "vod-gem-lite": "响应快，适合多轮微调",
  "vod-og": "画面稳定，长文案不崩",
  "vod-mj": "艺术表现强，构图出彩",
  "vod-kling": "国风人像与电商主图",
  "vod-si": "真实感强，接近摄影",
  "vod-qwen": "中文排版与海报文字",
  "vod-jimeng": "性价比高，国潮插画",
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
  // ⚠️ 这张表下发的 icon **优先级高于前端硬编码**（mergeImageAiModelOptions
  // 里服务端条目优先）。只改前端 workspace-data.ts 会被线上下发值覆盖，
  // 表现为「本地开发有图标、线上没有」—— 两边必须同时改。
  "vod-si": "si",
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

/**
 * 从中转站响应里提取**上游真实**任务号，用于向供应商核查工单。
 *
 * ⚠️ 不要用 createImageProviderRequestId() 生成的 `img_xxx` 充数 ——
 * 那是本机自增串，供应商日志里根本查不到，写进 providerTaskId 等于制造
 * 「看起来有号、实际对不上账」的假数据。
 *
 * 中转站是 OpenAI 兼容网关，真实标识可能出现在响应头（多数网关）或响应体，
 * 这里按「响应头优先、其次响应体」的顺序探测常见键名，一个都没有就返回
 * undefined，让上层如实记为缺失。
 */
function extractRelayProviderTaskId(
  response: Response,
  data: ImageGenerationResponse,
): string | undefined {
  const headerKeys = ["x-request-id", "x-trace-id", "request-id", "cf-ray", "x-amzn-requestid"];
  for (const key of headerKeys) {
    const value = response.headers.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const bodyCandidates = [
    data.task_id,
    data.taskId,
    (data as { id?: unknown }).id,
    (data as { request_id?: unknown }).request_id,
  ];
  for (const candidate of bodyCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
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

  // 把上游任务号挂到返回对象上，供 generateImages 汇总进 providerTaskIds。
  const upstreamTaskId = extractRelayProviderTaskId(response, data);
  if (upstreamTaskId && !data.task_id && !data.taskId) {
    data.task_id = upstreamTaskId;
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

/**
 * 由蒙版外环的亮度稳健极差判定背景复杂度（2026-09-13）。
 *
 * 返回值决定 text_edit 擦字链里「本地像素擦除」与「佐糖生成式 inpaint」的先后顺序：
 *   flat / smooth → 本地优先。生成式模型在平涂与柔和渐变上没有可参考的纹理，
 *                   只会脑补出色块、明暗不匀和接缝（用户反馈的「纯色背景回填很一般」）。
 *   textured      → 佐糖优先。照片与复杂纹理上本地插值会拉出水平条纹，反而更显眼。
 *
 * 阈值与 measureMaskSurroundingFlatness 的注释同步维护。sampleCount 为 0
 * （蒙版占满全图、没有外环可采样）时按 textured 兜底，链路行为与接入前完全一致。
 */
function classifyBackgroundComplexity(
  robustSpread: number,
  sampleCount: number,
): "flat" | "smooth" | "textured" {
  if (sampleCount === 0) return "textured";
  if (robustSpread < 12) return "flat";
  if (robustSpread < 26) return "smooth";
  return "textured";
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

export const __testClampImageExpansionPrompt = clampImageExpansionPrompt;

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
  // PicWish advanced-image-expand 的 prompt 硬上限是 200 字符（2026-09-12 实测：
  // 200 受理、201 即返回 `Invalid params 'prompt', length must not exceed 200`）。
  // 此前写成 slice(0, 500)，导致长提示词扩图必定 400 失败。切勿再调大。
  const expansionPrompt = clampImageExpansionPrompt(input.prompt);
  if (expansionPrompt) body.append("prompt", expansionPrompt);
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

/**
 * 上游擦除相对本地结果的「残留能量」容忍倍数。
 *
 * 取 1.15 而非 1.0：上游保留真实纹理时能量本就略高于本地的平滑雾化，
 * 严格小于会把「保住了背景细节」误判成「脑补」。而脑补砖墙这类事故
 * 实测是数倍差距，1.15 足以分开两者。
 */
const UPSTREAM_ERASE_ENERGY_TOLERANCE = 1.15;

/** 佐糖凭据是否可用（缺失时整条上游擦除通道直接让位，行为与接入前一致）。 */
function isPicWishConfigured(): boolean {
  return Boolean(process.env.PICWISH_API_KEY || process.env.AOS_API_KEY);
}

/**
 * 复杂纹理背景下优先走上游 inpaint，拿不到就返回 null 由调用方回落本地。
 *
 * ⚠️⚠️⚠️ 三条保护缺一不可（都来自已发生过的事故）：
 * 1. **必须做蒙版外回贴**。上游返回的是整图，可能顺手改了别处（背景改色、主体变形），
 *    只校验「蒙版内有变化」的话，一张被整体重画的图也能通过。
 * 2. **必须校验蒙版内真的变了**。上游偶尔原样返回（额度耗尽/任务失败但 HTTP 200），
 *    不校验就会把「没擦」当成「擦好了」，残影零报错存活。
 * 3. **任何异常都回落本地，绝不抛出**。擦除是增强步骤，不能让它阻断整条改字链路。
 */
async function erasePreferUpstream(args: {
  originalBuffer: Buffer;
  originalMimeType: string;
  maskBuffer: Buffer;
  localFallback: Buffer;
  textRegions: Array<{ x: number; y: number; width: number; height: number }>;
  width: number;
  height: number;
}): Promise<Buffer | null> {
  try {
    const inpaintMask = await buildInpaintMask(args.maskBuffer, args.width, args.height);
    const result = await eraseWithPicWish({
      imageBuffer: args.originalBuffer,
      imageMimeType: args.originalMimeType,
      maskBuffer: inpaintMask,
      maskMimeType: "image/jpeg",
      sync: true,
    });
    const src = result.images[0]?.src;
    if (!src) {
      console.log("[text_edit] 佐糖 inpaint 未返回图像，回落本地扩散填充");
      return null;
    }
    const edited = await imageSrcToBuffer(src);
    // 保护 1：蒙版外一律用原图，把上游的自由发挥关回蒙版内
    const composited = await __testCompositeSourcePreservingImageEdit(
      args.originalBuffer,
      edited.buffer,
      args.maskBuffer,
      args.width,
      args.height,
    );
    // 保护 2：蒙版内必须真的发生了变化，否则视为没擦
    const changed = await hasVisibleLocalEdit(
      args.originalBuffer,
      composited,
      args.maskBuffer,
      args.width,
      args.height,
    );
    if (!changed) {
      console.log("[text_edit] 佐糖 inpaint 结果与原图无差异，回落本地扩散填充");
      return null;
    }

    /**
     * 保护 4：必须与本地结果比「残留能量」再决定采纳。
     *
     * ⚠️⚠️⚠️ 这条是本轮实测补上的，缺了它上游就是**无条件采纳**：
     * 篮球海报上佐糖把整行文字擦掉后，**脑补出了一整片不存在的砖块/岩石纹理**
     * ——原字确实没了（保护 2 判定「变了」通过），但画面比本地雾化更离谱。
     *
     * 📌⭐⭐⭐ **「上游调用成功」「蒙版内确实变了」都不等于「结果更好」。**
     *    换上游必须带可量化的择优，否则只是把一种失败换成另一种失败。
     *
     * 判据用现成的区域梯度能量：擦干净 ⇒ 平滑 ⇒ 低；脑补出纹理 ⇒ 边缘多 ⇒ 高。
     */
    const eraseRegions = args.textRegions.map(r => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    }));
    const [upstreamEnergy, localEnergy] = await Promise.all([
      measureRegionEdgeEnergy(composited, eraseRegions, args.width, args.height),
      measureRegionEdgeEnergy(args.localFallback, eraseRegions, args.width, args.height),
    ]);
    if (upstreamEnergy > localEnergy * UPSTREAM_ERASE_ENERGY_TOLERANCE) {
      console.log(
        `[text_edit] 佐糖 inpaint 脑补痕迹过重（能量 ${upstreamEnergy.toFixed(1)} > ` +
          `本地 ${localEnergy.toFixed(1)} ×${UPSTREAM_ERASE_ENERGY_TOLERANCE}），回落本地扩散填充`,
      );
      return null;
    }
    console.log(
      `[text_edit] 佐糖 inpaint 擦除采纳（能量 ${upstreamEnergy.toFixed(1)} <= ` +
        `本地 ${localEnergy.toFixed(1)} ×${UPSTREAM_ERASE_ENERGY_TOLERANCE}）`,
    );
    return composited;
  } catch (error) {
    // 保护 3：绝不阻断主流程
    console.log(
      `[text_edit] 佐糖 inpaint 失败，回落本地扩散填充: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
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

  /**
   * 档位 → 输出长边。
   *
   * 【2026-09-18】新增 1k(1024)，并把**缺省档从 2k 改为 1k**。
   *
   * ⚠️ 1k 的长边只能取 1024，不能为了"多点像素"抬到 1536。
   *    用量统计按**短边**落档（resolveImageResolutionTier），
   *    而 baseLongSide 是**长边**——两者在 1:1 画幅上完全相等：
   *      1536 长边 + 1:1 → 1536×1536，短边 1536 > 1088，被记成 2K。
   *    界面写着 1K、报表里却是 2K，零报错但对不上账。
   *    取 1024 时最坏情况（1:1）短边也才 1024，全画幅稳落 1K。
   *
   * ⚠️ 兜底档必须与前端默认值（client/src/lib/ai.ts 的 resolution = "1k"）一致，
   *    否则漏传 resolution 的调用方会出图尺寸与面板显示不符。
   */
  const baseLongSide = input.resolution === "4k"
    ? 3840
    : input.resolution === "2k"
      ? 2048
      : 1024;
  // ⚠️ 这里原本没有 `|| ratioToSize["1:1"]` 兜底，传 "auto" 会拿到 undefined
  // 并悄悄落到下面的 fallbackWidth 分支 —— 比静默变方图更难排查。
  const ratio = resolveRatioSize(input.ratio);
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

/**
 * 智能产品图的版面解析：把「构图选项」翻译成产品在画布上的占位与锚点。
 *
 * 【2026-09-16 变更一：去掉 productScale】
 * 「产品占画面比例」整项已按用户要求下线（改为电商平台画布尺寸预设），
 * 因此不再有 small/medium/large 三档。原来的 medium 档（0.66 × 0.72）
 * 是默认值，也是绝大多数请求实际走的那一档，直接固化为唯一占位，
 * 保证既有产出不发生视觉突变。
 *
 * 【2026-09-16 变更二：left / right 的语义确认】
 * 前端文案从「左侧留白 / 右侧留白」改成「产品居左 / 产品居右」。
 * 这里的 anchors 用的是 sharp composite 的归一化位置（0 = 贴左，1 = 贴右），
 * 所以 left: x=0.12 本来就表示**产品靠左**、留白在右。
 * 也就是说旧文案与代码行为是反着读的，功能一直是对的、名字是错的。
 * 这次只把名字改对，anchors 不动——改 anchors 反而会把本来正确的排版弄反。
 *
 * ⚠️ 别被 "left" 这个 id 误导去翻转坐标：判据是产品实际落在画面哪一侧，
 *    不是字面意思，改之前先看 composite 的 left/top 是怎么算的（见下方函数）。
 */
export function __testResolveSmartProductLayout(composition?: string) {
  const placement = composition === "left" || composition === "right" || composition === "bottom" || composition === "diagonal"
    ? composition
    : "center";
  // 产品在画布中的最大占位（宽 / 高各自的比例上限），沿用原 medium 档数值。
  const productFootprint = { width: 0.66, height: 0.72 } as const;
  const anchors = {
    center: { x: 0.5, y: 0.56 },
    left: { x: 0.12, y: 0.56 },
    right: { x: 0.88, y: 0.56 },
    bottom: { x: 0.5, y: 0.84 },
    diagonal: { x: 0.76, y: 0.24 },
  } as const;
  return { ...productFootprint, ...anchors[placement], composition: placement };
}

async function prepareProductCutoutForBackgroundGenerator(
  cutoutSrc: string,
  outputWidth: number,
  outputHeight: number,
  composition?: string,
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

  const layout = __testResolveSmartProductLayout(composition);
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
    // 「产品占画面比例」已下线（2026-09-16），但「产品必须完整可见」这条约束
    // 原先是搭在它上面的。它与比例档位无关、任何时候都成立，因此固化为常驻条款——
    // 跟着被删掉的话，模型少了唯一一句"不得裁切"的指令，会出现产品被切边的图。
    "保持产品完整可见，不得裁切或遮挡产品主体。",
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

/**
 * text_edit 专用：以「擦净图」为基底，只把模型输出相对基底的真实改动
 * （新文字及其描边/光效）按差异强度混回来，其余像素一律保持基底。
 *
 * ⚠️⚠️⚠️ 2026-09-21 背景错位的治本合成（与样本条重排同批上线）。
 *
 * 旧合成（__testCompositeSourcePreservingImageEdit）把蒙版内**整块**换成
 * 模型输出。而叠字模型（即梦 4.0 / VOD）会无视蒙版整图重绘、构图轻微漂移，
 * 于是蒙版内的背景是"模型脑补的版本"，与蒙版外还原出的原图在接缝处
 * 不连续 —— 用户看到的就是「文字旁边的背景错位/重影」。
 *
 * 这里改成 diff 混合：基底永远是喂给模型的擦净图（与蒙版外原图内容一致），
 * 只有 |模型输出 − 擦净图| 超过软阈值的像素（文字笔画、描边、发光、投影）
 * 才被混入。模型若只是整体平移/调色，平滑区差异小被挡掉；
 * 文字处差异大则完整保留。最坏情况（全局大改）退化为旧合成，不会更糟。
 *
 * 阈值取 (14, 48) 软过渡：低于 14 视为噪声/压缩色偏（取基底），
 * 高于 48 视为确定改动（取模型），中间线性过渡保留光效的半透明边缘。
 */
export async function __testCompositeTextPixelsOverCleanBase(
  cleanBuffer: Buffer,
  editedBuffer: Buffer,
  width: number,
  height: number,
  /**
   * 可选：文字块的目标中心（像素坐标，通常 = 被改原字区的中心）。
   *
   * ⚠️ 2026-09-21 文字层对齐平移：diff 混合把「文字及其光效」从模型输出里
   * 剥离出来后，文字在输出里的位置完全由模型自由发挥 —— 实测（欢乐中国年
   * 命题）模型会把字块整体下沉贴到洞底，底部被画面边缘截断。既然文字已经
   * 是独立图层，就可以做确定性校正：测出文字像素 bbox，整层平移到目标中心。
   * 平移只移动文字像素，背景基底不动，不会引入新的接缝。
   *
   * ⚠️⚠️ bbox 扫描必须限定在蒙版内（maskBuffer 的 alpha<=127 区）：
   * 叠字模型是整图重绘，全局色调/纹理差异会远超阈值，若不限定蒙版，
   * bbox 恒为全图、中心恒为画幅中心，平移量会被撑到限幅上限直接毁图
   * （实测平移 193,147px）。蒙版内强差异占比过半时同样视为"不可分离"，
   * 跳过平移退化为纯 diff 混合。
   */
  targetCenter?: { x: number; y: number },
  maskBuffer?: Buffer,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const [cleanPixels, editedPixels, maskPixels] = await Promise.all([
    sharp(cleanBuffer, { limitInputPixels: false })
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
    maskBuffer
      ? sharp(maskBuffer, { limitInputPixels: false })
          .rotate()
          .resize(width, height, { fit: "fill", kernel: "nearest" })
          .ensureAlpha()
          .raw()
          .toBuffer()
      : Promise.resolve(null),
  ]);
  const LOW = 14;
  const HIGH = 48;
  /**
   * 先扫一遍 diff，取「确定改动」像素（>=HIGH）的 bbox，
   * 用它与 targetCenter 求整层平移量。像素太少/没传目标中心就不平移。
   */
  let offsetX = 0;
  let offsetY = 0;
  if (targetCenter) {
    let minX = width, minY = height, maxX = -1, maxY = -1, strongCount = 0;
    let editableCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const editable = !maskPixels || maskPixels[index + 3] <= 127;
        if (!editable) continue;
        editableCount += 1;
        const channelDiff = Math.max(
          Math.abs(cleanPixels[index] - editedPixels[index]),
          Math.abs(cleanPixels[index + 1] - editedPixels[index + 1]),
          Math.abs(cleanPixels[index + 2] - editedPixels[index + 2]),
        );
        if (channelDiff < HIGH) continue;
        strongCount += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const strongRatio = editableCount ? strongCount / editableCount : 0;
    if (strongCount >= 200 && strongRatio <= 0.5 && maxX >= 0 && maxY >= 0) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const rawOffsetX = Math.round(targetCenter.x - centerX);
      const rawOffsetY = Math.round(targetCenter.y - centerY);
      const clampOffset = (value: number, limit: number) =>
        Math.max(-limit, Math.min(limit, value));
      // 平移量限幅：文字层只能做「对齐校正」，不能被错配拉去半个画面。
      offsetX = clampOffset(rawOffsetX, Math.round(width * 0.15));
      offsetY = clampOffset(rawOffsetY, Math.round(height * 0.15));
      // 微量偏移（<=3px）不校正，避免逐次请求间的抖动。
      if (Math.abs(offsetX) <= 3) offsetX = 0;
      if (Math.abs(offsetY) <= 3) offsetY = 0;
      console.log(
        `[text_edit] 文字层对齐: bbox=(${minX},${minY})-(${maxX},${maxY}) ` +
          `中心=(${Math.round(centerX)},${Math.round(centerY)}) ` +
          `目标=(${Math.round(targetCenter.x)},${Math.round(targetCenter.y)}) ` +
          `强差异占比=${(strongRatio * 100).toFixed(1)}% ` +
          `平移=(${offsetX},${offsetY})`,
      );
    } else {
      console.log(
        `[text_edit] 文字层对齐: 确定改动像素不足（${strongCount}），跳过平移`,
      );
    }
  }
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    // 文字层平移：输出 (x,y) 处取模型输出 (x-offsetX, y-offsetY)，
    // 越界处取基底（平移后的空隙露出干净背景）。
    const sampleY = y - offsetY;
    const rowInBounds = sampleY >= 0 && sampleY < height;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const sampleX = x - offsetX;
      let alpha = 0;
      if (rowInBounds && sampleX >= 0 && sampleX < width) {
        const editedIndex = (sampleY * width + sampleX) * 4;
        alpha = Math.max(
          Math.abs(cleanPixels[index] - editedPixels[editedIndex]),
          Math.abs(cleanPixels[index + 1] - editedPixels[editedIndex + 1]),
          Math.abs(cleanPixels[index + 2] - editedPixels[editedIndex + 2]),
        );
        alpha =
          alpha <= LOW ? 0 : alpha >= HIGH ? 1 : (alpha - LOW) / (HIGH - LOW);
        if (alpha > 0) {
          output[index] = Math.round(
            cleanPixels[index] * (1 - alpha) + editedPixels[editedIndex] * alpha,
          );
          output[index + 1] = Math.round(
            cleanPixels[index + 1] * (1 - alpha) +
              editedPixels[editedIndex + 1] * alpha,
          );
          output[index + 2] = Math.round(
            cleanPixels[index + 2] * (1 - alpha) +
              editedPixels[editedIndex + 2] * alpha,
          );
        }
      }
      if (alpha <= 0) {
        output[index] = cleanPixels[index];
        output[index + 1] = cleanPixels[index + 1];
        output[index + 2] = cleanPixels[index + 2];
      }
      output[index + 3] = cleanPixels[index + 3];
    }
  }
  return sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
}

/**
 * 从蒙版中减去「邻行保护区」：把未参与本次改动的其他文字区（外扩 pad 像素）
 * 的蒙版置为不可编辑（不透明）。
 *
 * ⚠️⚠️⚠️ 2026-09-21「GAME FOR PEACE 重影」修复。
 *
 * 膨胀蒙版（padY 留白 + radius 膨胀 + shiftY 上移）在「上邻文字紧贴」的排版里
 * 洞顶会切进上一行文字的下缘（实测「大吉大利和平年」与 GAME FOR PEACE 行
 * 间隙仅 6px，洞顶却上探 20px+）。叠字模型看到白区里有邻行残段，就把它
 * 重绘一份轻微错位的副本，与洞外的原件拼成上下两份 —— 用户看到「背景错位/重影」。
 *
 * 判据：与前端蒙版透明区有实质重叠（>5% 面积）的 region 视为「被改行」，
 * 不保护 —— 多行同改时每一行都能正常擦写；其余全部保护。
 * 保护 pad 取约 2px：洞顶最多贴到邻行下缘 + 2px，原字顶部的描边余量
 * 虽然变紧，但「2px 描边残留」远比「邻行重影」可控。
 */
async function subtractProtectedRegionsFromMask(
  maskBuffer: Buffer,
  regions: Array<{ x: number; y: number; width: number; height: number }>,
  width: number,
  height: number,
  padPixels = 2,
): Promise<Buffer> {
  if (!regions.length) return maskBuffer;
  const sharp = (await import("sharp")).default;
  const pixels = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const editableAt = (x: number, y: number) =>
    pixels[(y * width + x) * 4 + 3] <= 127;
  for (const region of regions) {
    const x0 = Math.max(0, Math.floor(region.x * width) - padPixels);
    const y0 = Math.max(0, Math.floor(region.y * height) - padPixels);
    const x1 = Math.min(width - 1, Math.ceil((region.x + region.width) * width) + padPixels);
    const y1 = Math.min(height - 1, Math.ceil((region.y + region.height) * height) + padPixels);
    let editableCount = 0;
    let total = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        total += 1;
        if (editableAt(x, y)) editableCount += 1;
      }
    }
    // 与前端蒙版透明区无实质重叠 → 邻行，整块置为不可编辑。
    if (total > 0 && editableCount / total > 0.05) continue;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        pixels[(y * width + x) * 4 + 3] = 255;
      }
    }
  }
  return sharp(pixels, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
}

async function createLocalEditGuideImage(
  sourceBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {  const sharp = (await import("sharp")).default;
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

/**
 * 智能文案编辑专用：从**擦字前的原图**裁出「原文字样本条」，作为字体设计参考图。
 *
 * ⚠️⚠️⚠️ 2026-09-20 事故根因修复。
 *
 * 叠字链路的提示词写着「复刻被移除文字的字形 / 描边 / 投影 / 透视」，
 * 但 editViaReferenceGeneration 里的 `sourceDataUrl` 取自 `sourceImageData`，
 * 而擦字成功后它**已经被替换成擦干净的图**。也就是说：
 *   指令要求模型照着原字复刻，模型手上却一张原字都没有。
 * 模型看不到样本时只能退回默认行为 —— 摆一个文本框把字写进去，
 * 于是用户看到的就是「文字像直接贴上去的」。
 *
 * 📌 判据：凡是提示词里出现「照着 X 做」，必须回头确认 **X 有没有真的
 *    在参考图里**。擦字 / 裁剪 / 归一化这类中途加工会把 X 悄悄拿走，
 *    而提示词不会报错，只会让模型自由发挥。
 *
 * 这里按 OCR 区域把原字裁出来拼成一条样本图。刻意**不给整张原图**：
 * 整图带着完整旧排版，模型容易把它当成目标画布去复制旧文案。
 * 底色用中性灰而非白色 —— 白底样本本身就在暗示「字要配白底板」，
 * 正是我们要消灭的东西。
 */
async function createOriginalTypographyReferenceImage(
  originalBuffer: Buffer,
  textRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
  }>,
  width: number,
  height: number,
  /**
   * 可选：每个区域的目标文案（与 textRegions 同序，函数内部会先做与
   * resolveRegionTargetTexts 相同的 y/x 排序再按下标配对）。
   *
   * ⚠️⚠️⚠️ 2026-09-21 按目标字数重排样本条 —— 字号截断的唯一治本通道。
   *
   * 旧版把「7 字满宽」的原字样本条原样喂给模型，提示词说
   * "the same glyph size relative to the text block"——模型忠实执行，
   * 把 5 个新字按原字号撑满 7 字的宽度，每个字放大约 1.4 倍，
   * 表现就是文字放大冲破蒙版、上下左右被画面边缘截断。
   * 已实证：提示词硬约束、负面词、蒙版收窄三个弱通道对字号的约束力都≈0
   * （蒙版收窄甚至引发 GAME FOR PEACE 重影），模型字号的唯一强驱动
   * 就是这张样本参考图。所以治本 = 让样本条本身展示「M 个原字号
   * 的字应占多宽」：切成 N 个单字块、取前 M 块重拼，总宽 = 原宽 × M/N。
   */
  targetTexts?: Array<string | undefined>,
): Promise<Buffer | null> {
  if (!textRegions.length) return null;
  const sharp = (await import("sharp")).default;
  const baseBuffer = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));
  /** 去掉空白后的字符数（中文按字、英文按字母粗略计，够用于宽度比例）。 */
  const countChars = (value: string | undefined) =>
    (value ?? "").replace(/\s+/g, "").length;
  /**
   * 把一条样本横条切成 count 个等宽单字块。
   * 边界用累积取整避免逐段取整造成的缝隙/重叠。
   */
  const sliceGlyphCells = async (
    cropBuffer: Buffer,
    cropWidth: number,
    cropHeight: number,
    count: number,
  ): Promise<Array<{ buffer: Buffer; width: number }>> => {
    const cells: Array<{ buffer: Buffer; width: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const left = Math.round((i * cropWidth) / count);
      const right = Math.round(((i + 1) * cropWidth) / count);
      const cellWidth = right - left;
      if (cellWidth < 4) continue;
      cells.push({
        buffer: await sharp(cropBuffer, { limitInputPixels: false })
          .extract({ left, top: 0, width: cellWidth, height: cropHeight })
          .png()
          .toBuffer(),
        width: cellWidth,
      });
    }
    return cells;
  };
  const crops: Array<{ buffer: Buffer; width: number; height: number }> = [];
  // 按阅读顺序排，保证样本条里的字形顺序与原图一致，便于模型逐行对应。
  // （与 resolveRegionTargetTexts 内部相同的排序键，targetTexts 按此序配对。）
  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let regionIndex = 0; regionIndex < sortedRegions.length; regionIndex += 1) {
    const region = sortedRegions[regionIndex];
    // 留白：横向少留（避免把邻近画面元素裹进来），纵向多留
    // （描边 / 投影 / 发光往往溢出 bbox，裁掉就等于把"设计感"裁掉了）。
    const padX = region.width * width * 0.06;
    const padY = region.height * height * 0.25;
    const left = Math.round(clamp(region.x * width - padX, 0, width - 1));
    const top = Math.round(clamp(region.y * height - padY, 0, height - 1));
    const right = Math.round(
      clamp(region.x * width + region.width * width + padX, left + 1, width),
    );
    const bottom = Math.round(
      clamp(region.y * height + region.height * height + padY, top + 1, height),
    );
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    // 太小的裁块喂给模型只有噪声价值，直接丢弃。
    if (cropWidth < 8 || cropHeight < 8) continue;
    const cropBuffer = await sharp(baseBuffer, { limitInputPixels: false })
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    /**
     * 按目标字数重排：原字 N 字、目标 M 字且 M < N 时，
     * 把整条样本切成 N 个单字块、取前 M 块无缝重拼 ——
     * 每个字保持原字形原字号，整条宽度自然收窄到 M/N。
     * 模型照"样本条=text block"复刻时，写出的就是 M 个原字号、
     * 只占 M/N 宽的字，而不是把 M 个字撑满整条。
     */
    const originalCount = countChars(region.text);
    const targetCount = countChars(targetTexts?.[regionIndex]);
    if (originalCount >= 2 && targetCount >= 1 && targetCount < originalCount) {
      const cells = await sliceGlyphCells(cropBuffer, cropWidth, cropHeight, originalCount);
      if (cells.length === targetCount || cells.length > targetCount) {
        const picked = cells.slice(0, targetCount);
        const stripWidth = picked.reduce((sum, cell) => sum + cell.width, 0);
        let offsetX = 0;
        const strip = await sharp({
          create: {
            width: stripWidth,
            height: cropHeight,
            channels: 4,
            background: { r: 128, g: 128, b: 128, alpha: 1 },
          },
          limitInputPixels: false,
        })
          .composite(
            picked.map(cell => {
              const item = { input: cell.buffer, left: offsetX, top: 0 };
              offsetX += cell.width;
              return item;
            }),
          )
          .png()
          .toBuffer();
        crops.push({ buffer: strip, width: stripWidth, height: cropHeight });
        continue;
      }
      // 切块数量不足（段太窄被丢弃）时降级为整条样本，不阻塞链路。
    }
    crops.push({
      buffer: cropBuffer,
      width: cropWidth,
      height: cropHeight,
    });
  }
  if (!crops.length) return null;

  const gap = 16;
  const canvasWidth = Math.max(...crops.map(crop => crop.width)) + gap * 2;
  const canvasHeight =
    crops.reduce((sum, crop) => sum + crop.height, 0) + gap * (crops.length + 1);
  let offsetY = gap;
  const composites = crops.map(crop => {
    const item = { input: crop.buffer, left: gap, top: offsetY };
    offsetY += crop.height + gap;
    return item;
  });

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      // 中性灰：既不暗示白底板，也不暗示深底板。
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
    limitInputPixels: false,
  })
    .composite(composites)
    .png()
    .toBuffer();
}

// VOD 参考图生成中支持 mask 蒙版编辑的模型（白=编辑区）。

/**
 * text_edit 叠字结果的「位置验收」：用 OCR 找目标文案在输出图里的实际位置，
 * 与被改原字区对比中心偏差 / 触边情况。
 *
 * ⚠️⚠️⚠️ 2026-09-21。字号已由样本条重排钉住，但**位置**仍是模型的自由变量：
 * 同一命题三连跑，字块分别「居中偏下」「贴底被裁」「偏右裁边」——
 * 每次都是零报错的可用图，用户看到的却是「又被截断了」。
 * diff 像素分离不可靠（蒙版内 68% 像素强差异，文字信号被模型重绘的
 * 背景淹没），OCR 是唯一能直接回答「字写在哪」的通道。
 *
 * 验收不过不报错：记为候选，换下一个模型再试；全部不过时返回得分最高的
 * 一张 —— 绝不比旧行为差，只是多了一次挑出「位置最好那张」的机会。
 */
async function scoreTextEditPlacement(
  imageBuffer: Buffer,
  targetText: string,
  targetRegion: { x: number; y: number; width: number; height: number },
): Promise<{ accepted: boolean; score: number; reason: string }> {
  const dataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  const { regions } = await extractImageText({ imageSrc: dataUrl });
  return scorePlacementAgainstRegions(regions, targetText, targetRegion);
}

/**
 * 纯匹配/评分部分（不做 OCR）：多区验收对同一张输出图只 OCR 一次，
 * 再逐个区域复用这里的匹配逻辑，避免 N 个区域打 N 次 vision 调用。
 */
function scorePlacementAgainstRegions(
  regions: Array<{ text: string; x: number; y: number; width: number; height: number }>,
  targetText: string,
  targetRegion: { x: number; y: number; width: number; height: number },
): { accepted: boolean; score: number; reason: string } {
  const normalize = (value: string) => (value || "").replace(/\s+/g, "");
  const want = normalize(targetText);
  if (!want) return { accepted: true, score: 1, reason: "无目标文案，跳过验收" };
  let found: (typeof regions)[number] | null = null;
  let bestArea = -1;
  for (const region of regions) {
    const got = normalize(region.text);
    if (!got) continue;
    // 双向包含：模型可能把文案拆行或带上少量装饰字符。
    if (got.includes(want) || want.includes(got)) {
      const area = region.width * region.height;
      if (area > bestArea) {
        bestArea = area;
        found = region;
      }
    }
  }
  if (!found) {
    return {
      accepted: false,
      score: 0,
      reason: `输出中未找到目标文案「${targetText}」`,
    };
  }
  const centerX = found.x + found.width / 2;
  const centerY = found.y + found.height / 2;
  const targetX = targetRegion.x + targetRegion.width / 2;
  const targetY = targetRegion.y + targetRegion.height / 2;
  const dx = Math.abs(centerX - targetX);
  const dy = Math.abs(centerY - targetY);
  // 贴画面边 ≈ 文字被裁（正是用户反复报告的形态）。
  const edgeTouch =
    found.x <= 0.002 ||
    found.y <= 0.002 ||
    found.x + found.width >= 0.998 ||
    found.y + found.height >= 0.998;
  const score = 1 - Math.min(1, dx * 2 + dy * 2) - (edgeTouch ? 0.5 : 0);
  const accepted = dx <= 0.05 && dy <= 0.05 && !edgeTouch;
  return {
    accepted,
    score,
    reason: `中心偏移 dx=${dx.toFixed(3)} dy=${dy.toFixed(3)}${edgeTouch ? " 且触画面边缘" : ""}`,
  };
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

/**
 * VOD 参考图生成需要的比例档位。
 *
 * 必须取与源图最接近的档位：VOD 会按 ratio 重新构图，比例偏离越大，主体与构图漂移越明显
 * （实测 2:3 的源图被下成 9:16 时会出现明显裁切漂移）。
 * 智能注释、text_edit 叠字、即梦擦除三条链路共用这一份判据，避免各自维护导致漂移。
 */
function resolveVodReferenceRatio(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  return aspect > 1.2
    ? "16:9"
    : aspect < 0.85
      ? (aspect < 0.65 ? "9:16" : "2:3")
      : "1:1";
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
  // 只扫「用户原话」：前端在头部配饰场景会插入「帽子、头盔、皇冠或其他头部配饰」这类样板文字，
  // 拿整段 prompt 判断会让所有请求都命中帽子分支（蒙版被大幅上扩，换色/加皇冠都被带偏）。
  /*
   * ⚠️⚠️ 空蒙版必须在这里中止，不能继续往 VOD 送。
   *
   * 2026-09-21 生产取证：这条路径（即梦背景修复）20 次里 12 次白费。
   * 上游拿到「一个可编辑像素都没有」的蒙版后，要么原样退回
   * （日志 `完成但 mask 区域无明显变化`），要么空转到 `Polling timeout`
   * —— 每次干等 **360s**，且照常计费。用户侧看到的就是
   * 「vod拉取图片失败 / 网络开小差」。
   *
   * 下面那段扩展/膨胀逻辑的入口条件是 `maxX >= 0 && maxY >= 0`，
   * 空蒙版时它只是**安静地跳过**，然后照样把一张全黑（无可编辑区）的
   * 蒙版编码出去 —— 零报错，是最典型的"静默失效"。
   *
   * 📌 判据同 buildInpaintMask：拦在发请求之前，省的是钱不只是时间。
   */
  if (maxX < 0 || maxY < 0) {
    throw new Error(
      "蒙版没有任何可编辑区域。常见原因是蒙版的 alpha 通道在传输途中被有损压缩抹平，" +
      "此时送 VOD 只会空转到超时（约 360s）并照常计费，故在此直接中止。",
    );
  }

  const userRequest = extractUserRequest(editPrompt);
  const isHatRequest = /(帽|hat\b|cap\b|bonnet|visor|beret|headwear|贝雷帽|鸭舌帽|针织帽|棒球帽|毛线帽)/i.test(userRequest);
  const isGlassesRequest = /(眼镜|glasses|sunglasses|墨镜|goggles|镜框|镜片|一副眼镜|一副墨镜)/i.test(userRequest);
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

/**
 * 目标像素 → 腾讯 VOD 的 `Resolution` 参数。
 *
 * 【2026-09-18】此前恒传 "1K"，高分辨率靠出图后本地 sharp 放大实现 ——
 * 也就是说用户买的「4K」其实是 1536 长边插值放大的，**画质没有真实提升**，
 * 而计费又不分档，等于既没多收钱也没给到真东西。
 *
 * 现在改为真向上游要 2K/4K：
 *   - 画质是真的（上游原生渲染，不是插值）
 *   - 成本按官方报价上涨 2.33× / 2.91×，由 ai-credit-policy.ts 的
 *     分辨率系数同步收回，毛利率守在 59% 以上
 *
 * ⚠️ 落档必须按**短边**，与腾讯计费口径一致（见 AI_IMAGE_RESOLUTION_POLICIES）。
 * ⚠️ 上游**没有 8K 档**：8k 请求下发 "4K"，剩下的放大仍由本地补齐 ——
 *    这是唯一还需要 sharp 兜底的档位，计费上也已按「4K 成本 + 算力溢价」定价。
 */
function resolveVodResolutionParam(
  targetWidth?: number,
  targetHeight?: number,
): "1K" | "2K" | "4K" {
  const tier = resolveImageResolutionTier(targetWidth, targetHeight);
  if (tier === "2k") return "2K";
  if (tier === "4k" || tier === "8k") return "4K";
  return "1K";
}

function coerceOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

/**
 * 上游出图 → 目标画幅的归一化。
 *
 * ⚠️⚠️⚠️ 2026-09-23「文字被裁切 + 错位」根因修复。
 *
 * 上游只接受 getEditSizeForAspect 的三个档位（1536x1024 / 1024x1536 / 1024x1024），
 * 任何原始比例都会被吸附。原实现一律 `fit:"cover"` + 居中裁切，对两类链路的后果完全不同：
 *
 *   - **纯生成**：画面是新画的，没有"必须与原图对齐"的约束，cover 裁掉边缘
 *     只是构图取舍，可以接受（而 fill 会把人脸压扁，更糟）。
 *   - **保真编辑（text_edit 等）**：上游拿到的就是整张原图，输出是**同一画框的重绘**。
 *     此时 cover 会干两件事：① 按长边放大后把短边方向两端各裁掉一截；
 *     ② 放大本身让所有像素坐标整体外扩。于是
 *     「蒙版 / textRegions / 擦净基底」全都还在原坐标系，而模型输出已被裁+缩放，
 *     两者**再也对不上**——下游 diff 混合与蒙版合成拿着错位的图做逐像素运算，
 *     表现就是"文字被裁掉一截、并且整体错位"。
 *
 * 实测量级（线上中秋海报单）：原图 1600x900（1.78），档位落到 1536x1024（1.50），
 * cover 需按宽放大 4.2%，再上下各裁 83px = 高度的 18.6% —— 顶行文字直接被切掉。
 *
 * 📌⭐⭐⭐ 判据：**当输出需要与另一份数据逐像素对齐时，任何裁切都是错的**。
 *    裁切不报错，它只是悄悄把两个坐标系错开。保真编辑必须用 `fill`
 *    做非等比拉回——轻微形变可接受（档位比例偏差通常 <20%，且蒙版外像素
 *    最终会被原图还原覆盖，形变实际只作用于文字层），坐标对齐不可失。
 */
export async function __testNormalizeGeneratedImagesToTargetAspect(
  images: GeneratedImage[],
  targetWidth: number,
  targetHeight: number,
  /**
   * 保真编辑（蒙版合成 / diff 混合）链路必须传 true：改用 `fill` 保持坐标线性对应。
   * 默认 false 以维持纯生成链路的既有行为不变。
   */
  preserveFullFrame = false,
): Promise<GeneratedImage[]> {
  const sharp = (await import("sharp")).default;

  return Promise.all(images.map(async (image) => {
    const { buffer } = await imageSrcToBuffer(image.src);
    const png = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize(targetWidth, targetHeight, preserveFullFrame
        ? { fit: "fill" }
        : {
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
  // - 新增物件（帽子/眼镜/道具等）：首选即梦（Jimeng 4.0），它对"红色棒球帽"这类具体
  //   颜色/款式遵循强、新物体与头部的融合自然；OG（GPT-Image2）原生支持 mask 编辑，次选兜底。
  // - 改已有属性（换色/换材质/修瑕疵）：首选即梦；GEM（Gemini 3.1）对人脸/身份保持度更好、
  //   融合更柔和，次选兜底。
  const promptType = classifyAnnotationPrompt(prompt);

  // 智能注释只用这三个模型：即梦（Jimeng 4.0）/ OG（GPT-Image2）/ GEM（Gemini 3.1）。
  // 即梦排最前作为首选：2026-09-13 实测确认，它在「加头部配饰」与「换属性」两类局部编辑上，
  // 对用户具体描述的遵循度、与人物头部的融合度都最好。
  // OG / GEM 留在后面作兜底，即梦失败（或对 mask 无响应）时自动降级，不会把用户请求直接打断。
  // 不再回落到 MJ / Kling / Hunyuan / chat 等其他模型——实测它们在这类局部编辑上
  // 要么保持度差、要么直接忽略指令，与其出一张不对的图，不如失败后由用户重试。
  const addObjectVodModels = ["vod-jimeng", "vod-og", "vod-gem"];
  const editPropertyVodModels = ["vod-jimeng", "vod-gem", "vod-og"];
  const vodReferenceModels = promptType === "edit-property"
    ? editPropertyVodModels
    : addObjectVodModels;

  // 即梦恒为首选。selectedModel 来自「画布助手的通用图片编辑模型」设置
  // （client/src/components/canvas/InfiniteCanvas.tsx 的 getStoredCanvasAssistantImageEditModel），
  // 它不是「智能注释专用」的选择 —— 用户在那里选的 vod-gem 只是他平时生成图片的偏好，
  // 不该顶掉智能注释实测效果最好的即梦。选中的模型并入其后，仅作即梦失败时的兜底候选。
  const preferredModel = selectedModel && selectedModel !== DEFAULT_IMAGE_MODEL_ID
    ? [selectedModel]
    : [];
  return Array.from(new Set([vodReferenceModels[0], ...preferredModel, ...vodReferenceModels]));
}

async function editSmartAnnotationImage(input: EditImageInput): Promise<{ images: GeneratedImage[] }> {
  const maskSource = input.maskSrc?.trim() || (input.maskUrl || input.mask_url || "").trim();
  __testAssertSourcePreservingMask(input.operation, maskSource);
  console.log("[智能注释] enter", JSON.stringify({
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

  // 注意：这三个常量需在下方任何早退分支之前声明。
  // 降级路径的 catch 会调用 editAnnotationViaReferenceGeneration()，
  // 该函数闭包引用 selectedModel / editSize，若声明在分支之后，
  // 降级时会抛 TDZ 错误 "Cannot access 'selectedModel' before initialization"，
  // 把「无可见修改」这类可恢复情况变成整体失败（表现为该能力全线报错）。
  // 📌 通用教训：早退分支插在函数中部时，要检查它引用的闭包函数是否依赖后面才声明的
  // const —— TypeScript 不报错，运行时才炸（2026-09-10 因此出过一次"能力全线失效"）。
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

  // 2026-09-13 移除了这里的「美图局部重绘」分支（原 85 行）。
  //
  // 两个独立理由，任一都足以删：
  //   1. **它恒不可达**。进入条件是 `input.provider === "meitu" && input.promptKind === "edit"`，
  //      但 `promptKind` 从来不在 OrchestrateRequest 的字段里，ai-orchestrator 透传时也没传它，
  //      前端更没有这个参数。前端唯一入口走 /api/ai/orchestrate，所以 input.promptKind 恒为
  //      undefined，条件恒假 —— 这段代码从写下那天起就没执行过。
  //   2. 美图账号已被停用（403 / 1003 access key is disabled，本地与生产同一把 key，指纹一致）。
  //
  // 智能注释的「AI 修改」现在统一走下面的参考图生成链路。
  //
  // 📌 一并删掉的还有只为它存在的入参 `provider` 和 `promptPos`：前端曾硬编码
  //    `provider: "meitu"` 传下来，orchestrator 也专门透传，但接收端的分支恒假 ——
  //    整条参数链从前端到后端都是空转。**「参数被认真地一路透传」不等于「它有人消费」**，
  //    删通道时要顺着参数往上游追到最初的赋值点，否则会留下一串谁也不敢动的僵尸入参。

  // selectedModel / editSize / apiKey 在函数上方声明。
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
    // 原图比例 2:3 (~0.67) 与 9:16 (~0.56) 相差较远，与源图相近的比例能减少 VOD 参考图生成时的构图漂移。
    const ratio = resolveVodReferenceRatio(targetWidth, targetHeight);
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
      // 意图识别必须只用「用户原话」，不能拿整段 prompt 做正则：
      // 前端在头部配饰场景会往 prompt 里插入「帽子、头盔、皇冠或其他头部配饰」这类样板文字，
      // 直接扫整段会让「给她戴个皇冠」被误判成帽子请求，后端于是追加「必须是棒球帽」的款式约束，
      // 与用户请求互相打架。帽子判断只保留真正的帽类词，头饰/皇冠不在此列，统一交给通用约束。
      const userRequest = extractUserRequest(userPrompt);
      const isHatRequest = /(帽|hat\b|cap\b|bonnet|visor|beret|贝雷帽|鸭舌帽|针织帽|棒球帽|毛线帽)/i.test(userRequest);
      const isGlassesRequest = /(眼镜|glasses|sunglasses|墨镜|goggles|镜框|镜片|一副眼镜|一副墨镜)/i.test(userRequest);
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
        // VOD mask 模型（vod-og 等）本身通过 ReferenceType: "mask" 做了局部编辑。
        //
        // ⚠️⚠️⚠️ 这里有两条**要求相反**的链路，必须分流，不能共用同一个早退：
        //
        //   · 涂鸦式智能注释（regionSelectEdit 未置位）：保持直接返回。
        //     贴回会擦掉超出原始涂鸦点的生成内容（如眼镜跨双眼时只保留了一半），
        //     这是 2026-09-13 实测过的真实回归，不能动。
        //
        //   · 画布框选式局部重绘（regionSelectEdit === true）：必须贴回。
        //     2026-09-23 线上实测：同一条 OG 链路出图，选区**外**改动率 16.27%
        //     （白字区 51%、右下角 74%、maxDelta 239）——「VOD 保证蒙版外不变」
        //     这个前提在框选场景下是假的，且零报错。用户的硬要求是「边缘要和整图
        //     完全融合、不要割裂」，唯一可靠解就是本地按羽化 alpha 贴回。
        //
        // 📌⭐⭐⭐ 判据：上游的承诺不能替代自己再验/再还原一次；承诺失效时没有任何
        //    报错，只是给你另一张图。两条链路对同一分支的正确性要求相反时，靠显式
        //    字段分流，不要试图找一个"两边都对"的统一行为。
        if (isVodMaskModel && input.regionSelectEdit !== true) {
          const normalized = await __testNormalizeGeneratedImagesToTargetAspect(result.images.slice(0, 1), targetWidth, targetHeight);
          return { images: normalized };
        }
        /**
         * 非 mask 模型（chat/GEM 等）需要自己用扩展蒙版做 source-preserving 合成。
         *
         * ⚠️⚠️ 框选式局部重绘要用**前端那张羽化蒙版原件**，不能用 OG 的膨胀蒙版：
         * 膨胀是为「凭空加物体」留余量的，框选场景下它会把贴回范围向外撑开，
         * 等于悄悄放大用户框的区域；而羽化 alpha 本身就是"边缘融合"的实现手段，
         * 换成膨胀蒙版会让过渡带失真。零报错，只是框大了一圈。
         */
        return finalizeAnnotationImages(
          result.images,
          input.regionSelectEdit === true ? maskImageData.buffer : ogCompositeMaskBuffer,
        );
      } catch (error) {
        lastError = error;
        console.log("[智能注释] model FAIL:", fallbackModel, "->", error instanceof Error ? error.message : String(error));
      }
    }
    throw lastError || new Error("智能注释参考图编辑失败");
  };

  /**
   * VOD 系模型（vod-*）必须直接走参考图生成路径，不要先去撞中转站的 /images/edits。
   *
   * 与通用图片编辑入口同一位置的判断同因，这里此前漏掉了这一步：
   * 主链路 callImageEditProvider 打的是中转站 BKEEL，而 VOD 模型名（vod-gem 等）
   * 在中转站并不存在，上游只会回 503。2026-09-13 实测同一请求连打两次
   * （51071ms + 20985ms），用户点完要干等 72 秒才看到图，而结论必然是降级到参考图链路。
   * 兜底虽救回了结果，但每次都要先空转一遍注定失败的请求。
   */
  if (isVodModelId(selectedModel)) {
    return editAnnotationViaReferenceGeneration();
  }

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

/**
 * ⚠️ 返回类型必须是 GeneratedImageResult（带 providerTaskId/providerTaskIds）。
 * 这里曾经写成 `{ images: GeneratedImage[] }`，即使运行时带了上游任务号，
 * 类型上也被抹掉 —— 调用方读不到，后台追踪里的上游任务号恒为占位符。
 */
export async function generateImages(input: ImageGenerateInput): Promise<GeneratedImageResult> {
  if (!input.prompt?.trim()) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();

  const ratio = resolveRatioSize(input.ratio);
  const count = Math.max(1, Math.min(Number(input.count) || 1, 9));
  const referenceImages = input.images?.filter(image => image.src?.trim()) || [];
  /**
   * 提示词尺寸意图优先于 ratio 推导出来的档位尺寸。
   *
   * ⚠️⚠️⚠️ 这一行是需求「提示词提到分辨率时必须优先」的**唯一落地点**。
   * 前端把像素算得再准，只要这里不吃 input.targetWidth/Height，
   * 整条链路就是「透传但没被消费」—— 出图尺寸纹丝不动，且零报错。
   *
   * 传了 → 按提示词像素放大；没传 → 与改造前逐位一致。
   */
  const promptTargetWidth = coerceTargetDimension(input.targetWidth);
  const promptTargetHeight = coerceTargetDimension(input.targetHeight);
  const hasPromptSizeTarget = promptTargetWidth !== undefined && promptTargetHeight !== undefined;
  const targetSize = __testResolveHighDefinitionTargetSize(
    promptTargetWidth ?? ratio.width,
    promptTargetHeight ?? ratio.height,
    ratio.width,
    ratio.height,
  );
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
      aspectRatio: resolveImageRatio(input.ratio),
      /**
       * 真向上游要高分辨率（而不是本地插值放大）。
       *
       * ⚠️ 只在解析出显式尺寸意图时才下发非 1K：没有尺寸意图的请求
       * 必须保持 "1K"，否则全站成本会无声上涨 2-3 倍。
       * hasPromptSizeTarget 为 false 时 targetSize 是由 ratio 推导的默认档，
       * 拿它去落档会把普通请求误判成高分辨率。
       */
      resolution: hasPromptSizeTarget
        ? resolveVodResolutionParam(targetSize.width, targetSize.height)
        : "1K",
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
    const rawVodImages = result.images.map(img => ({
      src: img.src,
      width: img.width,
      height: img.height,
    }));
    /**
     * ⚠️⚠️⚠️ 提示词尺寸意图必须在**这条分支**也生效。
     *
     * 现网所有出图都走 VOD，而这条分支原本直接 return，
     * 完全绕过下面中转站分支里的 targetSize 归一化。
     * 只改 targetSize 的计算式（:4245）而不动这里 = 改了个没人走的分支，
     * 线上表现为「提示词写了 4K，出图还是 1536」且零报错。
     * 📌 这就是「同一份逻辑的多个出口，只改一个等于没做」的第 N 次。
     *
     * 只有解析出显式像素时才动手：没有尺寸意图的请求保持原样，
     * 不引入任何多余的 sharp 重编码。
     */
    const images = hasPromptSizeTarget && rawVodImages.length > 0
      ? await __testNormalizeGeneratedImagesToTargetAspect(
          rawVodImages,
          targetSize.width,
          targetSize.height,
        )
      : rawVodImages;
    console.log("[generate] VOD success:", vodModelId, "| count:", images.length, "| targetSize:", hasPromptSizeTarget ? `${targetSize.width}x${targetSize.height}` : "(default)", "| upstreamResolution:", vodInput.resolution, "| src:", (images[0]?.src || "").slice(0, 100));
    // ⚠️ 必须把腾讯返回的 TaskId 透出去。这里曾经直接 `return { images }`，
    // 把 result.taskId 丢掉，导致所有 VOD 任务在后台追踪里的上游任务号
    // 恒为占位符 "provider-task-missing"，出问题时无法向腾讯提工单核查。
    return withProviderTaskIds({ images: images.slice(0, count) }, result.taskId ? [result.taskId] : []);
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
          // 拆批补张时，把上游任务号汇总（主批次 + 补张批次）。
          const allTaskIds = [
            providerData.task_id,
            providerData.taskId,
            ...remaining.flatMap(r => [r.providerTaskId, ...(r.providerTaskIds || [])]),
          ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);
          return withProviderTaskIds(
            { images: [...normalizedImages, ...remaining.flatMap(result => result.images)].slice(0, count) },
            allTaskIds,
          );
        }
        // ⚠️ 必须把中转站上游任务号透出去。这里曾经直接 `return { images }`，
        // 把 providerData.task_id / taskId 丢掉，导致 96% 的中转站任务在后台
        // 追踪里的上游任务号恒为占位符 "provider-task-missing"，出问题时无法
        // 向中转站提工单核查。
        return withProviderTaskIds(
          { images: normalizedImages },
          [providerData.task_id, providerData.taskId].filter((id): id is string => typeof id === "string" && id.trim().length > 0),
        );
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

  const { apiKey, baseUrl } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  /*
   * 送给模型的必须是**能拿到像素**的图，而不是画布里的原始 src 字符串。
   *
   * 2026-09-19 实测（同一张有文字的图，三种 src 形式对照）：
   *   · data URL                 → vision-chat-ocr，一次直出 16~20 个区域
   *   · /uploads/... 相对路径     → text 空、regions 空，**不报错**
   *   · 404 / 已过期的绝对 URL    → 同样静默为空
   *
   * 根因：这里原先直接把 input.imageSrc 塞进 image_url，而模型侧只能解析
   * data URL 或**它自己能下载**的公网 URL。相对路径（本地 dev 下
   * getCanvasRenderableImageSrc 就返回这种）和已过期的上传图，对模型来说
   * 只是一个取不到内容的字符串 —— 像素一个都没送到，首选和兜底两条通道
   * 自然都读不出字，最后前端显示「未识别到可读文案」。
   *
   * 最坑的是它**不报错**：返回的是空结果而不是失败，于是「图没送进去」
   * 和「图里本来就没字」在前端长得一模一样，只能靠猜。
   *
   * 因此这里先经 imageSrcToBuffer 取回真实像素（data URL / 本地 /uploads
   * 文件 / http URL 三种它都认），统一转成 data URL 再下发；取不到就直接抛错，
   * 让「读不到图」以失败的形式暴露，而不是伪装成「图里没有文字」。
   */
  const { buffer: ocrBuffer, mimeType: ocrMimeType } =
    await imageSrcToBuffer(input.imageSrc);
  const modelImageSrc = `data:${ocrMimeType};base64,${ocrBuffer.toString("base64")}`;

  /*
   * 首选 OCR 模型的默认值**不能**落到出图模型上。
   *
   * getProviderConfig() 在 AI_IMAGE_MODEL 留空时会回落到
   * DEFAULT_IMAGE_MODEL_ID（vod-og25-sunburst-medium），而那是**出图**模型，
   * 发给 /v1/chat/completions 必然 503「No available channel」——
   * 2026-09-19 实测每次都要先空转 ~130s 才轮到兜底，用户侧表现就是
   * 「智能文案编辑点了很久没反应」，赶上首选抛错的老版本更是一个字都拿不到。
   *
   * 视觉识图的可靠默认是文本模型（claude-opus-5，image_url 多模态实测 2.8s
   * 返回且能正确读出图中文案，见 shared/text-models.ts 顶部实测记录）。
   * 只有显式配置了 AI_IMAGE_MODEL（说明运维确认该模型可用于 chat 识图）
   * 才优先走图片侧模型。
   */
  const primaryModel =
    input.model ||
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.AI_TEXT_MODEL?.trim() ||
    DEFAULT_TEXT_MODEL;

  /*
   * 首选视觉模型的调用**必须包在 try 里**。
   *
   * 原写法在 !response.ok 时直接 throw，于是下面那段
   * 「改走文本模型兜底」的代码**永远跑不到** ——
   * 它只在「上游 200 但内容解析不出 regions」时才生效。
   *
   * 正确口径：首选失败 = 一次尝试失败，交给兜底继续跑；
   * 两条都挂了才抛错（抛首选那条，信息量更大）。
   */
  let parsed = __testParseStructuredImageText("");
  let primaryError: Error | null = null;
  try {
    const response = await fetch(getChatEndpoint(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: primaryModel,
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
            { type: "image_url", image_url: { url: modelImageSrc } },
          ],
        }],
        // claude 系列对 temperature 直接返回 400
        // （"`temperature` is deprecated for this model."）。
        // OCR 首选模型现在默认就是 claude（见上方 primaryModel 注释），
        // 万一调用方传进别的 claude 型号，带上 temperature 同样会让整条 OCR 失败。
        // 详见 server/text-generation.ts 的 supportsTemperature 注释。
        ...(isClaudeTextModelId(primaryModel) ? {} : { temperature: 0 }),
      }),
    });
    const raw = await response.text();
    const data = safeParseJson<ImageTextResponse>(raw) || {};
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error(message || `Image OCR provider returned ${response.status}`);
    }
    parsed = __testParseStructuredImageText(
      data.choices?.[0]?.message?.content || data.output_text || ""
    );
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
    console.warn(`[ocr] 首选视觉模型未取到结果，改走文本模型兜底: ${primaryError.message}`);
  }
  if (parsed.text && parsed.regions.length > 0) {
    return {
      ...parsed,
      provider: "vision-chat-ocr",
    };
  }

  let fallback: { text: string };
  try {
    fallback = await generateText({
      module: "multimodal-text-extraction",
      // 不要写死模型名：网关会下线型号（gpt-5.4-mini、gpt-5.4 现均已下线）。
      // 写死会让这条兜底每次都先打死模型，再靠 text-generation.ts:210 的降级链
      // 逐个重试才落到存活型号——实测整条链路 ~134s，而智能文案编辑正走这里，
      // 用户侧表现为「点了很久没反应」。改读环境变量后由 .env 统一收口；
      // 留空则交给 getProviderConfig() 决定，行为与原先一致。
      model: process.env.AI_TEXT_MODEL || undefined,
      images: [{ src: modelImageSrc, title: "OCR target image" }],
      prompt: [
        "请识别图片中所有可见文字，并返回严格 JSON，不要输出解释或 Markdown。",
        "格式：{\"text\":\"按阅读顺序排列的全部原文\",\"regions\":[{\"text\":\"该区域原文\",\"x\":0.1,\"y\":0.2,\"width\":0.3,\"height\":0.1,\"rotate\":0,\"fontColor\":\"#ffffff\"}]}。",
        "坐标使用相对整张图片的 0 到 1 小数，区域完整覆盖对应文字。",
        "rotate 是文字倾斜角度（度，正值顺时针，多数为 0），fontColor 是文字主色十六进制值，尽量准确填写。",
        "保持原有语言、大小写、标点和换行；没有可读文字时返回空 text 和空 regions。",
      ].join("\n"),
    });
  } catch (fallbackError) {
    // 两条通道都失败：抛首选那条，它的报错（model_not_found / 401）更有定位价值，
    // 兜底那条多半只是「上游整体不可用」的回声。
    throw primaryError || fallbackError;
  }
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

// ⚠️ 返回类型必须是 GeneratedImageResult 而不是 `{ images }`。
// 写成 `{ images }` 会在**类型层面**把 providerTaskId 抹掉：运行时字段明明有值，
// 调用方却读不到，且全程零报错。收紧返回类型是定位"字段被静默丢弃"的有效手段。
export async function editImageWithPrompt(input: EditImageInput): Promise<GeneratedImageResult> {
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
  /**
   * ⚠️⚠️⚠️ 【2026-09-22】全站默认：原图多大，出图就多大。
   *
   * 用户原话：「原图是什么尺寸分辨率，生成的就是什么分辨率尺寸。
   * 除非用户主动在提示词或者分辨率选项中进行主动改变。」
   *
   * 原先这里只要不是 text_edit，就走 __testResolveHighDefinitionTargetSize，
   * 而那个函数内部有一道无条件的「长边不足 1536 就放大」：
   * 900×1200 的原图重绘后变成 1152×1536。比例是对的、内容是对的，
   * 只有尺寸被改了 —— 这就是用户反复反馈的那个现象，且零报错。
   *
   * 📌 判据：**锁比例 ≠ 锁尺寸**。等比放大不会变形，但它仍然是
   *    「改变了分辨率」，不符合「与原图保持一致」。
   */
  /**
   * ⚠️⚠️⚠️ 【2026-09-22 第二轮】默认值**必须是「保持」**，不能是「放大」。
   *
   * 第一轮只给三条重绘路径接上了 preserveSourceSize，线上产物一探才发现
   * 编辑类入口远不止三条：camera_view（视角变换）、annotation_edit（智能注释）、
   * 矢量化/高清、asset-erase（擦除）…… 它们全都没传这个字段，于是照样被
   * __testResolveHighDefinitionTargetSize 里那道无条件的「长边补到 1536」放大。
   *
   * 📌⭐⭐⭐ 判据：**当「正确行为」需要每个调用方主动传一个字段才能获得时，
   *    它迟早会漏 —— 而且漏的那条路零报错。把默认值翻过来才是收口。**
   *    用户的要求是「全站所有 AI 编辑和重绘能力场景」，逐个补出口天然做不到"全"。
   *
   * 现在的语义：**编辑入口一律保持原图尺寸**，除非调用方显式传
   * preserveSourceSize: false（明确表示"我就是要换个尺寸"）。
   * 用户在提示词/选择器里主动指定画幅时，前端会算出目标尺寸并传 false。
   */
  const shouldPreserveSourceSize =
    isSourcePreservingEdit || input.preserveSourceSize !== false;
  const targetSize = shouldPreserveSourceSize
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
  /**
   * 画幅锁提示语。
   *
   * ⚠️ 上游只接受 getEditSizeForAspect 的三个档位
   * （1536x1024 / 1024x1536 / 1024x1024），任何原始比例都会被吸附，
   * 所以**光靠 size 参数拿不到精确比例**，必须同时：
   *   ① 在提示词里明确要求保持原始画幅（本变量）；
   *   ② 在 finalizeImages 里按 targetWidth/targetHeight 做等比归一化兜底。
   * 📌 判据：上游档位有限 ⇒ 精确比例只能靠出图后的归一化保证，
   *    提示词只是降低裁切损失，不能当作唯一手段。
   */
  const aspectInstruction = [
    `Keep the final image canvas aspect ratio exactly ${targetWidth}:${targetHeight}.`,
    "Do not crop, pad, letterbox, stretch, or otherwise change the framing of the source image.",
    "Do not return a square image unless the source is square.",
  ].join(" ");
  /**
   * ⚠️⚠️ 全局通用提示词的**唯一注入点**（2026-09-21 新增）。
   *
   * 这里刻意注入到 textEditInstruction / textEditNegativeInstruction 这两个变量，
   * 而不是分别去改下面的 VOD 链（5885 附近）和 OpenAI 链（6040 附近）：
   * 那两条链路都是从这两个变量取值的，改这里 = 两条出口同时生效。
   * 📌 本项目已因「同一份逻辑只改一个出口」踩过十二次，注入点必须选在收口处。
   *
   * 事实源：shared/text-edit-global-prompt.ts（想调整通用倾向只改那个文件）。
   */
  const textEditGlobalPrompt = buildTextEditGlobalPrompt(isTextEditOperation);
  let textEditInstruction = isTextEditOperation
    ? [
        "This is a local text replacement edit, not a new image generation request.",
        "Use the source image as the only target canvas. Preserve every non-text region, including background, subject, product, logo, decorative elements, colors, lighting, composition, camera angle, and aspect ratio.",
        "Only remove the original readable text and place the requested replacement text back into the same visual text areas with matching typography, hierarchy, spacing, alignment, and poster design quality.",
        "Do not change the image category, scene, product type, or overall visual identity.",
        /**
         * 全局层放在基线四句之后、运行期追加内容之前。
         * 顺序理由：它是"底线要求"而不是"本次任务描述"，
         * 必须让后面追加的具体文案（renderTargetText）继续占据尾部高注意力位置。
         */
        textEditGlobalPrompt.positive,
      ].filter(Boolean).join("\n")
    : "";
  // 负面约束：OpenAI 系接口无 negative_prompt 字段，以 "Avoid" 形式并入正向提示词，
  // 降低 AI 在文字重绘时误改画面其他内容的风险。
  const textEditNegativeInstruction = isTextEditOperation
    /**
     * ⚠️⚠️ 2026-09-21 按用户指令「清除所有配置、重新配置即梦 4.0」清空自定义负面词。
     *
     * 即梦 4.0 局部重绘无独立 negative_prompt 字段，负面约束已合并进
     * prompt_global（shared/text-edit-global-prompt.ts 的 positive 原文）。
     * 这里不再叠加历史伤疤类负面词，只保留「蒙版外像素不变」这一条保真底线：
     * 它不是配置，而是 text_edit 保真编辑的机制铁律，删掉会让上游
     * 整图重绘的破坏 1:1 交付给用户且零报错。
     */
    ? (textEditGlobalPrompt.negative ? `${textEditGlobalPrompt.negative}。` : "") +
      "Keep every pixel outside the marked text areas unchanged."
    : "";

  // 记录擦字前的原始图：叠字结果 composite 时用它还原 mask 外像素，
  // 避免上游对 mask 外像素的微小改动（JPEG 压缩等）被带入最终结果
  const originalSourceImageData = sourceImageData;

  /**
   * 擦字阶段计算出的「膨胀蒙版」，供后面的 AI 叠字链路复用。
   *
   * 擦字用的是膨胀后的蒙版（外扩 radius / extraX），而早先下发给模型的蒙版
   * 用的却是前端原始紧框 —— 两者不一致时，新文案比原文长就会超出「允许写字」的白区，
   * 看起来像模型漏字。统一成同一张蒙版即可（见 editViaReferenceGeneration）。
   * 用 { buffer, mimeType } 而非裸 Buffer，避免与 Buffer 自带的 .buffer(ArrayBuffer) 混淆。
   */
  let textEditDilatedMaskBuffer: { buffer: Buffer; mimeType: string } | null = null;

  /**
   * 实际下发给叠字模型的目标文案（只含被改动区域），供自证日志复用。
   * 与 input.editedText（整图 OCR 全文）刻意分成两个变量：
   * 混用这两者正是 2026-09-21「白底板 + 多余 16+ 角标」事故的根因。
   */
  let textEditRenderTargetText = "";

  // ── 阶段 A：擦字（text_edit + AI 叠字模式专用）────────────────────
  // 先把文字区域擦成干净背景，再让主模型只负责"叠字"，
  // 避免主模型在 mask 内重新生成背景导致"重绘文字区域背景不正常"。
  // ⚠️ 2026-09-21 换路线：local（确定性绘制）模式不再进入本阶段 ——
  // 上游擦字每次脑补的背景颜色随机（白灰/蓝色底板事故）、复杂纹理擦不净，
  // local 改走阶段 B 里的 eraseTextInkLocally 笔画级本地擦除（零上游、零脑补）。
  if (isTextEditOperation && maskImageData && input.textApplyMode === "ai") {
    try {
      // 膨胀 mask 透明区域，让上游把文字边缘也擦进去，减少原文字残留。
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
       * 邻行保护（2026-09-21「GAME FOR PEACE 重影」修复，函数注释有全文）：
       * 膨胀洞上缘不再越过未改动邻行文字的下缘。失败时降级用未保护的
       * 膨胀蒙版 —— 保护是增强步骤，不能阻断擦字。
       */
      let finalMaskBuffer = dilatedMaskBuffer;
      try {
        if (input.textRegions?.length) {
          finalMaskBuffer = await subtractProtectedRegionsFromMask(
            dilatedMaskBuffer,
            input.textRegions,
            targetWidth,
            targetHeight,
            Math.max(2, Math.round(shortEdge * 0.002)),
          );
        }
      } catch (protectError) {
        console.log(
          `[text_edit] 邻行保护失败，降级为未保护膨胀蒙版: ${
            protectError instanceof Error ? protectError.message : String(protectError)
          }`,
        );
      }
      // 交给 AI 叠字链路复用（见 textEditDilatedMaskBuffer 的声明注释）
      textEditDilatedMaskBuffer = { buffer: finalMaskBuffer, mimeType: "image/png" };
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
      // 原实现一旦首选通道不可用（超时/限流/未配密钥）就整条降级到 AI 叠字，文字准确性随之失守。
      // 这里改为多通道兜底，把「拿到干净底图」的成功率拉到接近 100%。
      //
      // 删除整行时整条前置链路（引擎/佐糖）全部跳过，直接用本地像素擦除：
      // 它是三者里唯一实测能把残留清到 0.000% 的通道，且同一载荷下改字区照常
      // 改动 78.77%、其余 5 个未改动区域误伤 0.00%，不存在「为删除行牺牲改字」的取舍。
      /**
       * 背景复杂度判定（2026-09-13）。
       *
       * 采样「紧贴蒙版外侧、宽度 = 擦字实际外扩量」那一圈背景，按亮度 P90-P10 极差分档。
       * 它决定各擦除通道的先后顺序（见下方 eraseChannels 的注释）：
       *   flat / smooth → 本地像素擦除优先。平涂与柔和渐变上生成式模型只会脑补色块和接缝。
       *   textured      → 即梦背景修复优先。复杂纹理上本地插值会拉出水平条纹，
       *                   佐糖又容易留白板/鬼影，反而更显眼。
       *
       * 用稳健极差而非标准差的原因见 measureMaskSurroundingFlatness 的注释
       * （标准差会被紧贴人物的那一小段外环拉爆，把平涂底误判成复杂背景）。
       *
       * 检测失败不阻断主流程：按 textured 兜底，链路行为与接入前完全一致。
       */
      let backgroundComplexity: "flat" | "smooth" | "textured" = "textured";
      // 判据摘要：只用于日志。擦字成功那行会带上它，否则「走了哪条通道」
      // 无法区分是判定错了还是通道自己翻车了。
      let flatnessSummary = "";
      if (!hasLineDeletion) {
        try {
          const flatness = await measureMaskSurroundingFlatness(
            sourceImageData.buffer,
            maskImageData.buffer,
            targetWidth,
            targetHeight,
            maskParams.radius + maskParams.extraX,
          );
          backgroundComplexity = classifyBackgroundComplexity(
            flatness.robustSpread,
            flatness.sampleCount,
          );
          flatnessSummary =
            `复杂度=${backgroundComplexity} 极差=${flatness.robustSpread.toFixed(1)} ` +
            `标准差=${flatness.stdDev.toFixed(1)} 样本=${flatness.sampleCount}`;
          console.log(
            `[text_edit] 背景判定 ${flatnessSummary} → ${
              backgroundComplexity === "textured"
                ? "复杂纹理：即梦背景修复优先，佐糖/本地像素擦除兜底"
                : "平涂/柔和渐变：本地像素擦除优先，佐糖兜底（不走即梦）"
            }`,
          );
        } catch (error) {
          console.log(
            `[text_edit] 背景复杂度检测失败，按复杂纹理处理: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // ── 三个可互换的擦除通道 ──────────────────────────────────────────────
      // 即梦背景修复：VOD 参考图 + mask 生成式擦除，复杂纹理首选（见其定义处注释）。
      // 佐糖物体擦除：生成式 inpaint。mask 契约：白=擦除区、黑=保留区。
      // buildInpaintMask 是通道无关的通用实现（原名 buildMeituMask，
      // 随美图通道移除一并迁到 server/inpaint-mask.ts 并改名）。
      const picwishEraseChannel = {
        name: "佐糖物体擦除",
        run: async () => {
          const picwishMask = await buildInpaintMask(
            dilatedMaskBuffer,
            targetWidth,
            targetHeight,
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
      };

      // 本地像素擦除：纯 CPU、不依赖任何外部服务，保证只要有 OCR 区域就能拿到底图。
      // localEraseAttempted 记录本轮是否已经跑过，避免下方「最后一道保障」重复计算。
      let localEraseAttempted = false;
      const localEraseChannel = {
        name: "本地像素擦除",
        run: async () => {
          if (!input.textRegions?.length || !input.editedText?.trim()) return null;
          localEraseAttempted = true;
          return eraseTextRegionsLocally(
            sourceImageData.buffer,
            input.textRegions,
            input.editedText,
            targetWidth,
            targetHeight,
          );
        },
      };

      /**
       * 即梦背景修复：走 VOD 参考图 + mask 的生成式擦除通道（2026-09-13 新增）。
       *
       * 为什么单列一条通道，而不是继续用佐糖：
       * 佐糖是专用 inpaint，在平涂 / 柔和渐变上表现好，但换成艺术字底、水彩、羽翼
       * 这类**复杂纹理**时会留下白板、鬼影和色块 —— 这正是用户反馈「复杂场景擦除很差」
       * 的直接来源。即梦 4.0 对「抹掉文字并补出周边纹理」的补全更自然，且它本来就在
       * 智能注释链路里以 mask 编辑方式验证过（日志 hasMask: true）。
       *
       * 定位：复杂纹理场景的第一顺位；平涂 / 柔和渐变**不参与**（那里本地像素擦除等价于
       * 精确常量填充，生成式模型只会脑补纹理，是负收益）。计费按 VOD 即梦单价走，
       * 用户已确认接受「复杂场景多一次 VOD 调用」的成本。
       */
      const jimengEraseChannel = {
        name: "即梦背景修复",
        run: async () => {
          if (!isVodAigcConfigured()) return null;
          // 没有 OCR 区域就没有阶段 B，此处花一次 VOD 调用也拿不到确定性绘制结果，
          // 直接让位（与本地像素擦除同一前置条件）。
          if (!input.textRegions?.length || !input.editedText?.trim()) return null;
          // 蒙版语义转换：dilateMaskTransparent 输出「透明 = 擦除区」，
          // createOgdEditMaskDataUrl 反相成 VOD 要的「白 = 可编辑区」并轻度膨胀羽化。
          // 用 "edit" 而非 "add"：擦字是修改既有内容，add 会向上扩 45% 给新物体留位，
          // 用在擦字上会把可改区域溢出到无关背景。
          const { dataUrl: eraseMaskDataUrl, compositeMaskBuffer } = await createOgdEditMaskDataUrl(
            dilatedMaskBuffer,
            targetWidth,
            targetHeight,
            "edit",
            input.prompt || "",
          );
          const result = await generateImages({
            prompt: [
              "Reference image 1 is the original image. Reference image 2 is an exact mask: " +
              "white marks the only editable areas; every black area must stay pixel-identical to reference image 1.",
              "Task: completely remove the text inside the white areas and rebuild the background there so it " +
              "becomes seamless with the immediately surrounding pixels — same color, same texture, same " +
              "flatness, no patch boundary, no blur, no color block, no seam, no leftover stroke.",
              "If the surrounding background is a flat solid color, keep it perfectly flat: " +
              "do not introduce texture, gradient, vignette or noise into it.",
              "Do not draw any new text, letters, numbers, logos or symbols anywhere in the image.",
              "Return one complete edited image, not a text explanation.",
            ].join("\n\n"),
            // 固定即梦。不写 "auto"：auto 表达的是全局出图优先级，会随其他需求漂移，
            // 而这里依赖的是「即梦在复杂背景补全上的具体表现」，应绑定具体 id。
            model: "vod-jimeng",
            ratio: resolveVodReferenceRatio(targetWidth, targetHeight),
            count: 1,
            preferImageApiForReferences: true,
            /**
             * 必须关掉服务端 prompt 增强。
             * 擦字是纯指令任务，上面那段逐条约束（不得写字、蒙版外必须原样）会被增强
             * 当作待润色的描述整体重写，「不得」类硬约束在润色中被稀释。
             * 同 text_edit 叠字链路（:5329）与智能注释（:4090）的处理。
             */
            enhancePrompt: false,
            images: [
              {
                src: `data:${sourceImageData.mimeType};base64,${sourceImageData.buffer.toString("base64")}`,
                title: "target image",
              },
              // title 必须是 "annotation mask"：generateImages 是按参考图的 title
              // 识别蒙版的（tryVodGeneration 里 find(image => image.title === "annotation mask")），
              // 换个名字 VOD 侧拿到的 maskDataUrl 就是 undefined（日志 hasMask: false），
              // 模型只能靠猜，会改到画面其他位置。
              { src: eraseMaskDataUrl, title: "annotation mask" },
            ],
          });
          const src = result.images[0]?.src;
          if (!src) return null;
          /**
           * 必须做蒙版外回贴。
           *
           * VOD 是「参考图生成」而非像素级局部编辑：即使带了 ReferenceType:"mask"，
           * 它仍可能对整图重绘（背景改色、主体变形）。而调用方的 hasVisibleLocalEdit
           * 只校验「蒙版内有没有变化」—— 一张被整体重画的图必然通过校验，最终把原图
           * 换成一幅似是而非的新画，比擦不干净严重得多。
           * 用 alpha 语义蒙版合成（蒙版内 = 即梦结果，蒙版外 = 原图）把风险关回蒙版内。
           */
          const edited = await imageSrcToBuffer(src);
          return __testCompositeSourcePreservingImageEdit(
            sourceImageData.buffer,
            edited.buffer,
            compositeMaskBuffer,
            targetWidth,
            targetHeight,
          );
        },
      };

      /**
       * 参数化引擎（自建 Python / FastAPI，需 TEXT_ENGINE_BASE_URL）。
       *
       * 实测在纯色印刷体上擦净率与背景保真都优于其它通道
       * （banner CUSTOM 行 98.1% / 背景改动 11.7，本地兜底是 94.6% / 25.8）。
       *
       * 但它**不是无条件更好**：金色渐变艺术字上只有 46.9%，因为 Otsu 二分
       * 会把渐变字的暗部判成背景。所以它同样要过下面的 hasVisibleLocalEdit
       * 校验，不合格就自然让位给下一个通道，不做特判。
       *
       * 未配置 TEXT_ENGINE_BASE_URL 时返回 null，整条链路行为与接入前完全一致。
       */
      const engineEraseChannel = {
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
      };

      // 2026-09-13 移除了这里的「美图局部重绘」通道（原第 2 位）。
      // 美图账号已被停用（403 / 1003 access key is disabled），而生产**确实配着凭证**，
      // 所以它不是"没配所以跳过"，而是每次擦字都真发一次请求、被拒、再降级到佐糖——
      // 白白多付一次网络往返。
      //
      // 2026-09-13 起，各通道的先后顺序由 backgroundComplexity 决定，互为兜底：
      // 任一通道被 hasVisibleLocalEdit 判为「没擦干净」就自然让位给下一个。
      // 这比旧版「纯色底直接跳过佐糖」更稳 —— 旧结构一旦本地擦除失败就没有退路，
      // 只能整条降级到 AI 叠字，文字准确性随之失守。
      //
      // textured（复杂纹理）：即梦排**第一**，排在参数化引擎之前。
      //   这里是用户反馈「擦除很差」的主战场：佐糖在这类艺术底上会留白板/鬼影，
      //   引擎在渐变艺术字上只有 46.9%，即梦的生成式补全最自然。
      //   代价是每次擦字多一次 VOD 调用（用户已确认接受）。
      //   引擎/佐糖/本地退为兜底：即梦失败或被判「无可见变化」时自动接管。
      //   注意引擎此前是数组里**硬编码的首位**（不在本分支内），配置了
      //   TEXT_ENGINE_BASE_URL 的环境里它会无条件跑在即梦前面，因此 2026-09-13
      //   把整个顺序收进本分支，避免「本地没配 → 看着是即梦优先，测服配了 → 其实不是」。
      // flat / smooth（平涂、柔和渐变）：**不放即梦** —— 本地像素擦除在这里等价于精确
      //   常量填充，生成式模型只会脑补出纹理与接缝（负收益），放进来等于让平涂场景
      //   白白多付一次 VOD 调用。顺序保持「引擎 → 本地 → 佐糖」。
      //
      // 「删除整行」场景整条链都不进（引擎实测仅 37.3%，本地 100%），见下方 hasLineDeletion。
      const eraseChannels: Array<{ name: string; run: () => Promise<Buffer | null> }> = hasLineDeletion
        ? []
        : backgroundComplexity === "textured"
          ? [jimengEraseChannel, engineEraseChannel, picwishEraseChannel, localEraseChannel]
          : [engineEraseChannel, localEraseChannel, picwishEraseChannel];

      let cleanedBuffer: Buffer | null = null;
      let usedChannel = "";
      if (hasLineDeletion) {
        console.log(
          "[text_edit] 检测到删除整行，跳过引擎/佐糖，直接用本地像素擦除" +
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
        /**
         * ⚠️⚠️⚠️ 擦字结果只贴回「小蒙版」范围（2026-09-21 背景错位缝修复）。
         *
         * 旧做法把擦字通道返回的**整图**直接设为 sourceImageData。而即梦
         * 背景修复是生成式整图重绘：洞越大，脑补范围越大 —— 实测它把
         * 「屋檐下的暗部」整片补成了「亮色街道」，与洞外原图在洞边界形成
         * 一条贯穿画面的水平错位缝（用户报告的「背景错位」主来源）。
         *
         * 改为：以原图为底，只用「前端紧框 + 小半径膨胀」的蒙版把擦净
         * 像素贴回来。洞缩到文字笔画周围后，生成式填充变成"延续周边纹理"，
         * 语义性脑补（整片换场景）失去空间。发给上游的擦字蒙版仍是大膨胀
         * （保证擦干净），只有**贴回**范围收小 —— 两张蒙版从此分工。
         * 贴回失败降级为旧的整图替换，绝不阻断擦字。
         */
        try {
          const pasteBackRadius = clampMaskPx(shortEdge * 0.006, 3, 10);
          const pasteBackMask = await dilateMaskTransparent(
            maskImageData.buffer,
            targetWidth,
            targetHeight,
            pasteBackRadius,
            0,
            Math.max(2, pasteBackRadius),
            0,
          );
          const pastedBuffer = await __testCompositeSourcePreservingImageEdit(
            originalSourceImageData.buffer,
            cleanedBuffer,
            pasteBackMask,
            targetWidth,
            targetHeight,
          );
          cleanedBuffer = pastedBuffer;
        } catch (pasteError) {
          console.log(
            `[text_edit] 擦字小蒙版贴回失败，降级为整图替换: ${
              pasteError instanceof Error ? pasteError.message : String(pasteError)
            }`,
          );
        }
        const cleanedData = { buffer: cleanedBuffer, mimeType: "image/png" };
        sourceImageData = cleanedData;
        sourceImage = bufferToImageFile(cleanedData.buffer, cleanedData.mimeType);
        /**
         * 擦字后的指令（2026-09-13 修正）。
         *
         * 原文写的是 "Keep that cleaned background unchanged" —— 这是个**刚性**约束：
         * 它把上游擦字通道（当前命中佐糖生成式 inpaint）的产物当成权威背景，
         * 连痕迹一起要求模型原样保留。
         *
         * 实测症状：纯色背景下擦字区会留下轻微色块/糊边/接缝，
         * 模型忠实执行"保持不变"，于是这些痕迹被完整带进最终成图 ——
         * 表现为用户看到的「纯色背景回填很一般」。
         *
         * 改为「先修复、再写字」：
         *   1) 允许并要求模型把擦字区的残留笔画 / 模糊 / 色块 / 接缝修到与紧邻背景一致；
         *   2) 显式声明纯色底必须保持纯色（抑制模型在平涂背景上自作主张加纹理、渐变、暗角）。
         * 「只在蒙版内改动」这条硬约束不变。
         */
        textEditInstruction +=
          "\nThe masked text areas have already been cleared and must read as clean empty background. " +
          "Enforce that strictly before drawing anything: if the cleared area still shows any faint residue " +
          "of the removed glyphs, or any blur, color patch, seam or texture mismatch left behind by the " +
          "cleanup, restore it so that it becomes seamless with the immediately surrounding background — " +
          "identical color, identical flatness, no visible patch boundary. " +
          "If the surrounding background is a flat solid color, keep it perfectly flat: " +
          "do not introduce texture, gradient, vignette or noise into it. " +
          "Only then paint the replacement text, and only inside the mask.";
        /**
         * 擦字成功后，源图里已经没有原文字了。
         * 但上面 textEditInstruction 基线还写着「移除原有可读文字」——
         * 模型读到一个不存在的指令，可能会去"找文字"并误伤画面元素。
         * 这里把要写入的目标文案显式喂进去，把任务从「改写」收敛为「写入」。
         */
        if (input.editedText?.trim()) {
          /**
           * ⚠️⚠️⚠️ 2026-09-21 只能下发「被改动区域」的目标文案，不能下发整图全文。
           *
           * 【事故现象】用户只把右下角标题改成「欢乐中国年」，出图却是
           * 一块白色矩形底板 + 黑色默认字体，底板右侧还凭空多出一个 16+ 角标。
           *
           * 【真因】input.editedText 是**整张图 OCR 出来的全部文字**
           * （线上日志实锤：editedText 里带着 GAME FOR PEACE / 龙狮城 /
           *  16+ / CADPA / 适龄提示）。而蒙版只框住被改的那一行。
           * 旧指令等于对模型说：「把这十行字一字不落地写进这个小白框里」。
           * 模型塞不下 → 自己开一块底板当版面、把 16+ 也画进去。
           * 📌 它不是能力不行，是**在忠实执行一条错误指令**。零报错。
           *
           * 【为什么必须用 resolveRegionTargetTexts】
           * 「哪些区域被改成了什么」这一口径在本项目里只有这一个实现
           * （text-replace-precise.ts:1600），擦字通道与本地绘制通道都走它。
           * AI 叠字这条路自己读 editedText 原文 = 第二个出口、口径必然漂移，
           * 表现就是「擦了 A 行、字要求写 B 行」。
           *
           * 兜底：解析不出任何 changed 区域时，退回旧的整段文案 ——
           * 宁可版面丑，也不能变成「不告诉模型要写什么」而写出乱码。
           */
          const changedTexts =
            input.textRegions?.length
              ? resolveRegionTargetTexts(input.textRegions, input.editedText)
                  .filter(item => item.changed && item.targetText?.trim())
                  .map(item => item.targetText!.trim())
              : [];
          const renderTargetText = changedTexts.length
            ? changedTexts.join("\n")
            : input.editedText.trim();
          textEditRenderTargetText = renderTargetText;
          if (!changedTexts.length) {
            // 静默降级最难排查：落这条分支说明区域匹配失效，
            // 出图退回「整图全文塞进小框」的旧事故形态，必须留痕。
            console.log(
              "[text_edit] ⚠️ 未解析出被改动区域，叠字指令降级为整段文案（可能出现多余文字/底板）",
            );
          }
          textEditInstruction +=
            `\nThe exact replacement text to render is:\n${renderTargetText}\n` +
            "Render this text verbatim — do not translate, paraphrase, reorder, or add any extra words. " +
            /**
             * ⚠️ 这两句是上面那条事故的正面堵漏：光缩小文案范围还不够，
             * 必须显式告诉模型「图上别处的文字不归你管」，
             * 否则它仍可能"好心"把看到的角标/标语补画进蒙版里。
             */
            "This is the ONLY text you may draw. Do not add, duplicate or re-draw any other text, " +
            "logo, rating badge, slogan or caption that exists elsewhere in the image — those areas " +
            "are outside the mask and are already correct. " +
            "Match the original typography style, weight, color, perspective and lighting of the area." +
            /**
             * ⚠️⚠️ 语种/行数提示必须接在**这里**，不能放进全局层常量。
             *
             * 理由：它依赖 renderTargetText —— 只有到了这一步才知道
             * ① 目标文案是中文还是英文、② 一共几行。
             * 全局层是静态常量，拿不到这些运行期信息，硬塞进去就只能写死
             * "一行中文"，遇到多区域批量替换会把多行挤成一行（零报错）。
             * 📌 判据：凡依赖本次请求内容的约束，都不属于"全局"层。
             */
            (buildTextEditLanguageHint(renderTargetText)
              ? `\n${buildTextEditLanguageHint(renderTargetText)}`
              : "");
        }
        console.log(
          `[text_edit] 擦字成功（通道：${usedChannel}）` +
          // 带上背景判据。同一张图在换阈值/换通道前后的差异全靠这行对齐：
          // 只说「通道：佐糖物体擦除」无法区分是判定分错了档，还是该通道自己翻车。
          (flatnessSummary ? `，背景 ${flatnessSummary}` : "") +
          `，` +
          // 不要在这里硬编码模型名：该字段曾写死 "image2.5"，换模型后日志
          // 与实际下发的模型不符，排查时会把人带偏。直接引用 selectedModel。
          `贴回方式=${input.textApplyMode === "ai" ? `AI 叠字(${selectedModel})` : "本地确定性绘制"}`,
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

  /**
   * 擦字失败保护（2026-09-13，2026-09-21 换路线后仅 AI 模式需要）。
   *
   * AI 叠字模式的进入条件是「擦字必须成功」：擦字一旦失败，
   * 即梦 4.0 即使收到膨胀 mask 也不会严格遵守，会把整张图重绘：
   * 背景被改、人物变形，或在未擦净的原字上再叠一层新字
   * （用户实测的「双层字 / 乱套」由此而来）。
   * local（确定性绘制）模式不再依赖上游擦字（eraseTextInkLocally
   * 在阶段 B 内本地完成），因此不在此列。
   */
  if (
    isTextEditOperation &&
    input.textApplyMode === "ai" &&
    maskImageData &&
    input.textRegions?.length &&
    input.editedText?.trim() &&
    sourceImageData === originalSourceImageData
  ) {
    const changedRegionCount = resolveRegionTargetTexts(input.textRegions, input.editedText)
      .filter(item => item.changed).length;
    if (changedRegionCount > 0) {
      throw new Error("文字擦除未成功，已停止生成以保护原图，请重试或调整文字选区");
    }
  }

  // ── 阶段 B：确定性文字绘制（text_edit + 携带 OCR 区域）──────────────
  // 2026-09-21 换路线：不再要求「上游擦字成功」——进入本阶段先用
  // eraseTextInkLocally 在本地完成笔画级擦除（零上游调用、零脑补背景），
  // 再按 OCR 区域把新文字绘制上去，跳过 AI 叠字，彻底避免模型随机性
  //（漏字/重影/底板/伪影）。
  if (
    isTextEditOperation &&
    // 默认走本地确定性绘制（逐字 100% 准确）。只有显式要求 "ai" 时才跳过这里，
    // 把叠字交给 AI 叠字链路 —— 风格还原更好，但实测会漏字/错字，需人工核字。
    // 注意：选了 "ai" 之后失败不会回落到这里（阶段 B 已被跳过），
    // 而是沿 editViaReferenceGeneration 的 fallback 链换下一个模型重试。
    input.textApplyMode !== "ai" &&
    maskImageData &&
    input.textRegions?.length &&
    input.editedText?.trim()
  ) {
    try {
      // 笔画级本地擦除：只替换原字笔画像素为插值背景，其余像素原样保留
      let localCleaned = await eraseTextInkLocally(
        originalSourceImageData.buffer,
        input.textRegions,
        input.editedText,
        targetWidth,
        targetHeight,
      );

      /**
       * ⭐⭐⭐ 复杂纹理背景：先试上游 inpaint（2026-09-22）。
       *
       * 本地扩散填充在**高频纹理**（篮球、人物、街景）上有物理天花板：
       * 它只能解拉普拉斯方程做平滑外插，补不出纹理，结果必然是一片雾。
       * 实测篮球海报上反复在「擦不净 ↔ 糊太多」之间振荡，属方法极限而非调参问题。
       *
       * 但**不能无条件切上游**：用户已踩过「上游脑补随机底色（白灰/蓝色底板事故）」
       * 的坑，平涂/柔和渐变背景上本地擦除等价于精确常量填充，远优于生成式脑补。
       * 所以复用站点既有的 classifyBackgroundComplexity 分流：
       *   flat / smooth → 保持纯本地（零上游、零脑补、零额外费用）
       *   textured      → 先试佐糖 inpaint，失败/未配置则原样回落本地
       *
       * 📌 判据：**换路线要按场景分流，不是全局替换** —— 新路线在老场景上
       *    很可能是负收益，而那正是当初选老路线的原因。
       */
      if (maskImageData && isPicWishConfigured()) {
        try {
          const flatness = await measureMaskSurroundingFlatness(
            originalSourceImageData.buffer,
            maskImageData.buffer,
            targetWidth,
            targetHeight,
            Math.max(6, Math.round(Math.min(targetWidth, targetHeight) * 0.02)),
          );
          const complexity = classifyBackgroundComplexity(
            flatness.robustSpread,
            flatness.sampleCount,
          );
          console.log(
            `[text_edit] local 擦除分流: 复杂度=${complexity} 极差=${flatness.robustSpread.toFixed(1)} ` +
              `样本=${flatness.sampleCount} → ${
                complexity === "textured" ? "先试佐糖 inpaint" : "纯本地扩散填充"
              }`,
          );
          if (complexity === "textured") {
            const upstream = await erasePreferUpstream({
              originalBuffer: originalSourceImageData.buffer,
              originalMimeType: originalSourceImageData.mimeType,
              maskBuffer: maskImageData.buffer,
              localFallback: localCleaned,
              textRegions: input.textRegions,
              width: targetWidth,
              height: targetHeight,
            });
            if (upstream) localCleaned = upstream;
          }
        } catch (error) {
          // 分流判定失败绝不阻断主流程：保持已算好的本地结果。
          console.log(
            `[text_edit] local 擦除分流判定失败，沿用本地扩散填充: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      console.log(
        `[text_edit debug] editedText="${input.editedText}", regions=${JSON.stringify(input.textRegions)}, target=${targetWidth}x${targetHeight}`,
      );
      const drawn = await drawTextReplacement({
        imageBuffer: localCleaned,
        originalBuffer: originalSourceImageData.buffer,
        textRegions: input.textRegions,
        editedText: input.editedText,
        targetWidth,
        targetHeight,
      });

      // 步骤 5：质量自检。绘制没画上或画成色块时主动放弃方案 B，
      // 交给后面的 AI 叠字兜底，避免把明显有问题的结果直接返回给用户。
      const quality = await verifyDrawnTextQuality(
        localCleaned,
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
      const modifiedMask = await createInkLevelEditMask({
        originalBuffer: originalSourceImageData.buffer,
        // ⚠️ 2026-09-22 修：local 模式下 sourceImageData 就是原图（阶段 A 已跳过），
        // 传它等于告诉蒙版「擦净图 == 原图」→ 原字笔画区被判为「无改动」而保留原图，
        // 残影零报错存活。必须传本地笔画级擦除的真实产物。
        cleanedBuffer: localCleaned,
        drawnBuffer: drawn,
        textRegions: input.textRegions!,
        editedText: input.editedText!,
        width: targetWidth,
        height: targetHeight,
      });
      const composited = await __testCompositeSourcePreservingImageEdit(
        originalSourceImageData.buffer,
        drawn,
        modifiedMask,
        targetWidth,
        targetHeight,
      );
      await writeTextEditDebugArtifacts({
        cleaned: localCleaned,
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
      // 局部确定性绘制失败时**不再**静默降级到 AI 兜底：
      // 即梦 4.0 在 text_edit 链路里会无视 mask 整图重绘（出现"CADPA"等版署字符、
      // 背景扭曲、人物变形），对原图的破坏比"绘制失败"本身更严重。
      // 改为向上抛错，让调用方把清晰的失败原因反馈给用户，由用户决定是否重试
      // 或调整 OCR 区域，而不是拿到一张面目全非的图。
      const reason = error instanceof Error ? error.message : String(error);
      console.log(
        `[text_edit] 确定性文字绘制失败，**不**降级为 AI 叠字: ${reason}`,
      );
      throw new Error(`确定性文字绘制失败: ${reason}`);
    }
  }

  const cameraViewInstruction = isCameraViewOperation
    ? buildCameraViewEditInstruction(input)
    : "";
  const finalizeImages = async (images: GeneratedImage[]) => {
    /**
     * ⚠️⚠️⚠️ 第三参数必须是 isSourcePreservingEdit（2026-09-23 裁切错位修复）。
     *
     * 下面的 diff 混合与蒙版合成，是拿「模型输出」与「擦净基底 / 原图 / 蒙版」
     * 做**逐像素**运算的。只要归一化阶段裁过一刀，这几份数据的坐标系就错开了，
     * 且全程零报错——用户看到的就是文字被切掉一截并整体偏移。
     * 保真编辑一律走 fill（保持坐标线性对应），纯生成保持原 cover 行为。
     */
    const normalizedImages = await __testNormalizeGeneratedImagesToTargetAspect(
      images,
      targetWidth,
      targetHeight,
      isSourcePreservingEdit,
    );
    if (!isSourcePreservingEdit || !maskImageData) return normalizedImages;
    /**
     * ⚠️⚠️⚠️ 合成蒙版必须优先用擦字阶段那张**膨胀蒙版**（2026-09-21）。
     *
     * 前端传下来的 maskImageData 是「仅框住被改原文字」的紧框。用紧框合成时，
     * 新文案比原文长的那部分会被裁在旧文字区边界上，看起来像模型漏字 ——
     * 这正是此前把 text_edit 整条合成关掉（usesVodMask 分支）的原因。
     *
     * 但关掉合成的代价更大：上游一旦不守蒙版（即梦 4.0 在 text_edit 链路里
     * 会整图重绘，见下方 :5664 注释），破坏就 1:1 交付给用户且零报错。
     * 正确解法不是"取消还原"，而是"换一张够大的蒙版还原"：
     * textEditDilatedMaskBuffer 与下发给模型的白区是同一张，
     * 既留足了写字余量，又能把白区之外的一切乱改挡回原图。
     *
     * 📌⭐⭐⭐ 判据：「上游承诺了约束」永远不能替代「自己再验一次 / 再还原一次」。
     *    承诺失效时没有任何报错，只是给你另一张图。
     */
    const compositeMask = textEditDilatedMaskBuffer || maskImageData;
    return Promise.all(normalizedImages.map(async image => {
      const editedImageData = await imageSrcToBuffer(image.src);
      /**
       * ⚠️⚠️⚠️ text_edit 专用的第二层合成（2026-09-21，与样本条重排同批）。
       *
       * 蒙版内不再整块取模型输出：先以擦净图为基底做 diff 混合，
       * 只把「模型相对擦净图的真实改动（新文字及其光效）」留在图层里，
       * 模型整图重绘的构图漂移/背景脑补被软阈值挡在基底之外。
       * 之后再走下方蒙版合成：蒙版外 = 原图，蒙版内 = 基底 + 文字像素。
       * 非 text_edit 路径（换色/换材质等）保持旧行为不变。
       *
       * 对齐目标：只有唯一被改区域时才传（多区时文字块与区域的对应
       * 关系不唯一，贸然平移可能张冠李戴，保守跳过）。
       */
      const textEditAlignCenter = isTextEditOperation
        ? (() => {
            const changed = input.textRegions?.length && input.editedText?.trim()
              ? resolveRegionTargetTexts(input.textRegions, input.editedText)
                  .filter(item => item.changed)
              : [];
            if (changed.length !== 1) return undefined;
            const region = changed[0].region;
            return {
              x: (region.x + region.width / 2) * targetWidth,
              y: (region.y + region.height / 2) * targetHeight,
            };
          })()
        : undefined;
      const editLayerBuffer = isTextEditOperation
        ? await __testCompositeTextPixelsOverCleanBase(
            sourceImageData.buffer,
            editedImageData.buffer,
            targetWidth,
            targetHeight,
            textEditAlignCenter,
            compositeMask.buffer,
          )
        : editedImageData.buffer;
      const composited = await __testCompositeSourcePreservingImageEdit(
        originalSourceImageData.buffer,
        editLayerBuffer,
        compositeMask.buffer,
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
    /**
     * text_edit 专用：生成 VOD 能识别的精确蒙版。
     *
     * 必须与智能注释走同一条路 —— `generateImages` 是**按参考图的 title**
     * 识别蒙版的（tryVodGeneration 里 find(image => image.title === "annotation mask")）。
     * 此前 text_edit 只发了「原图 + 橙色引导图」两张，VOD 侧拿到的 maskDataUrl
     * 恒为 undefined（日志里 hasMask: false），模型只能靠橙色覆盖区去**猜**
     * 可改范围，而不是被硬性约束在蒙版内 —— 这正是它容易改到画面其他位置、
     * 以及写出的字与预期排版对不上的原因之一。
     *
     * 蒙版语义转换：前端传来的 mask 是「透明 = 可改文字区」，
     * createOgdEditMaskDataUrl 会反相成 VOD 需要的「白 = 可编辑区」并轻度膨胀羽化。
     * 这里用 "edit" 模式而非 "add"：文字替换是修改既有内容，
     * "add" 会向上扩展 45% 高度给新物体留位，用在文字上会让可改区域溢出到无关背景。
     */
    // 优先用擦字阶段那张膨胀蒙版：让「擦掉的背景范围」与「允许写字的范围」对齐。
    // 早先用前端原始紧框时，新文案比原文长就会超出白区边界，看起来像模型漏字。
    /**
     * ⚠️⚠️⚠️ 原字样本参考图（2026-09-20 根因修复）。
     *
     * 必须用 `originalSourceImageData` —— 擦字前的原图。用 `sourceImageData`
     * 等于把一张已经没有文字的图当"字体样本"喂进去，那正是本次事故本身。
     * 只在「擦字确实发生过」时才生成：没擦字的话原图还在参考图 1 里，
     * 再塞一张重复样本只会稀释注意力、白烧一张参考图额度。
     */
    const typographyReferenceDataUrl =
      isTextEditOperation &&
      input.textRegions?.length &&
      sourceImageData !== originalSourceImageData
        ? await (async () => {
            try {
              // 每个区域的目标文案（与区域同序）——样本条按它决定重排出几个字。
              // 与 :5586 处的 changedTexts 同一公共口径，避免第二出口漂移。
              const typographyTargetTexts = input.editedText?.trim()
                ? resolveRegionTargetTexts(input.textRegions!, input.editedText)
                    .map(item => item.targetText)
                : undefined;
              const buffer = await createOriginalTypographyReferenceImage(
                originalSourceImageData.buffer,
                input.textRegions!,
                targetWidth,
                targetHeight,
                typographyTargetTexts,
              );
              return buffer ? `data:image/png;base64,${buffer.toString("base64")}` : "";
            } catch (error) {
              // 样本图只是增强项，失败不能拖垮整条叠字链路。
              // 但必须打日志：静默失败会让「效果又变差了」无从归因。
              console.log(
                `[text_edit] 原字样本参考图生成失败，降级为无样本叠字: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              return "";
            }
          })()
        : "";
    const textEditMaskSource = textEditDilatedMaskBuffer || maskImageData;
    const textEditVodMaskDataUrl = isTextEditOperation && textEditMaskSource
      ? (await createOgdEditMaskDataUrl(
          textEditMaskSource.buffer,
          targetWidth,
          targetHeight,
          "edit",
          input.prompt || "",
        )).dataUrl
      : "";
    // 优先使用与源图比例接近的 2:3，避免 VOD 参考图生成被错误地裁剪到 9:16。
    const ratio = resolveVodReferenceRatio(targetWidth, targetHeight);
    const referenceModels =
      usesAutoModel && (requiresVisibleLocalChange || usesCameraViewAutoModel)
        ? selectedModels
        : requiresVisibleLocalChange
          ? Array.from(new Set([requestedModel, ...getImageModelFallbackAttempts("auto")]))
          : [requestedModel];
    /**
     * 自证日志：一次打印「谁会被调用、蒙版有没有带上、增强有没有关」。
     *
     * 没有这条日志时，评估结果很难归因 —— 看到出图不对，无法区分是
     * ① 模型能力不行、② mask 没传下去、③ prompt 被服务端增强改写了。
     */
    if (isTextEditOperation) {
      console.log("[text_edit] AI 叠字链路", JSON.stringify({
        referenceModels: Array.from(new Set(referenceModels)),
        vodMask: Boolean(textEditVodMaskDataUrl),
        // ⭐ 本次事故的归因字段：false 就说明模型又在"没看过原字"的情况下叠字，
        // 出图必然退回默认文本框样式。排查时先看这一位再怀疑模型。
        typographySample: Boolean(typographyReferenceDataUrl),
        // 这条路径上增强已恒关（见下方 enhancePrompt 的说明），
        // 日志照实写死 false —— 写成条件式会让排查者以为它还可能为真。
        enhancePrompt: false,
        /**
         * ⚠️ 2026-09-21：这里必须同时打印「整图全文」和「实际下发的目标文案」。
         *
         * 旧版只打 editedText（整图 OCR 全文），于是 2026-09-21 那次
         * 「白底板 + 多出 16+ 角标」事故的根因就藏在日志里看不出来 ——
         * 日志显示的文案和我以为下发的文案长得一样，误导排查方向去怀疑模型。
         * 📌 判据：日志要打的是**实际送出去的值**，不是它的上游原料。
         */
        editedTextAll: input.editedText,
        renderTargetText: textEditRenderTargetText || input.editedText,
      }));
    }
    let lastError: unknown;
    /**
     * 位置验收（2026-09-21）：只有唯一被改区域时才启用（多区时文案与区域的
     * 对应关系不唯一，无法用单一中心判定）。重试上限 1 次 —— 验收不过最多
     * 多花一次模型调用，绝不连环重试烧积分；全部不过返回得分最高的候选。
     */
    /**
     * 位置验收（2026-09-21 初版只支持单区；同日补多区逐行验收）：
     * 每个被改区域都要用「它自己的 targetText」验收 —— 输出图 OCR 中
     * 必须能找到该行文案、且位置对准该区域中心。多区场景曾因
     * 「文案与区域对应关系不唯一」被整体跳过验收，结果第二行整行
     * 没写上、原字残影还在，也无人拦截（零报错的假成功）。
     * 重试上限 1 次 —— 验收不过最多多花一次模型调用，绝不连环重试
     * 烧积分；全部不过返回得分最高的候选。
     */
    const placementChecks = (() => {
      if (!isTextEditOperation || !input.textRegions?.length || !input.editedText?.trim()) return [];
      return resolveRegionTargetTexts(input.textRegions, input.editedText)
        .filter(item => item.changed)
        .map(item => ({
          region: item.region,
          text: (item.targetText || "").trim(),
        }))
        .filter(item => item.text.length > 0);
    })();
    let placementRetries = 0;
    let bestTextEditResult: { images: Awaited<ReturnType<typeof finalizeImages>>; score: number } | null = null;

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
            /**
             * ⚠️⚠️⚠️ 这段必须与 images 数组里的 "original typography sample" 同生共死。
             * 只塞图不说明，模型会把它当成"要画进画面的素材"贴到成图里；
             * 只说明不塞图，就是本次事故（指令说照着原字复刻，图里根本没有原字）。
             */
            typographyReferenceDataUrl
              ? "One reference image is titled 'original typography sample'. It is NOT content to paste into the result, and it must never appear as a panel, crop, strip or grey block anywhere in the output. It contains the ACTUAL original lettering that was removed, cropped straight out of the source poster onto a neutral grey backing. Study it closely and reproduce its exact lettering design for the replacement text: the same typeface character and glyph construction, the same stroke weight, the same slant, perspective and baseline, the same fill color or gradient, the same outline/stroke, drop shadow, glow, bevel, grunge or distressed texture, and the same glyph size relative to the text block. The grey backing in that sample is only a neutral carrier — it is not a background plate and must not be reproduced behind the new text."
              : "",
            textEditVodMaskDataUrl
              ? "One later reference image is an exact mask for this edit: white marks the only editable text areas, black must stay pixel-identical to reference image 1. Remove the original text inside the white areas and render the replacement text there."
              : "",
            // ⚠️ 这句原本会把上面那张「原字样本」也一起归类成"素材图"，
            // 导致模型试图把样本条本身画进成图。text_edit 下必须换一句口径。
            isTextEditOperation
              ? "Apart from the typography sample and the mask described above, use any later reference images only for the requested object, accessory, style, texture, or detail."
              : "Use any later reference images only for the requested object, accessory, style, texture, or detail.",
            "Return one complete edited image, not a text explanation.",
            aspectInstruction,
            textEditNegativeInstruction,
          ].join("\n\n"),
          model: referenceModel,
          ratio,
          count: 1,
          preferImageApiForReferences: requiresVisibleLocalChange,
          /**
           * ⚠️⚠️⚠️ 这条路径上 VOD 服务端的 prompt 增强**一律关闭**。
           *
           * 【为什么 2026-09-20 从「只关视角/文字编辑」扩大到全关】
           * editViaReferenceGeneration 的每一次调用都是**基于原图的编辑**，
           * 提示词里必定带着上面那句
           * "Use reference image 1 as the target canvas. Preserve its subject
           *  identity, composition, camera angle, lighting, proportions..."。
           * 这句是整条链路的命脉 —— 它是唯一把「参考图 1 = 要改的那张图」
           * 这个语义告诉模型的地方。
           *
           * 而 VOD 的 EnhancePrompt 是个**文生图导向**的润色器：它会把整段
           * 提示词当作「用户想画什么」的粗描述重写成一段华丽的生图描述，
           * 「保持原图主体/构图/光影」这类**约束性**语句在重写中会被整体丢弃，
           * 只留下「画面内容」的描述。结果就是模型收到一段纯文生图提示词 +
           * 一张它以为只是风格参考的图 → **照着提示词重新画一张**。
           *
           * 用户侧的表现正是本次报告的缺陷：
           * 「局部重绘生成的图片完全没有基于原图的内容结合」。
           * 注意它**零报错**：图出来了、尺寸对、风格也像，只是内容换了一张，
           * 所以极易被误判成「模型能力不行」而去换模型 —— 换哪个都一样。
           *
           * 📌 判据：凡是提示词里含「保持/不要改变 X」这类**约束**的请求，
           *    都不能交给上游的 prompt 增强 —— 增强器只保留「画什么」，
           *    不保留「不许动什么」。
           *
           * 视角转换与智能文案编辑原本就在这里关（原因分别是空间约束被稀释、
           * 逐字渲染指令被改写），现在统一为「这条路径恒关」，
           * 少一个「哪些 operation 要关」的分类判断，也就少一类漏判。
           */
          enhancePrompt: false,
          images: [
            { src: sourceDataUrl, title: "target image" },
            ...(editGuideDataUrl ? [{ src: editGuideDataUrl, title: "local edit guide" }] : []),
            ...(typographyReferenceDataUrl
              ? [{ src: typographyReferenceDataUrl, title: "original typography sample" }]
              : []),
            ...(textEditVodMaskDataUrl ? [{ src: textEditVodMaskDataUrl, title: "annotation mask" }] : []),
            ...referenceImages,
          ],
        });
        /**
         * ⚠️⚠️⚠️ 2026-09-21 撤销「走 VOD 蒙版就跳过合成」的旧逻辑。
         *
         * 旧代码是：
         *   const usesVodMask = Boolean(textEditVodMaskDataUrl);
         *   const images = usesVodMask ? 仅归一化比例 : finalizeImages(...)
         * 理由写的是「VOD 服务端已按 ReferenceType: "mask" 保证蒙版外保持原图，
         * 后端再合成一次是冗余的」。
         *
         * **这个前提是错的，而且本文件自己早就写明了**：下方确定性绘制失败分支的
         * 注释原话是「即梦 4.0 在 text_edit 链路里会无视 mask 整图重绘
         * （出现 "CADPA" 等版署字符、背景扭曲、人物变形）」。当 textApplyMode="ai"
         * 时叠字正是交给即梦，而这条主路径上没有任何兜底 ——
         * 用户实测得到的就是：文字排版整体挪位、人物/道具位置改变、
         * 画面右下角平白多出一个模型自行脑补的适龄提示角标。
         *
         * 且全程零报错：下面的 hasVisibleLocalEdit 只检查「蒙版内有没有变化」，
         * 整图重绘必然满足，闸门恒放行。
         *
         * 旧注释担心的「合成会把变长的新文案裁掉」属实，但根因是**合成用了紧框**，
         * 不是「合成」本身有错。finalizeImages 现已改用擦字阶段的膨胀蒙版
         * （与下发给模型的白区同一张），裁字问题随之消失。
         */
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
        /**
         * 位置验收闸门：OCR 找目标文案实际位置，合格直接返回；
         * 不合格记为候选、限重试 1 次；OCR 自身失败视为合格放行
         * （验收是增强步骤，绝不能因它废掉一张好图）。
         */
        if (placementChecks.length && images[0]) {
          /**
           * 多区逐行验收：同一张输出图只 OCR 一次，逐个被改区域
           * 用它自己的 targetText 匹配 + 位置比对。全部合格才放行。
           */
          let allAccepted = true;
          let scoreSum = 0;
          const failedReasons: string[] = [];
          try {
            const imageDataUrl = `data:image/png;base64,${(
              await imageSrcToBuffer(images[0].src).then(data => data.buffer)
            ).toString("base64")}`;
            const { regions: outputRegions } = await extractImageText({ imageSrc: imageDataUrl });
            for (const check of placementChecks) {
              const placement = scorePlacementAgainstRegions(
                outputRegions,
                check.text,
                check.region,
              );
              scoreSum += placement.score;
              if (!placement.accepted) {
                allAccepted = false;
                failedReasons.push(`「${check.text}」${placement.reason}`);
              }
            }
          } catch (ocrError) {
            console.log(
              `[text_edit] 位置验收 OCR 失败，放行当前结果: ${
                ocrError instanceof Error ? ocrError.message : String(ocrError)
              }`,
            );
            allAccepted = true;
          }
          if (allAccepted) return { images };
          const avgScore = scoreSum / Math.max(1, placementChecks.length);
          console.log(`[text_edit] 位置验收未过（${failedReasons.join("；")}）`);
          if (!bestTextEditResult || avgScore > bestTextEditResult.score) {
            bestTextEditResult = { images, score: avgScore };
          }
          lastError = new Error(`text_edit 位置验收未过: ${failedReasons.join("；")}`);
          if (placementRetries >= 1) break;
          placementRetries += 1;
          continue;
        }
        return { images };
      } catch (error) {
        lastError = error;
        if (!usesAutoModel || !(requiresVisibleLocalChange || usesCameraViewAutoModel)) throw error;
      }
    }

    if (bestTextEditResult) {
      console.log(
        `[text_edit] 所有尝试位置验收均未过，返回最优候选（score=${bestTextEditResult.score.toFixed(2)}）`,
      );
      return { images: bestTextEditResult.images };
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

/**
 * 扩图（外延生成）—— 供应商为腾讯云 VOD Kling（`SceneType: image_expand`）。
 *
 * 2026-09-13 从佐糖 advanced-image-expand 切换而来。切换动机与实测结论见
 * `createVodImageExpandTask` 的注释。
 *
 * 方向比例语义在两家是**一致**的，可以直接透传：
 *   前端 `toExpansionRatio(expandTop, sourceH)` = 扩展像素 ÷ 原图边长，
 *   Kling `up_expansion_ratio` 同样是「基于原图高度的倍数」。
 *   （佐糖侧 clamp 到 [0,1]，Kling 支持 [0,2]，前端现有上限更严，不会越界。）
 *
 * ⚠️ Kling 不接受 mask 做扩图，只认四向比例。若调用方只给了 mask 没给方向，
 * 这里无法推断扩展方向，直接报错比静默出一张没扩的图要好。
 */
export async function expandImageWithVodKling(input: ExpandImageInput): Promise<GeneratedImageResult> {
  const sourceImageSrc = input.imageSrc?.trim();
  const sourceImageUrl = (input.imageUrl || input.image_url || "").trim();
  if (!sourceImageSrc && !sourceImageUrl) {
    throw new Error("Missing imageSrc");
  }

  const top = coerceOptionalNumber(input.top);
  const bottom = coerceOptionalNumber(input.bottom);
  const left = coerceOptionalNumber(input.left);
  const right = coerceOptionalNumber(input.right);
  const hasAnyDirection = [top, bottom, left, right].some(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (!hasAnyDirection) {
    // 佐糖时代可以只给 mask 让上游自己推断扩展区域，Kling 不行。
    // 区分两种错误，否则调用方带着 mask 过来只会看到「请重新框选」，
    // 完全看不出是上游能力差异导致的。
    const hasMask = Boolean(
      (input.maskSrc || "").trim() || (input.maskUrl || "").trim() || (input.mask_url || "").trim(),
    );
    if (hasMask) {
      throw new Error("扩图已切换至腾讯云 VOD Kling，不支持蒙版驱动扩图，请改为传入四个方向的扩展比例");
    }
    throw new Error("扩图需要至少一个方向的扩展比例，请重新框选扩展区域");
  }

  const sourceImageData = sourceImageSrc ? await imageSrcToBuffer(sourceImageSrc) : null;
  const sourceImageDimensions = sourceImageData
    ? await getImageBufferDimensions(sourceImageData.buffer)
    : {
        width: coerceTargetDimension(input.targetWidth) || 1024,
        height: coerceTargetDimension(input.targetHeight) || 1024,
      };

  const requestedWidth = coerceTargetDimension(input.targetWidth) || sourceImageDimensions.width;
  const requestedHeight = coerceTargetDimension(input.targetHeight) || sourceImageDimensions.height;
  const targetSize = __testResolveHighDefinitionTargetSize(
    requestedWidth,
    requestedHeight,
    sourceImageDimensions.width,
    sourceImageDimensions.height,
  );

  // Kling 只认 Url / Base64。本地 data: 图直接透传 base64，远程图走 URL。
  const imageForProvider = sourceImageData
    ? `data:${sourceImageData.mimeType || "image/png"};base64,${sourceImageData.buffer.toString("base64")}`
    : sourceImageUrl;

  // Kling 的 prompt 上限是 2500 字符，远宽于佐糖的 200。
  // 这里不再套用 clampImageExpansionPrompt 的 200 限制，否则白白丢掉提示词表达力。
  const prompt = (input.prompt || "").trim().slice(0, VOD_EXPANSION_PROMPT_MAX_LENGTH);

  const { taskId } = await createVodImageExpandTask({
    imageUrl: imageForProvider,
    prompt,
    up: top,
    down: bottom,
    left,
    right,
    seed: coerceOptionalNumber(input.seed),
    resolution: "1K",
  });

  const polled = await pollVodTask(taskId);
  if (polled.status !== "success" || !polled.images?.length) {
    throw new Error(polled.error || "AI 扩图未返回可用内容，请稍后重试");
  }

  const normalized = await __testNormalizeGeneratedImagesToTargetAspect(
    polled.images,
    targetSize.width,
    targetSize.height,
  );
  if (normalized.length === 0) {
    throw new Error("AI 扩图未返回可用内容，请稍后重试");
  }
  return withProviderTaskIds({ images: normalized }, [taskId]);
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
