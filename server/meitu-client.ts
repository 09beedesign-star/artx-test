// Meitu AI 开放平台「局部重绘」(image inpainting) 客户端（doc/331，唯一通道 = 新 AIGCP 网关 formula）：
//   - 任务提交: POST https://openapi.meitu.com/api/v1/sdk/sync/push
//     body: params={"parameter":{rsp_media_type,prompt_pos,seed,return_format_type}} + init_images[原图, mask图] + task=/v1/InPainting/468520 + task_type=formula
//   - 任务查询: GET  https://openapi.meitu.com/api/v1/sdk/status?task_id=xxx（doc/222）
//   - 签名: V4 MT4-HMAC-SHA256（参考 https://ai.meitu.com/doc/?id=218）
//   - task 固定 /v1/InPainting/468520（doc/331 调用信息），无需商务下发
// 注意：doc/331 只有上述 formula 一条通道，没有旧 mtlab v3 通道（v3 已移除）。
//
// 密钥仅在后端使用：ACCESS_KEY / SECRET_KEY（.env）。

import crypto from "node:crypto";

export type MeituInpaintResultImage = {
  src: string;
  width: number;
  height: number;
};

export type MeituInpaintOptions = {
  imageBuffer: Buffer;
  /** 已转换为美图 mask 格式的蒙版（白=重绘区，黑=保留区），尺寸与 imageBuffer 一致 */
  maskBuffer: Buffer;
  width: number;
  height: number;
  promptPos?: string;
  seed?: number;
  numSamples?: number;
  timeoutMs?: number;
};

export type MeituInpaintResult = {
  images: MeituInpaintResultImage[];
};

// doc/331「局部重绘(AI开放平台)」官方文档给出的固定配方 ID（task）。
// 该接口只有新 AIGCP 网关 formula 一条通道（v1 /sdk/sync/push），没有旧 mtlab v3 通道。
const MEITU_DEFAULT_INPAINT_TASK = "/v1/InPainting/468520";

export function getMeituConfig() {
  const clampPx = (value: number | undefined, fallback: number) => {
    const parsed = Number.isFinite(value) ? Number(value) : fallback;
    return Math.max(0, Math.min(Math.round(parsed), 30));
  };
  return {
    apiKey: process.env.ACCESS_KEY || "",
    apiSecret: process.env.SECRET_KEY || "",
    formulaBaseUrl: (process.env.MEITU_FORMULA_BASE_URL || "https://openapi.meitu.com").replace(/\/+$/, ""),
    /** doc/331 固定 task=/v1/InPainting/468520；env 可覆盖（一般无需改） */
    inpaintTask: (process.env.MEITU_INPAINT_TASK || MEITU_DEFAULT_INPAINT_TASK).trim(),
    timeoutMs: Number(process.env.MEITU_INPAINT_TIMEOUT_MS || 120000),
    /** 蒙版白色（重绘）区域向外扩展像素数（建议 5-10，防止紧贴物体轮廓导致生成补丁感） */
    maskExpandPx: clampPx(Number(process.env.MEITU_MASK_EXPAND_PX), 6),
    /** 蒙版边缘羽化像素数（建议 4-8，硬边界会留下明显接缝） */
    maskFeatherPx: clampPx(Number(process.env.MEITU_MASK_FEATHER_PX), 6),
  };
}

/**
 * 二维 box-max（形态学膨胀）—— 两个一维滑动窗口最大值 pass（水平 + 垂直），O(width*height)。
 * 输入为单通道行优先数组，输出为每个像素在 radius 方形邻域内的最大值：
 * 白色(255)像素会把周边 radius 像素内的邻居"染白"，即白色区域向外扩展 radius 像素。
 */
