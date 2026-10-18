/**
 * 电商画布「参数预设」存储——唯一事实源。
 *
 * 【架构设计】
 * 完全复制 smart-commerce-presets.ts 的逻辑：
 *   - localStorage 存储（不走后端）
 *   - 账号隔离（同台电脑换账号不会读到对方预设）
 *   - 上限 10 个预设（与智能产品一致）
 *   - normalizePayload 逐字段兜底（防止老版本字段缺失）
 *
 * 【与智能产品预设的差异】
 * 字段适配 EcommerceDraft 结构：
 *   - 产品图参数：productRatio, productTier, productCount, bgTemplate
 *   - 带货图文参数：platform, market, language, postRatio, postCount, tplId
 *   - 共通参数：model, sellingPoints, withCopy
 *     （2026-10-18 已删 noTextOnImage：与提示词里「加 XX 文字」冲突；老预设里残留该字段会被 normalize 丢弃）
 *   - 不存 uploads（dataURL 吃光 localStorage 配额）
 */

import type { AiImageResolutionTier } from "@shared/ai-credit-policy";
import { DEFAULT_IMAGE_MODEL_ID } from "@shared/image-models";
import {
  ECOMMERCE_LANGUAGES,
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
} from "@/data/ecommerce-canvas-templates";

/**
 * 一份预设里保存的全部面板参数。
 *
 * ⚠️ 不存 uploads（商品图 dataURL）：
 *    一张图轻松吃掉 localStorage 的 5MB 配额，几份预设就会写爆。
 *    而且「预设」是参数模板，不是作品草稿 —— 用户要的是参数还在，
 *    不是上次那张产品图还在。
 */
export type EcommerceCanvasPresetPayload = {
  model: string;
  // 产品图参数
  productRatio: string;
  productTier: AiImageResolutionTier;
  productCount: number;
  bgTemplate: { id: number; name: string; category: string } | null;
  // 带货图文参数
  platform: string;
  market: string;
  language: string;
  postRatio: string;
  postCount: number;
  tplId: number | null;
  // 共通参数
  sellingPoints: string;
  withCopy: boolean;
};

export type EcommerceCanvasPreset = {
  id: string;
  name: string;
  payload: EcommerceCanvasPresetPayload;
  createdAt: number;
  updatedAt: number;
};

/**
 * 面板出厂默认参数——「回到初始态」的目标值。
 *
 * ⚠️ 这里的每一个值都必须与 EcommerceCanvasPage.tsx 的 createDefaultDraft() 逐字段一致。
 */
export const ECOMMERCE_CANVAS_DEFAULT_PAYLOAD: EcommerceCanvasPresetPayload = {
  model: DEFAULT_IMAGE_MODEL_ID,
  // 产品图参数
  productRatio: "3:4",
  productTier: "1k",
  productCount: 1,
  bgTemplate: null,
  // 带货图文参数
  platform: ECOMMERCE_PLATFORMS[0],
  market: ECOMMERCE_MARKETS[0],
  language: ECOMMERCE_LANGUAGES[0],
  postRatio: "3:4",
  postCount: 6,
  tplId: null,
  // 共通参数
  sellingPoints: "",
  withCopy: true,
};

const STORAGE_PREFIX = "artx:ecommerce-canvas-presets";
const ACTIVE_PREFIX = "artx:ecommerce-canvas-active-preset";

/** 一个账号最多存多少份预设。与智能产品保持一致。 */
export const ECOMMERCE_CANVAS_PRESET_LIMIT = 10;

function accountKey(userId: string | null | undefined) {
  const trimmed = (userId || "").trim();
  return trimmed || "guest";
}

