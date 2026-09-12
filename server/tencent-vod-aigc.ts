/**
 * Tencent Cloud VOD AIGC Service Client
 * Supports image generation using various AI models (GEM, OG, MJ, Kling, etc.)
 * Documentation: https://cloud.tencent.com/document/product/266/126240
 */
import crypto from "crypto";
import axios from "axios";

const VOD_AIGC_ENDPOINT = "https://vod.tencentcloudapi.com";
const SERVICE = "vod";
const VERSION = "2018-07-17";
const ALGORITHM = "TC3-HMAC-SHA256";

type VodAigcConfig = {
  secretId: string;
  secretKey: string;
  subAppId: number;
};

type ImageOutputConfig = {
  StorageMode?: "Temporary" | "Permanent";
  Resolution?: "1K" | "2K" | "4K";
  AspectRatio?: string;
  OutputImageCount?: number;
  OutputFormat?: "png" | "jpeg";
  MediaName?: string;
  PersonGeneration?: "AllowAdult" | "Disallowed";
  InputComplianceCheck?: "Enabled" | "Disabled";
  OutputComplianceCheck?: "Enabled" | "Disabled";
};

type FileInfo = {
  Type: "File" | "Url" | "Base64";
  Url?: string;
  FileId?: string;
  Base64?: string;
  Category?: "Image" | "Video" | "Audio";
  ReferenceType?: string;
  ObjectId?: string;
  Usage?: "FirstFrame" | "Reference" | "LastFrame";
};

type CreateImageTaskRequest = {
  SubAppId: number;
  ModelName: string;
  ModelVersion: string;
  Prompt: string;
  FileInfos?: FileInfo[];
  OutputConfig?: ImageOutputConfig;
  SceneType?: string;
  ExtInfo?: string;
  EnhancePrompt?: "Enabled" | "Disabled";
  NegativePrompt?: string;
  SessionId?: string;
  SessionContext?: string;
};

type CreateImageTaskResponse = {
  Response: {
    TaskId: string;
    RequestId: string;
  };
};

type TaskDetail = {
  Response: {
    TaskId: string;
    Status: string;
    TaskType: string;
    CreateTime: string;
    BeginProcessTime: string;
    FinishTime: string;
    AigcImageTask?: {
      Status: string;
      ErrCode: number;
      Message: string;
      Progress: number;
      Input: Record<string, unknown>;
      Output?: {
        FileInfos: Array<{
          FileId: string;
          FileUrl: string;
          FileType: string;
          StorageMode: string;
          ExpireTime: string;
          MetaData?: {
            Width: number;
            Height: number;
            Size: number;
            Container: string;
          };
        }>;
      };
    };
    RequestId: string;
  };
};

function getConfig(): VodAigcConfig {
  const secretId = process.env.TENCENT_VOD_SID;
  const secretKey = process.env.TENCENT_VOD_SKEY;
  const subAppId = parseInt(process.env.TENCENT_VOD_SUB_APP_ID || "0", 10);

  if (!secretId || !secretKey) {
    throw new Error("Missing TENCENT_VOD_SID or TENCENT_VOD_SKEY environment variables");
  }
  if (!subAppId) {
    throw new Error("Missing TENCENT_VOD_SUB_APP_ID environment variable");
  }

  return { secretId, secretKey, subAppId };
}

function sha256(message: string): string {
  return crypto.createHash("sha256").update(message, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, message: string): Buffer {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest();
}

function getSignature(
  secretId: string,
  secretKey: string,
  timestamp: number,
  payload: string,
  action: string,
): { authorization: string; timestamp: number } {
  const date = new Date(timestamp * 1000);
  const dateStr = date.toISOString().split("T")[0];

  // Step 1: Build canonical request
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";
  const canonicalHeaders = `content-type:application/json\nhost:vod.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedRequestPayload = sha256(payload);
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

  // Step 2: Build string to sign
  const credentialScope = `${dateStr}/${SERVICE}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest);
  const stringToSign = `${ALGORITHM}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // Step 3: Calculate signature
  const secretDate = hmacSha256(`TC3${secretKey}`, dateStr);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");

  // Step 4: Build authorization
  const authorization = `${ALGORITHM} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, timestamp };
}

