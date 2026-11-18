/**
 * 3D 画布：模型文件的产品级约束（前后端唯一事实源）。
 *
 * ⚠️ 前端提示文案、后端上传上限、过期清理都必须读这里的常量，
 *    不允许在任何一侧再写一份 100 / 24 的字面量 —— 两边各写一份，
 *    改了一处就会出现「提示 24 小时、实际 48 小时才删」这种零报错的错位。
 */

/**
 * 单个模型文件体积上限：60MB（产品约束，不是调优项）。
 * 📌 2026-10-30 放开 FBX / OBJ 后由 50MB 调整为 60MB（产品硬上限，不得超过 60MB）。
 * ⚠️ nginx client_max_body_size 必须大于这个值（当前 64m），否则超大文件会被 nginx 直接 413，
 *    前端拿不到统一文案。
 */
export const MODEL3D_MAX_MB = 60;
export const MODEL3D_MAX_BYTES = MODEL3D_MAX_MB * 1024 * 1024;

/**
 * 模型文件在服务器上的保留时长：48 小时，到期自动删除，不做任何备份留底。
 * 📌 2026-10-30 由 24 小时调整为 48 小时（前端文案、后端读取闸、定时清理全部读这一个常量）。
 */
export const MODEL3D_RETENTION_HOURS = 48;
export const MODEL3D_RETENTION_MS = MODEL3D_RETENTION_HOURS * 60 * 60 * 1000;

/**
 * 支持的单文件模型格式：FBX / OBJ / GLB / GLTF。
 *
 * 📌 2026-10-30 产品决策：在 glTF 家族基础上放开 fbx / obj，体积统一受 60MB 上限约束。
 *    stl / ply / 3mf / dae / usdz 等仍不支持。
 *    要放开其他格式，只改这里 —— 前端校验、文件选择框、后端 415、ID 正则、文案都读这份列表；
 *    同时要在 Model3DNode 的 fetchModelObject 里补对应的加载器。
 * 📌 都是「单文件」口径：gltf 需资源内嵌；fbx 贴图需嵌入文件；obj 不读 .mtl，用默认材质显示。
 */
export const MODEL3D_EXTENSIONS = ["fbx", "obj", "glb", "gltf"] as const;

export type Model3DExtension = (typeof MODEL3D_EXTENSIONS)[number];

export function getModel3DExtension(filename: string): Model3DExtension | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return (MODEL3D_EXTENSIONS as readonly string[]).includes(ext) ? (ext as Model3DExtension) : null;
}

export function isModel3DFilename(filename: string) {
  return getModel3DExtension(filename) !== null;
}

export const MODEL3D_ACCEPT_ATTRIBUTE = MODEL3D_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** 给用户看的保留期说明 —— 上传前、节点内、上传成功 toast 共用同一句。 */
export const MODEL3D_RETENTION_NOTICE_ZH =
  `模型文件仅在画布中保存 ${MODEL3D_RETENTION_HOURS} 小时，到期后服务器自动彻底删除；为保证信息安全，平台不做任何备份留底。`;

/** 模型过期（超过保留期）后，画布自动把它从 3D 容器中清除时给用户的提示。前端容器内常驻提示、全局 toast 共用。 */
export const MODEL3D_EXPIRED_CLEARED_NOTICE_ZH =
  `为有效利用服务器存储量，该模型已超过 ${MODEL3D_RETENTION_HOURS} 小时，已在画布中自动清除`;

/** 到期前多久开始提醒用户下载：1 小时。 */
export const MODEL3D_EXPIRY_WARNING_MINUTES = 60;
export const MODEL3D_EXPIRY_WARNING_MS = MODEL3D_EXPIRY_WARNING_MINUTES * 60 * 1000;

/** 即将删除提醒：倒计时 1 小时内展示，引导用户立即下载到本地。 */
export const MODEL3D_EXPIRY_WARNING_NOTICE_ZH =
  `该模型将在 1 小时内从服务器自动删除，请尽快下载到本地保存`;

