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

const MODEL_VERSION_MAP: Record<string, string> = {
  gem: "3.1",
  "gem-3.1-lite": "3.1-lite",
  og: "image2_medium",
  "og-image2-low": "image2_low",
  "og-image2-medium": "image2_medium",
  "og-image2-high": "image2_high",
  mj: "v8.2",
  "mj-v7": "v7",
  "mj-niji": "niji_7",
  kling: "3.0-Omni",
  "kling-3.0": "3.0",
  hunyuan: "3.0",
  si: "5.0-pro",
  "si-5.0-lite": "5.0-lite",
  qwen: "0925",
  jimeng: "4.0",
};

function resolveModelAndVersion(model?: string, version?: string): { modelName: string; modelVersion: string } {
  const modelKey = (model || "gem").toLowerCase();

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
  if (lower.startsWith("hunyuan")) return "Hunyuan";
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