async function callVodApi<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const config = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = JSON.stringify(payload);

  const { authorization } = getSignature(config.secretId, config.secretKey, timestamp, payloadStr, action);

  const response = await axios.post<T>(VOD_AIGC_ENDPOINT, payloadStr, {
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      "X-TC-Action": action,
      "X-TC-Version": VERSION,
      "X-TC-Timestamp": timestamp.toString(),
      "X-TC-Region": "ap-guangzhou",
    },
    timeout: 30000,
  });

  return response.data;
}

export type VodImageGenerationInput = {
  prompt: string;
  model?: string;
  modelVersion?: string;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  count?: number;
  imageUrl?: string;
  imageUrls?: string[];
  maskDataUrl?: string;
  enhancePrompt?: boolean;
  negativePrompt?: string;
  storageMode?: "Temporary" | "Permanent";
  outputFormat?: "png" | "jpeg";
};

export type VodImageGenerationResult = {
  images: Array<{ src: string; width: number; height: number }>;
  taskId: string;
  model: string;
};

/**
 * Kling 扩图（外延生成）输入。
 *
 * 四个方向的比例都是**相对原图边长的倍数**，不是像素、也不是目标画布占比：
 *   up/down 基于原图高度，left/right 基于原图宽度。
 *   例：原图高 480，up=0.2 → 顶部向外扩 480 × 0.2 = 96 像素。
 */
export type VodImageExpandInput = {
  imageUrl: string;
  prompt?: string;
  up?: number;
  down?: number;
  left?: number;
  right?: number;
  resolution?: "1K" | "2K" | "4K";
  storageMode?: "Temporary" | "Permanent";
  seed?: number;
};

/** 扩图比例上限。腾讯侧约束：单边 [0,2]，且新图总面积 ≤ 原图 3 倍。 */
export const VOD_EXPAND_RATIO_MAX = 2;
export const VOD_EXPAND_AREA_MULTIPLIER_MAX = 3;

function clampExpansionRatio(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(VOD_EXPAND_RATIO_MAX, value);
}

/**
 * 把四向比例收敛到腾讯的面积约束内。
 *
 * 面积倍数 = (1 + left + right) × (1 + up + down)，超过 3 倍会被上游拒绝。
 * 这里按**等比缩小四个方向**的方式回退，而不是直接报错——扩图是用户点一下就触发的
 * 交互，报错体验差；等比缩小能保持用户期望的扩展方向与相对比例。
 *
 * 导出供测试直接验证，避免只能通过打真实接口才能覆盖这段逻辑。
 */
export function __testClampExpansionToAreaLimit(input: {
  up?: number;
  down?: number;
  left?: number;
  right?: number;
}): { up: number; down: number; left: number; right: number } {
  let up = clampExpansionRatio(input.up);
  let down = clampExpansionRatio(input.down);
  let left = clampExpansionRatio(input.left);
  let right = clampExpansionRatio(input.right);

  const area = (1 + left + right) * (1 + up + down);
  if (area <= VOD_EXPAND_AREA_MULTIPLIER_MAX) {
    return { up, down, left, right };
  }

  // 二分找一个统一缩放因子 k，使面积刚好落在上限内。
  // 直接解析求解要处理二次方程的边界情况，二分 40 次精度已远超需要且不会写错。
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const a = (1 + (left + right) * mid) * (1 + (up + down) * mid);
    if (a > VOD_EXPAND_AREA_MULTIPLIER_MAX) hi = mid;
    else lo = mid;
  }
  return { up: up * lo, down: down * lo, left: left * lo, right: right * lo };
}