function listKey(userId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${accountKey(userId)}`;
}

function activeKey(userId: string | null | undefined) {
  return `${ACTIVE_PREFIX}:${accountKey(userId)}`;
}

/**
 * 把任意来源的对象收敛成合法 payload。
 *
 * ⚠️ 必须逐字段兜底，不能 `return raw as Payload`。
 *    localStorage 里的数据可能来自**上一个版本的字段结构**，
 *    少一个字段就会让回填时 `payload.postCount` 变成 undefined，
 *    进而把数量按钮全部熄灭 —— 界面看起来正常，只是没有一个是选中的。
 */
function normalizePayload(raw: unknown): EcommerceCanvasPresetPayload {
  const source = (raw || {}) as Partial<EcommerceCanvasPresetPayload>;
  const template = source.bgTemplate;
  return {
    model:
      typeof source.model === "string" && source.model.trim()
        ? source.model
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.model,
    // 产品图参数
    productRatio:
      typeof source.productRatio === "string" && source.productRatio
        ? source.productRatio
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productRatio,
    productTier:
      source.productTier === "1k" || source.productTier === "2k" || source.productTier === "4k"
        ? source.productTier
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productTier,
    productCount:
      typeof source.productCount === "number" && Number.isFinite(source.productCount)
        ? Math.min(8, Math.max(1, Math.round(source.productCount)))
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.productCount,
    bgTemplate:
      template && typeof template === "object" && typeof template.id === "number"
        ? {
            id: template.id,
            name: typeof template.name === "string" ? template.name : "",
            category: typeof template.category === "string" ? template.category : "",
          }
        : null,
    // 带货图文参数
    platform:
      typeof source.platform === "string" && source.platform
        ? source.platform
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.platform,
    market:
      typeof source.market === "string" && source.market
        ? source.market
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.market,
    language:
      typeof source.language === "string" && source.language
        ? source.language
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.language,
    postRatio:
      typeof source.postRatio === "string" && source.postRatio
        ? source.postRatio
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.postRatio,
    postCount:
      typeof source.postCount === "number" && Number.isFinite(source.postCount)
        ? Math.min(9, Math.max(1, Math.round(source.postCount)))
        : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.postCount,
    tplId: typeof source.tplId === "number" ? source.tplId : null,
    // 共通参数
    sellingPoints:
      typeof source.sellingPoints === "string" ? source.sellingPoints.slice(0, 1000) : "",
    withCopy: typeof source.withCopy === "boolean"
      ? source.withCopy
      : ECOMMERCE_CANVAS_DEFAULT_PAYLOAD.withCopy,
  };
}

export function readEcommerceCanvasPresets(
  userId: string | null | undefined
): EcommerceCanvasPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(listKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === "object" && typeof item.id === "string")
      .map(item => ({
        id: String(item.id),
        name: typeof item.name === "string" && item.name.trim() ? item.name : "未命名预设",
        payload: normalizePayload(item.payload),
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
      }));
  } catch {
    // 隐私模式 / JSON 损坏都走这里。返回空数组即可——
    // 绝不能抛出去，否则整个电商画布会白屏。
    return [];
  }
}

/** 返回 false 表示写入失败（配额满 / 隐私模式），调用方需要提示用户。 */
export function writeEcommerceCanvasPresets(
  userId: string | null | undefined,
  presets: EcommerceCanvasPreset[]
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(listKey(userId), JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export function readActiveEcommerceCanvasPresetId(
  userId: string | null | undefined
): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

/**
 * 记录 / 清除「下次进面板自动套用」的预设。
 *
 * ⚠️ 传 null 表示回到初始态，必须 removeItem 而不是写入 "null" 字符串 ——
 *    写字符串的话下次读出来是 truthy 的 "null"，
 *    会去找一个 id 叫 "null" 的预设，找不到就静默不套用，
 *    用户看到的现象是「点了回到初始态，下次进来还是老样子」。
 */
export function writeActiveEcommerceCanvasPresetId(
  userId: string | null | undefined,
  presetId: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (!presetId) {
      window.localStorage.removeItem(activeKey(userId));
      return;
    }
    window.localStorage.setItem(activeKey(userId), presetId);
  } catch {
    /* 存不下就下次不自动套用，不影响本次使用 */
  }
}

/**
 * 草稿里与预设相关的字段（结构上兼容 EcommerceDraft，避免 lib 反向依赖组件目录）。
 */
type PresetDraftShape = Omit<EcommerceCanvasPresetPayload, "bgTemplate"> & {
  // 草稿里是完整的 PicWish 模板对象，预设里只存 id/name/category 最小集
  bgTemplate?: unknown;
  userModifiedProductTier?: boolean;
  userModifiedPostRatio?: boolean;
};

/**
 * 把预设合并进草稿 —— 「套用预设」与「进页自动套用」的**唯一**合并口。
 *
 * 【分辨率/画幅比优先级】（2026-10-18 用户拍板）
 *   产品图分辨率 productTier、带货图文画幅比 postRatio：
 *   - 用户本次主动点选过（userModified* === true）→ 保留用户的选择，预设不覆盖
 *   - 否则 → 以预设为准
 *   其余字段一律以预设为准。
 *
 * ⚠️ 不清空 userModified* 标记：用户点过一次，就一直以他的选择为准，
 *    直到他「回到初始态」（force=true）为止。清空的话第二次套用预设就会
 *    悄悄覆盖用户刚选好的分辨率 —— 正是这条规则要防的事。
 * ⚠️ uploads 不在 payload 里，合并时天然保留用户已传的商品图。
 */
export function mergeEcommerceCanvasPreset<T extends PresetDraftShape>(
  draft: T,
  payload: EcommerceCanvasPresetPayload,
  options: { force?: boolean } = {},
): T {
  const force = options.force === true;
  const keepTier = !force && draft.userModifiedProductTier === true;
  const keepRatio = !force && draft.userModifiedPostRatio === true;
  return {
    ...draft,
    model: payload.model,
    productRatio: payload.productRatio,
    productTier: keepTier ? draft.productTier : payload.productTier,
    productCount: payload.productCount,
    bgTemplate: payload.bgTemplate ?? undefined,
    platform: payload.platform,
    market: payload.market,
    language: payload.language,
    postRatio: keepRatio ? draft.postRatio : payload.postRatio,
    postCount: payload.postCount,
    tplId: payload.tplId,
    sellingPoints: payload.sellingPoints,
    withCopy: payload.withCopy,
    userModifiedProductTier: force ? false : draft.userModifiedProductTier,
    userModifiedPostRatio: force ? false : draft.userModifiedPostRatio,
  };
}

export function createEcommerceCanvasPresetId(): string {
  return `ecp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成一个不与现有预设重名的默认名字：预设 1 / 预设 2 ...
 */
export function nextEcommerceCanvasPresetName(presets: EcommerceCanvasPreset[]): string {
  const used = new Set(presets.map(item => item.name));
  for (let index = 1; index <= ECOMMERCE_CANVAS_PRESET_LIMIT + 1; index += 1) {
    const candidate = `预设 ${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `预设 ${Date.now().toString(36)}`;
}