function boxDilateBinary(
  singleChannel: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return singleChannel;
  const horizontal = new Uint8Array(singleChannel.length);
  // 水平 pass：窗口 [x-radius, x+radius] 的最大值
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
  // 垂直 pass：同样逻辑作用在列上
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
 * 将前端注释蒙版转换为美图局部重绘要求的 mask：
 * - 透明像素（= 注释编辑区）→ 白色（重绘区）
 * - 不透明像素（= 保留区）→ 黑色
 * - 白色区域向外扩展 maskExpandPx 像素（避免紧贴物体轮廓，防止补丁感）
 * - 边缘做 maskFeatherPx 像素羽化（避免硬边界生成后出现明显接缝）
 * 强制缩放至与目标图同尺寸，输出 JPEG（与官方示例 media_data_type="jpg" 一致）。
 */
export async function buildMeituMask(
  maskBuffer: Buffer,
  width: number,
  height: number,
  /** "hat" 模式：仅保留 mask 上方约 30% 区域作为重绘区，其余设为保留区（防止扩散模型重写面部） */
  mode?: "full" | "hat",
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const providerMask = Buffer.alloc(width * height * 4);
  let minY = height;
  let maxY = 0;

  // 第一轮：计算白像素的 Y 范围（编辑区）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const editRegion = data[index + 3] < 250;
      if (editRegion) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // hat 模式：保留编辑区上方约 55% 区域作为重绘区（给 AI 足够空间生成帽子/头饰），
  // 下方设为保留（黑）避免重写面部。之前 30% 过小导致 AI 难以生成明显变化。
  const isHatMode = mode === "hat" && minY < maxY;
  const hatCutoffY = isHatMode ? minY + Math.floor((maxY - minY) * 0.55) : height;

  let whitePixelCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const editRegion = data[index + 3] < 250;
      const keepWhite = editRegion && y <= hatCutoffY;
      const value = keepWhite ? 255 : 0;
      if (keepWhite) whitePixelCount += 1;
      providerMask[index] = value;
      providerMask[index + 1] = value;
      providerMask[index + 2] = value;
      providerMask[index + 3] = 255;
    }
  }

  // 白色（重绘）区域向外扩展：避免紧贴物体轮廓导致补丁感/错位
  const maskConfig = getMeituConfig();
  const expandPx = maskConfig.maskExpandPx;
  const maskRgba = expandPx > 0
    ? (() => {
        const single = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) single[i] = providerMask[i * 4];
        const dilated = boxDilateBinary(single, width, height, expandPx);
        const expanded = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          const value = dilated[i];
          expanded[i * 4] = value;
          expanded[i * 4 + 1] = value;
          expanded[i * 4 + 2] = value;
          expanded[i * 4 + 3] = 255;
        }
        return expanded;
      })()
    : providerMask;

  console.log(
    `[MEITU] buildMeituMask 输出: ${width}x${height}, 模式=${mode || "full"}, ` +
    `重绘区(白)占比=${((whitePixelCount / Math.max(1, width * height)) * 100).toFixed(2)}%, ` +
    `hat裁剪线Y=${isHatMode ? hatCutoffY : "无"}(minY=${minY}, maxY=${maxY}), ` +
    `扩展=${expandPx}px, 羽化=${maskConfig.maskFeatherPx}px`,
  );

  // 边缘羽化：Gaussian blur 让硬边界变软（避免生成后一圈接缝），再编码 JPEG
  const featherPx = maskConfig.maskFeatherPx;
  return sharp(maskRgba, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })
    .blur(featherPx > 0 ? Math.max(0.5, featherPx / 2) : 0)
    .jpeg({ quality: 100 })
    .toBuffer();
}

/**
 * 对**已转换**的美图 mask（白=重绘区，黑=保留区）做尺寸归一 + JPEG 编码（doc/312: media_data_type="jpg"）。
 *
 * 注意：这里**不再做 alpha→白/黑 语义转换**——该转换只应由 `buildMeituMask` 完成一次。
 * 调用方传入的 mask 必须是已转换格式（见 `MeituInpaintOptions.maskBuffer`），否则会把整张 mask 误判为保留区（全黑）导致无重绘区域。
 */