/**
 * 创建 Kling 扩图任务。
 *
 * ⚠️ 两个实测结论，文档里没有明说，改动前务必先看：
 * 1. `SceneType: "image_expand"` 时 `ModelVersion` **必须是 "scene"**。
 *    传 "3.0" 会被拒：`ModelVersion must be scene when SceneType is image_expand`。
 * 2. 扩图比例走 `ExtInfo`，且是**双层 JSON 字符串**：
 *    ExtInfo = JSON.stringify({ AdditionalParameters: JSON.stringify({...}) })
 *    少一层会被当成普通字段忽略，扩图静默退化成原样重绘。
 *
 * 输出尺寸实测：宽高比严格等于扩图比例算出的比例（原图 640x480 右扩 0.5 →
 * 输出 1664x832，比值 2.0000 与预期完全一致），只是整体缩放到目标分辨率档位。
 * 因此调用方按目标宽高等比缩放即可，不会变形。
 */
export async function createVodImageExpandTask(input: VodImageExpandInput): Promise<{ taskId: string }> {
  const config = getConfig();
  const ratios = __testClampExpansionToAreaLimit(input);

  if (ratios.up === 0 && ratios.down === 0 && ratios.left === 0 && ratios.right === 0) {
    throw new Error("扩图需要至少一个方向的扩展比例大于 0");
  }

  const toFileInfo = (url: string): FileInfo => {
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",");
      return { Type: "Base64", Base64: commaIndex >= 0 ? url.slice(commaIndex + 1) : url };
    }
    return { Type: "Url", Url: url };
  };

  const payload: CreateImageTaskRequest = {
    SubAppId: config.subAppId,
    ModelName: "Kling",
    ModelVersion: "scene",
    SceneType: "image_expand",
    Prompt: input.prompt || "",
    FileInfos: [toFileInfo(input.imageUrl)],
    ExtInfo: JSON.stringify({
      AdditionalParameters: JSON.stringify({
        up_expansion_ratio: ratios.up,
        down_expansion_ratio: ratios.down,
        left_expansion_ratio: ratios.left,
        right_expansion_ratio: ratios.right,
      }),
    }),
    OutputConfig: {
      StorageMode: input.storageMode || "Temporary",
      Resolution: input.resolution || "1K",
    },
  };

  console.log("[vod-aigc] create expand task", JSON.stringify({
    ratios,
    resolution: payload.OutputConfig?.Resolution,
    promptLength: (input.prompt || "").length,
  }));

  const result = await callVodApi<CreateImageTaskResponse>(
    "CreateAigcImageTask",
    payload as unknown as Record<string, unknown>,
  );

  if (!result.Response?.TaskId) {
    throw new Error(`Failed to create VOD Kling expand task: ${JSON.stringify(result)}`);
  }

  return { taskId: result.Response.TaskId };
}

const MODEL_VERSION_MAP: Record<string, string> = {
  gem: "3.1",
  "gem-lite": "3.1-lite",
  "gem-3.1-lite": "3.1-lite",
  og: "image2_medium",
  "og-image2-low": "image2_low",
  "og-image2-medium": "image2_medium",
  "og-image2-high": "image2_high",
  /**
   * OG image2.5 —— 站点新的默认出图模型（2026-09-11 接入）。
   *
   * 版本串必须带系列名（sunburst / flare），这是实测结论：
   * `image2.5_medium` / `image2_5_medium` / `2.5_medium` 全部被腾讯拒为
   * `InvalidParameterValue: ModelVersion ... is invalid for ModelName OG`，
   * 只有 `image2.5_{sunburst|flare}_{low|medium|high}` 这 6 个能建任务。
   * 两系价格完全相同（medium @1K = 0.078 元，比 image2_medium 的 0.398 便宜 5.1 倍）。
   *
   * 站点 id 用 `og25-` 而不是 `og-image2.5-`：id 里带小数点会在
   * 正则、CSS 选择器、URL 片段里反复要转义，得不偿失。
   */
  "og25-sunburst-low": "image2.5_sunburst_low",
  "og25-sunburst-medium": "image2.5_sunburst_medium",
  "og25-sunburst-high": "image2.5_sunburst_high",
  "og25-flare-low": "image2.5_flare_low",
  "og25-flare-medium": "image2.5_flare_medium",
  "og25-flare-high": "image2.5_flare_high",
  mj: "v8.2",
  "mj-v7": "v7",
  "mj-niji": "niji_7",
  kling: "3.0-Omni",
  "kling-3.0": "3.0",
  // 混元（Hunyuan）已于 2026-09-11 按用户要求整体下线：
  // 注册表里的 vod-hunyuan、isVodModelId 裸名单、normalizeImageModelId 别名均已移除，
  // 这里的版本映射同步删掉，避免留下「看起来还支持」的误导。
  si: "5.0-pro",
  "si-5.0-lite": "5.0-lite",
  qwen: "0925",
  jimeng: "4.0",
};