/** 超过体积上限时的统一提示：前端全局 toast、后端 413 共用同一句。 */
export const MODEL3D_SIZE_LIMIT_NOTICE_ZH = `模型文件体积超过 ${MODEL3D_MAX_MB}MB，请调整模型体积后再导入`;

export function isModel3DOversized(size: number) {
  return size > MODEL3D_MAX_BYTES;
}

/** 给用户看的格式清单，如「FBX / OBJ / GLB / GLTF」。 */
export const MODEL3D_FORMATS_LABEL = MODEL3D_EXTENSIONS.map((ext) => ext.toUpperCase()).join(" / ");

/** 模型 ID：服务端生成，32 位 hex + 扩展名，路由里只接受这种形态，杜绝路径穿越。 */
export const MODEL3D_ID_PATTERN = new RegExp(
  `^[a-f0-9]{32}\\.(${MODEL3D_EXTENSIONS.join("|")})$`
);

/** 格式不支持时的统一提示，前后端共用。 */
export const MODEL3D_FORMAT_NOTICE_ZH =
  `仅支持 ${MODEL3D_FORMATS_LABEL} 格式的 3D 模型`;

// ─────────────────────────────────────────────────────────────────────────────
// AI 3D 生成模型注册表（文字 → 3D 生成能力）
//
// ⚠️ 与上方的「文件上传/存储」常量语义不同，这里登记的是平台接入的 AI 生成上游，
//    id 对应 AI_THREED_MODEL_CREDIT_POLICIES（shared/ai-credit-policy.ts）。
// ─────────────────────────────────────────────────────────────────────────────

/** 已接入的 3D 生成模型 ID，顺序 = 选择器默认显示顺序。 */
export const THREED_GEN_MODEL_IDS = [
  "hunyuan3d-2.5",
  "tripo3d-v2.5",
  "meshy-4",
  "stability3d-fast",
] as const;

export type ThreeDGenModelId = (typeof THREED_GEN_MODEL_IDS)[number];

export const DEFAULT_THREED_GEN_MODEL_ID: ThreeDGenModelId = "hunyuan3d-2.5";

/**
 * 选择器里可选的 3D 模型 —— 只列有真实上游的（2026-11-17 只有混元生 3D）。
 * 其余 id 保留在 THREED_GEN_MODEL_IDS 里只为兼容老偏好/老任务，后端一律走混元。
 */
export const THREED_SELECTABLE_MODEL_IDS: readonly ThreeDGenModelId[] = ["hunyuan3d-2.5"];

/**
 * 🔒 2026-11-18 用户要求：「AI 生成 3D 模型」下架，不上正式环境。
 *    前端三个入口（composer 3D 分类 / 图片右键「生成 3D 模型」/ 悬浮面板模型选择器 3D tab）
 *    与后端 /api/threed/generate 都读这一个开关 —— 只关前端 = 接口仍可被直接调用扣费。
 * - 本地开发（vite dev / 非 production 的 Node）照常可用，不影响继续开发。
 * - 正式发布时把它改为 true 即可（后端也可用环境变量 THREED_GENERATION_ENABLED=1 临时放开）。
 * ⚠️ 只下架「AI 生成」；上传 / 查看本地 3D 模型文件（/api/models3d）是 10 月已上线的老功能，不受影响。
 */
export const THREED_GENERATION_PUBLIC = false;

export const THREED_GENERATION_OFFLINE_NOTICE_ZH = "3D 模型生成暂未开放";

export function isThreeDGenerationEnabled(isDev: boolean): boolean {
  return THREED_GENERATION_PUBLIC || isDev;
}

export function isThreeDGenModelId(id: string): id is ThreeDGenModelId {
  return (THREED_GEN_MODEL_IDS as readonly string[]).includes(id);
}