async function encodeMeituMask(maskBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/** 日志打码：只显示密钥前 4 位 + 后 4 位，避免密钥泄露到日志 */
function maskSecret(value: string | undefined): string {
  if (!value) return "(未配置)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

const MEITU_ERROR_MESSAGES: Record<number, string> = {
  // 局部重绘专项业务码（doc/312）
  20001: "美图处理错误（PROCESS_ERROR）",
  20003: "美图检测不到人脸（DETECT_NOT_FACE）",
  20004: "美图检测到多于一张人脸（MORE_THAN_ONE_FACE）",
  20007: "美图未收到人脸点位（MISSING_LANDMARK_ARGUMENTS）",
  20008: "照片不符合规范（UNSUITABLE_IMAGE）",
  20009: "不支持的 type（UNSUPPORT_TYPE）",
  20010: "美图检测不到第二张图片的人脸（DETECT_NOT_FACE）",
  20011: "美图垂直高度不满足（UNSUITABLE_VERTICAL_IMAGE）",
  20012: "美图水平宽度不满足（UNSUITABLE_HORIZONTAL_IMAGE）",
  20013: "分辨率过大（RESOLUTION_TOO_LARGE_ERROR）",
  20014: "查找不到图片（NOT_FOUND）",
  20015: "图片超限（PICTURE_OVERRUN_ERROR）",
  20020: "美图五官缺失（DETECT_FACE_OUTOFIMAGE）",
  20021: "美图非正脸/俯仰角过大（DETECT_FACE_PITCHANGLE_BIG）",
  20022: "美图非正脸/旋转角过大（DETECT_FACE_YAWANGLE_BIG）",
  20023: "美图脸部占比小像素低（DETECT_FACE_LOWAREA）",
  21001: "美图加载模型失败（LOAD_MODEL_ERROR）",
  21002: "美图头发 mask 缺失（HAIR_MASK_LOSS）",
  21003: "美图人脸个数错误（FACE_NUM_ERROR）",
  21004: "美图 ar 中 plist 解析错误（AR_PARSE_FAULT）",
  21005: "美图 ar 人脸错误（AR_EEEOR_COUNT）",
  21006: "美图 ar 超过人脸范围（AR_FACE_OUT）",
  21007: "JSON 内容错误（JSON_ERROR）",
  21008: "背景图片缺失（BACKGROUND_IMAGE_LOSS）",
  21009: "美图 bodymask 缺失（BODY_MASK_LOSS）",
  21010: "美图人脸角度错误（FACE_ANGLE_ERROR）",
  21011: "美图 skinmask 缺失（SKIN_MASK_LOSS）",
  21012: "美图骨骼点或外轮廓点缺失（BODY_INFO_LOSS）",
  21013: "美图超出图片范围（RECT_OUT_IMAGE）",
  30001: "美图生成错误（GEN_ERROR）",
  // 网关/权益类
  401: "美图鉴权失败（401），请检查 ACCESS_KEY / SECRET_KEY",
  403: "美图鉴权失败（403，应用可能已过期），请检查账号权益状态",
  404: "美图接口地址错误（404），请检查配方 ID 与网关地址",
  424: "美图下载图片失败（424），请检查图片 URL 可访问性",
  433: "美图请求实体过长（433），请压缩图片后重试",
  500: "美图内部错误（500），请稍后重试",
  502: "美图网关无响应（502），请稍后重试",
  503: "美图并发过高（503，试用期 QPS 限制），请稍后重试",
  504: "美图请求超时（504），请稍后重试",
  599: "美图请求超时（599），请稍后重试",
  80001: "美图账号未开通「局部重绘」接口权限（权益包未生效），请到美图开放平台申请/开通后重试",
  90002: "美图网关鉴权失败（GATEWAY_AUTHORIZED_ERROR），请检查 ACCESS_KEY / SECRET_KEY 是否正确",
};

export function mapMeituError(errorCode: number | string | undefined, message?: string): string {
  const code = Number(errorCode);
  const known = MEITU_ERROR_MESSAGES[code];
  if (known) return known;
  const detail = message?.trim() ? `（${message}）` : "";
  return `美图局部重绘失败（error_code=${errorCode}）${detail}`;
}

function readMeituError(body: Record<string, unknown>): { code: number | string; message: string } | null {
  const code = body.error_code ?? body.ErrorCode ?? body.code;
  const message = body.message ?? body.ErrorMsg ?? body.error_msg;
  if (code !== undefined && code !== null && Number(code) !== 0) {
    return { code: String(code), message: typeof message === "string" ? message : "" };
  }
  return null;
}

async function parseJsonResponse(response: Response, timeoutMs: number): Promise<Record<string, unknown>> {
  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`美图接口返回非 JSON 响应（HTTP ${response.status}）: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error = readMeituError(json);
    throw new Error(error ? mapMeituError(error.code, error.message) : `美图接口请求失败（HTTP ${response.status}）`);
  }
  return json;
}

// ─────────────────────────────────────────────
// 通道 A：新 AIGCP 网关 formula 任务式（AK/SK 签名）
// ─────────────────────────────────────────────

// 美图 AIGCP 网关签名 = doc/218「AIGCP-API接口签名算法接入详解」+ 官方 JS SDK（sign.js）：
//   1. 算法名 SDK-HMAC-SHA256（不是 V4 MT4-HMAC-SHA256）
//   2. 签名 = HMAC-SHA256(SK, stringToSign)，无派生密钥链、无 credentialScope
//   3. X-Sdk-Date 格式 YYYYMMDDTHHMMSSZ（UTC，无毫秒）
//   4. Authorization = `Bearer ${base64("SDK-HMAC-SHA256 Access=AK, SignedHeaders=..., Signature=...")}`
//   5. canonicalURI 必须补尾斜杠 "/"
//   6. signedHeaders = 所有请求头名称（Content-Type/Host/X-Sdk-Date...）转小写后升序
//   7. canonicalHeaders 用 "\n" 连接（每项 "name:value"，无额外尾换行）
//   8. body 参与签名（除非显式传 X-Sdk-Content-Sha256: UNSIGNED-PAYLOAD）
const MEITU_SIGN_ALGORITHM = "SDK-HMAC-SHA256";
const MEITU_HEADER_X_DATE = "X-Sdk-Date";
const MEITU_HEADER_HOST = "Host";
const MEITU_HEADER_AUTHORIZATION = "Authorization";
const MEITU_HEADER_CONTENT_SHA256 = "X-Sdk-Content-Sha256";

function sha256Hex(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** YYYYMMDDTHHMMSSZ（UTC，无毫秒）——与官方 SDK BasicDateFormat 一致 */
function formatMeituSdkDate(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** 官方 SDK canonicalURI：path 必须以 "/" 结尾 */
function canonicalMeituUri(path: string): string {
  if (path.length === 0 || !path.endsWith("/")) return `${path}/`;
  return path;
}

function signedMeituHeaders(headers: Record<string, string>): string[] {
  return Object.keys(headers).map((header) => header.toLowerCase()).sort();
}

function canonicalMeituHeaders(headers: Record<string, string>, signedHeaders: string[]): string {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    lowered[key.toLowerCase()] = String(value).trim();
  }
  return signedHeaders.map((key) => `${key}:${lowered[key]}`).join("\n");
}

/**
 * 按官方 sign.js SDK 算法为请求附加签名头。
 *
 * CanonicalRequest = METHOD\ncanonicalURI\ncanonicalQuery\ncanonicalHeaders\nsignedHeaders\npayloadHash
 * StringToSign     = SDK-HMAC-SHA256\nxSdkDate\nSHA256(canonicalRequest)
 * signature        = HMAC-SHA256(SK, stringToSign)
 * Authorization    = Bearer base64("SDK-HMAC-SHA256 Access=AK, SignedHeaders=..., Signature=...")
 *
 * 返回完整请求头（含 Host / X-Sdk-Date / X-Sdk-Content-Sha256 / Authorization）。
 */
export function buildSignedHeaders(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Buffer | string,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const parsed = new URL(url);
  const host = parsed.host;
  const headersWithDate: Record<string, string> = {
    ...headers,
    [MEITU_HEADER_HOST]: host,
  };
  if (!headersWithDate[MEITU_HEADER_X_DATE]) {
    headersWithDate[MEITU_HEADER_X_DATE] = formatMeituSdkDate(new Date());
  }

  const bodyStr = typeof body === "string" ? body : body.toString("utf8");
  const payloadHash =
    headersWithDate[MEITU_HEADER_CONTENT_SHA256] && headersWithDate[MEITU_HEADER_CONTENT_SHA256] !== ""
      ? headersWithDate[MEITU_HEADER_CONTENT_SHA256]
      : sha256Hex(bodyStr || "");

  const canonicalURI = canonicalMeituUri(parsed.pathname);
  parsed.searchParams.sort();
  const canonicalQuery = parsed.searchParams.toString();
  const signedHeaders = signedMeituHeaders(headersWithDate);
  const canonicalHeaders = canonicalMeituHeaders(headersWithDate, signedHeaders);
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalURI,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const stringToSign = [
    MEITU_SIGN_ALGORITHM,
    headersWithDate[MEITU_HEADER_X_DATE],
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = crypto.createHmac("sha256", secretKey).update(stringToSign).digest("hex");

  const headerValue =
    `${MEITU_SIGN_ALGORITHM} Access=${accessKey}, ` +
    `SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
  const authorization = `Bearer ${Buffer.from(headerValue).toString("base64")}`;

  return {
    ...headersWithDate,
    [MEITU_HEADER_CONTENT_SHA256]: payloadHash,
    [MEITU_HEADER_AUTHORIZATION]: authorization,
  };
}

/**
 * 按 doc/331「局部重绘(AI开放平台)」契约组装 formula 请求体：
 * - params 必须是 `{"parameter":{...}}` 的 JSON 字符串（parameter 内仅含
 *   rsp_media_type / prompt_pos / seed / return_format_type，文档未定义其它字段）
 * - init_images 传两张：第一张原图、第二张 mask 图；元素结构为 { url, profile }（profile 单数，
 *   内嵌 media_profiles.media_data_type="jpg" 表示 base64 传输 + version="v1"）
 * - task 固定 /v1/InPainting/468520（doc/331 调用信息），task_type=formula
 */
/**
 * 美图 formula 通道基础提示词：严格约束模型只做局部添加，禁止重绘/替换现有内容。
 * 用户请求会追加在末尾，确保模型优先遵守负面约束。
 */
const MEITU_BASE_PROMPT_POS = [
  "STRICT local edit: use the uploaded source image as the ONLY canvas. Edit ONLY inside the mask.",
  "ABSOLUTE RULE 1: You must NOT redraw, regenerate, replace, or modify ANY existing person, face, body, clothing, background, or object inside the mask. The existing content inside the mask must remain 100% identical.",
  "ABSOLUTE RULE 2: Your ONLY job is to ADD the user-requested item ON TOP OF the existing content. Place it naturally on the existing content without altering anything underneath.",
  "EXAMPLES: If the user asks for a hat, put the hat ON the existing person's head. Do NOT redraw the person. If the user asks for glasses, put the glasses ON the existing person's face. Do NOT redraw the face. If the user asks for a prop, add it beside or on the existing subject without changing the subject.",
  "The existing person inside the mask must keep the EXACT same face, body, clothing, pose, lighting, and all details. Only the requested new item may appear.",
  "User request:",
].join(" ");

function buildFormulaInpaintBody(
  imageBase64: string,
  maskBase64: string,
  options: Pick<MeituInpaintOptions, "promptPos" | "seed">,
  task: string,
) {
  const parameter: Record<string, unknown> = {
    rsp_media_type: "url",
    return_format_type: "png",
  };
  const userPrompt = options.promptPos?.trim();
  if (userPrompt) {
    // 基础约束在前，用户请求在后，确保模型优先读取负面约束
    parameter.prompt_pos = `${MEITU_BASE_PROMPT_POS} ${userPrompt}`;
  }
  if (options.seed !== undefined && Number.isFinite(options.seed)) parameter.seed = Math.trunc(options.seed);

  return {
    params: JSON.stringify({ parameter }),
    init_images: [
      {
        url: imageBase64,
        profile: { media_profiles: { media_data_type: "jpg" }, version: "v1" },
      },
      {
        url: maskBase64,
        profile: { media_profiles: { media_data_type: "jpg" }, version: "v1" },
      },
    ],
    task,
    task_type: "formula",
    sync_timeout: 30,
  };
}

type FormulaTaskResponse = {
  code: number;
  message: string;
  data?: {
    status: number;
    result?: {
      id?: string;
      urls?: string[];
    };
    progress?: number;
  };
};

function parseFormulaTaskResponse(json: Record<string, unknown>): FormulaTaskResponse {
  const code = Number(json.code ?? 0);
  const data = json.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : undefined;
  const result =
    data?.result && typeof data.result === "object" ? (data.result as Record<string, unknown>) : undefined;
  return {
    code,
    message: typeof json.message === "string" ? json.message : "",
    data: data
      ? {
          status: Number(data.status ?? 0),
          result: result
            ? {
                id: typeof result.id === "string" ? result.id : undefined,
                urls: Array.isArray(result.urls)
                  ? result.urls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  : undefined,
              }
            : undefined,
          progress: typeof data.progress === "number" ? data.progress : undefined,
        }
      : undefined,
  };
}

async function formulaRequest(
  method: string,
  url: string,
  body: string,
  config: ReturnType<typeof getMeituConfig>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const signedHeaders = buildSignedHeaders(
    method,
    url,
    { "Content-Type": "application/json" },
    body,
    config.apiKey,
    config.apiSecret,
  );
  const response = await fetch(url, {
    method,
    headers: signedHeaders,
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return parseJsonResponse(response, timeoutMs);
}

async function runMeituFormulaInpaint(
  options: MeituInpaintOptions,
  config: ReturnType<typeof getMeituConfig>,
): Promise<MeituInpaintResult> {
  const sharp = (await import("sharp")).default;
  const sourceJpeg = await sharp(options.imageBuffer, { limitInputPixels: false })
    .rotate()
    .jpeg({ quality: 92 })
    .toBuffer();
  const maskJpeg = await encodeMeituMask(options.maskBuffer, options.width, options.height);
  const body = buildFormulaInpaintBody(
    sourceJpeg.toString("base64"),
    maskJpeg.toString("base64"),
    options,
    config.inpaintTask,
  );
  const pushUrl = `${config.formulaBaseUrl}/api/v1/sdk/sync/push`;
  // 提取最终发送给美图的 prompt_pos（已拼接基础约束前缀）
  const finalPromptPos = (() => {
    try {
      const parsed = JSON.parse(body.params) as { parameter?: { prompt_pos?: string } };
      return parsed.parameter?.prompt_pos || options.promptPos || "";
    } catch {
      return options.promptPos || "";
    }
  })();
  console.log(
    `[MEITU] 【formula 通道】提交: POST ${config.formulaBaseUrl}/api/v1/sdk/sync/push | ` +
    `task=${config.inpaintTask}, ` +
    `prompt="${finalPromptPos.slice(0, 120)}${finalPromptPos.length > 120 ? "..." : ""}", ` +
    `seed=${options.seed ?? "随机"}, ` +
    `图片=${sourceJpeg.length}B, mask=${maskJpeg.length}B`,
  );
  const pushJson = await formulaRequest("POST", pushUrl, JSON.stringify(body), config, 60000);
  const pushed = parseFormulaTaskResponse(pushJson);
  if (pushed.code !== 0) {
    console.log(`[MEITU] 【formula 通道】push 失败 code=${pushed.code} message=${pushed.message}`);
    throw new Error(mapMeituError(pushed.code, pushed.message));
  }
  console.log(
    `[MEITU] 【formula 通道】push 成功 code=0, status=${pushed.data?.status ?? "未知"}, ` +
    `progress=${pushed.data?.progress ?? "未知"}, taskId=${pushed.data?.result?.id ?? "(无，同步已完成)"}`,
  );

  // 同步已完成（status=10）直接返回；status=9 或进行中则轮询查询接口。
  const status = pushed.data?.status ?? 0;
  if (status === 10) {
    const urls = pushed.data?.result?.urls || [];
    console.log(`[MEITU] 【formula 通道】同步完成 status=10, 结果 ${urls.length} 张: ${urls.join(", ")}`);
    return { images: urls.map((src) => ({ src, width: options.width, height: options.height })) };
  }
  if (status === 2 || status === 20) {
    console.log(`[MEITU] 【formula 通道】任务失败 status=${status}: ${pushed.message || ""}`);
    throw new Error(mapMeituError(status, pushed.message || "美图局部重绘任务失败"));
  }

  const taskId = pushed.data?.result?.id;
  if (!taskId) {
    throw new Error("美图局部重绘提交失败：未返回任务 id（请检查 MEITU_INPAINT_TASK 配方 ID）");
  }

  const deadline = Date.now() + (options.timeoutMs || config.timeoutMs);
  const statusUrl = `${config.formulaBaseUrl}/api/v1/sdk/status?task_id=${encodeURIComponent(taskId)}`;
  let lastError: unknown;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const queryJson = await formulaRequest("GET", statusUrl, "", config, 30000);
      const queried = parseFormulaTaskResponse(queryJson);
      if (queried.code !== 0) {
        lastError = new Error(mapMeituError(queried.code, queried.message));
        continue;
      }
      const queryStatus = queried.data?.status ?? 0;
      console.log(`[MEITU] 【formula 通道】轮询 status=${queryStatus}, progress=${queried.data?.progress ?? "未知"}`);
      if (queryStatus === 10) {
        const urls = queried.data?.result?.urls || [];
        if (urls.length === 0) {
          lastError = new Error("美图局部重绘任务成功但未返回结果图");
          continue;
        }
        console.log(`[MEITU] 【formula 通道】轮询成功 status=10, 结果 ${urls.length} 张: ${urls.join(", ")}`);
        return { images: urls.map((src) => ({ src, width: options.width, height: options.height })) };
      }
      if (queryStatus === 2 || queryStatus === 20) {
        throw new Error(mapMeituError(queryStatus, queried.message || "美图局部重绘任务失败"));
      }
      if (queryStatus === -1) {
        throw new Error("美图局部重绘任务不存在或已过期（任务提交 24 小时后失效），请重新提交");
      }
    } catch (pollError) {
      lastError = pollError;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("美图局部重绘任务查询超时");
}

// ─────────────────────────────────────────────
// 统一入口
// ─────────────────────────────────────────────

/**
 * 局部重绘统一入口（doc/331 唯一通道 = 新 AIGCP 网关 formula 任务式）：
 * POST https://openapi.meitu.com/api/v1/sdk/sync/push（task=/v1/InPainting/468520, task_type=formula）
 * → 任务 ID → 轮询 GET /api/v1/sdk/status?task_id=... 取结果（doc/222）。
 *
 * 注意：本接口没有旧 mtlab v3 通道；历史上误配的 v3 通道（80001 权益错误）已移除。
 * 返回结果图 src（url 形式，调用方需尽快下载存储；结果链接 24 小时有效）。
 */
export async function inpaintWithMeitu(options: MeituInpaintOptions): Promise<MeituInpaintResult> {
  const config = getMeituConfig();
  if (!config.apiKey || !config.apiSecret) {
    console.log("[MEITU] inpaintWithMeitu 调用失败：未配置 ACCESS_KEY / SECRET_KEY");
    throw new Error("未配置美图 ACCESS_KEY / SECRET_KEY，无法调用局部重绘");
  }
  console.log(
    `[MEITU] inpaintWithMeitu 入口 | 通道=formula(AIGCP 新网关), ` +
    `ACCESS_KEY=${maskSecret(config.apiKey)}, SECRET_KEY=${maskSecret(config.apiSecret)}, ` +
    `MEITU_INPAINT_TASK=${config.inpaintTask}, formulaBaseUrl=${config.formulaBaseUrl}, ` +
    `timeoutMs=${config.timeoutMs}`,
  );
  console.log(
    `[MEITU] 输入参数 | 图片=${options.imageBuffer.length}B, mask=${options.maskBuffer.length}B, ` +
    `尺寸=${options.width}x${options.height}, ` +
    `rawPrompt="${options.promptPos || ""}" (基础约束将在 buildFormulaInpaintBody 中自动拼接), ` +
    `seed=${options.seed ?? "随机"}, numSamples=${options.numSamples ?? 1}`,
  );
  return runMeituFormulaInpaint(options, config);
}