function resolveModelAndVersion(model?: string, version?: string): { modelName: string; modelVersion: string } {
  // 项目内部模型 id 带 "vod-" 前缀（如 vod-og / vod-gem），而 VOD 接口只认去掉前缀后的
  // 模型族名（og / gem / mj ...）。前缀不剥离会导致所有 vod-* 都匹配不上、
  // 全部落到 resolveModelName 的默认分支返回 GEM，模型选择形同虚设。
  const modelKey = (model || "gem").toLowerCase().replace(/^vod-/, "");

  if (version) {
    return { modelName: resolveModelName(modelKey), modelVersion: version };
  }

  const mapped = MODEL_VERSION_MAP[modelKey];
  if (mapped) {
    const parts = mapped.split("|");
    return { modelName: resolveModelName(modelKey), modelVersion: parts[0] };
  }

  return { modelName: resolveModelName(modelKey), modelVersion: "3.1" };
}

function resolveModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith("gem")) return "GEM";
  if (lower.startsWith("og")) return "OG";
  if (lower.startsWith("mj")) return "MJ";
  if (lower.startsWith("kling")) return "Kling";
  // hunyuan 分支已随混元下线一并移除（2026-09-11）。
  if (lower.startsWith("si")) return "SI";
  if (lower.startsWith("qwen")) return "Qwen";
  if (lower.startsWith("jimeng")) return "Jimeng";
  if (lower.startsWith("vidu")) return "Vidu";
  return "GEM";
}

function resolveAspectRatio(ratio?: string): string {
  if (!ratio) return "1:1";
  const normalized = ratio.replace("x", ":");
  const validRatios = ["1:1", "16:9", "9:16", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "21:9", "9:21"];
  if (validRatios.includes(normalized)) return normalized;
  return "1:1";
}

