import {
  AUTO_AI_MODEL,
  DEFAULT_IMAGE_AI_MODEL_ID,
  IMAGE_AI_MODELS,
} from "./workspace-data";

/**
 * 「用户偏好的出图模型」的唯一事实源。
 *
 * 【为什么需要这个文件】
 * 2026-09-15 给首页提示词框加模型选择器时，需求是「首页选的模型与画布共用记忆」。
 * 最直接的做法是首页自己 localStorage.getItem/setItem 一遍 —— 但画布这套存储
 * 并不是「一个 key 存一个模型 id」那么简单：
 *
 *   - 图片模型 key（artx:canvas-assistant-image-model）**只存具体模型**，
 *     校验用的是 IMAGE_AI_MODELS，而这个数组**不含 auto**；
 *   - 「当前是不是 auto」由另一个独立开关 key（artx:canvas-assistant-auto-mode）
 *     表达，"0" 才是关闭。
 *
 * 也就是说，如果首页天真地把 "auto" 写进图片模型 key，画布读取时会因为
 * IMAGE_AI_MODELS.some() 判定为非法值而**静默回落成默认模型** ——
 * 用户在首页明明选了 auto，进画布一看变成了 image2.5，而且没有任何报错。
 *
 * 这正是本项目反复踩的「同一份数据多个出口」：存储格式的知识一旦复制到第二处，
 * 两处迟早对不上。所以这里把读写收口成一对函数，首页和画布都只调它。
 */

const IMAGE_MODEL_STORAGE_KEY = "artx:canvas-assistant-image-model";
const AUTO_MODE_STORAGE_KEY = "artx:canvas-assistant-auto-mode";
/** 旧版只有这一个 key，保留兼容读，与画布 :18367 的口径一致。 */
const LEGACY_MODEL_STORAGE_KEY = "artx:canvas-assistant-model";

/**
 * 读出用户偏好的出图模型。
 *
 * 返回值可能是 AUTO_AI_MODEL.id（"auto"），调用方必须能接住 —— 不要假设
 * 它一定是个具体模型 id。
 */
export function readPreferredImageModelId(): string {
  if (typeof window === "undefined") return AUTO_AI_MODEL.id;
  try {
    // auto 开关缺省即开启（与画布 getStoredCanvasAssistantImageEditModel 一致：
    // 只有显式写入 "0" 才算关闭）。新用户第一次进站就是 auto，
    // 这与首页原先硬编码的 model:"auto" 行为完全吻合，属于零变化迁移。
    const autoMode = window.localStorage.getItem(AUTO_MODE_STORAGE_KEY) !== "0";
    if (autoMode) return AUTO_AI_MODEL.id;
    const stored =
      window.localStorage.getItem(IMAGE_MODEL_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_MODEL_STORAGE_KEY);
    return IMAGE_AI_MODELS.some(model => model.id === stored)
      ? stored!
      : DEFAULT_IMAGE_AI_MODEL_ID;
  } catch {
    // localStorage 可能因隐私模式/配额抛错。偏好读不到不是致命问题，
    // 回到 auto 即可 —— 绝不能让它把整个首页渲染打挂。
    return AUTO_AI_MODEL.id;
  }
}

/**
 * 写入用户偏好的出图模型。
 *
 * ⚠️ 选择 auto 时**只翻 auto 开关，不碰图片模型 key**。
 * 这样用户「切到 auto 再切回来」时，上一次选的具体模型还在，
 * 不会被 "auto" 这个字符串覆盖掉。
 */
export function writePreferredImageModelId(modelId: string) {
  if (typeof window === "undefined") return;
  try {
    if (modelId === AUTO_AI_MODEL.id) {
      window.localStorage.setItem(AUTO_MODE_STORAGE_KEY, "1");
      return;
    }
    if (!IMAGE_AI_MODELS.some(model => model.id === modelId)) return;
    window.localStorage.setItem(AUTO_MODE_STORAGE_KEY, "0");
    window.localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, modelId);
  } catch {
    /* ignore storage quota errors */
  }
}