export async function createVodImageTask(input: VodImageGenerationInput): Promise<{ taskId: string }> {
  const config = getConfig();
  const { modelName, modelVersion } = resolveModelAndVersion(input.model, input.modelVersion);
  console.log("[vod-aigc] create task", JSON.stringify({
    requestedModel: input.model,
    modelName,
    modelVersion,
    referenceCount: input.imageUrls?.length ?? (input.imageUrl ? 1 : 0),
    hasMask: Boolean(input.maskDataUrl),
    enhancePrompt: input.enhancePrompt ? "Enabled" : "Disabled",
  }));

  const toFileInfo = (url: string, usage?: "Reference"): FileInfo => {
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",");
      const base64 = commaIndex >= 0 ? url.slice(commaIndex + 1) : url;
      return { Type: "Base64", Base64: base64, ...(usage ? { Usage: usage } : {}) };
    }
    return { Type: "Url", Url: url, ...(usage ? { Usage: usage } : {}) };
  };

  const fileInfos: FileInfo[] | undefined = (() => {
    if (!input.imageUrl && !input.imageUrls?.length) return undefined;
    const list: FileInfo[] = input.imageUrl
      ? [toFileInfo(input.imageUrl)]
      : (input.imageUrls || []).map((url) => toFileInfo(url));
    // OG（GPT-Image2）系列支持蒙版编辑：白色区域=待替换/编辑区域。
    // 参考 https://cloud.tencent.com/document/product/266/126240
    // 注意：mask 参考图不能带 Usage 字段，只需 ReferenceType:"mask"。
    if (input.maskDataUrl) {
      list.push({ ...toFileInfo(input.maskDataUrl), ReferenceType: "mask" });
    }
    return list;
  })();

  const payload: CreateImageTaskRequest = {
    SubAppId: config.subAppId,
    ModelName: modelName,
    ModelVersion: modelVersion,
    Prompt: input.prompt,
    FileInfos: fileInfos,
    OutputConfig: {
      StorageMode: input.storageMode || "Temporary",
      Resolution: input.resolution || "1K",
      AspectRatio: resolveAspectRatio(input.aspectRatio),
      OutputImageCount: input.count || 1,
      OutputFormat: input.outputFormat,
    },
    EnhancePrompt: input.enhancePrompt ? "Enabled" : "Disabled",
  };

  if (input.negativePrompt) {
    payload.NegativePrompt = input.negativePrompt;
  }

  const result = await callVodApi<CreateImageTaskResponse>("CreateAigcImageTask", payload as unknown as Record<string, unknown>);

  if (!result.Response?.TaskId) {
    throw new Error(`Failed to create VOD AIGC image task: ${JSON.stringify(result)}`);
  }

  return { taskId: result.Response.TaskId };
}

export async function getVodTaskDetail(taskId: string): Promise<TaskDetail> {
  const config = getConfig();

  const payload = {
    TaskId: taskId,
    SubAppId: config.subAppId,
  };

  return callVodApi<TaskDetail>("DescribeTaskDetail", payload);
}

export type VodPollResult = {
  status: "pending" | "processing" | "success" | "failed";
  progress?: number;
  images?: Array<{ src: string; width: number; height: number }>;
  error?: string;
};

export async function pollVodTask(taskId: string, maxAttempts = 120, intervalMs = 3000): Promise<VodPollResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const detail = await getVodTaskDetail(taskId);
      const task = detail.Response;

      if (task.Status === "FINISH") {
        const imageTask = task.AigcImageTask;
        if (imageTask?.Status === "FINISH" && imageTask.Output?.FileInfos) {
          const images = imageTask.Output.FileInfos.map((file) => ({
            src: file.FileUrl || `https://vod.qcloud.com/${file.FileId}`,
            width: file.MetaData?.Width || 1024,
            height: file.MetaData?.Height || 1024,
          }));
          return { status: "success", progress: 100, images };
        }

        if (imageTask?.ErrCode && imageTask.ErrCode !== 0) {
          return { status: "failed", error: imageTask.Message || `Error code: ${imageTask.ErrCode}` };
        }
      }

      if (task.Status === "FAIL") {
        const imageTask = task.AigcImageTask;
        return { status: "failed", error: imageTask?.Message || "Task failed" };
      }
    } catch (error) {
      console.warn("[tencent-vod-aigc] Poll error:", error);
      if (attempt === maxAttempts - 1) {
        return { status: "failed", error: String(error) };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: "failed", error: "Polling timeout" };
}

export async function generateImageWithVod(input: VodImageGenerationInput): Promise<VodImageGenerationResult> {
  const { taskId } = await createVodImageTask(input);

  const result = await pollVodTask(taskId);

  if (result.status === "failed") {
    throw new Error(`VOD AIGC image generation failed: ${result.error}`);
  }

  if (result.status !== "success" || !result.images?.length) {
    throw new Error("VOD AIGC image generation did not return valid images");
  }

  return {
    images: result.images,
    taskId,
    model: input.model || "gem",
  };
}

export function isVodAigcConfigured(): boolean {
  return !!(process.env.TENCENT_VOD_SID && process.env.TENCENT_VOD_SKEY && process.env.TENCENT_VOD_SUB_APP_ID);
}
