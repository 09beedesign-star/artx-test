/**
 * 智能电商产品面板的「参数预设」存储——唯一事实源。
 *
 * 【为什么单独开一个文件，而不是在弹窗里直接读写 localStorage】
 * 预设有 4 个入口会碰同一份数据：保存、更新、重命名、删除，
 * 再加上「进面板时自动套用最后一次选中的预设」。
 * 这 5 处只要有任何一处自己拼 key 或自己判定合法性，就会出现
 * 「存进去了但读不出来 / 读出来是上一个账号的」这类零报错错版。
 * 所以把 key 规则、账号隔离、字段兜底全部收口在这里。
 *
 * 【账号隔离】
 * ⚠️ 需求原文：「这个参数的变化绑定用户账号」。
 *    因此 storage key 必须带上 user.id，不能用一个全局 key ——
 *    同一台电脑换账号登录会直接读到别人的预设，而且不会报任何错。
 * ⚠️ 未登录时用 "guest" 作为账号位，而不是拒绝保存。
 *    拒绝保存会让「还没登录就调好了参数」的用户白调一遍；
 *    用 guest 位存着，登录后各看各的，互不污染。
 *
 * 【为什么存 localStorage 而不是发后端】
 * 后端当前没有「用户级 UI 偏好」这张表，凭空加一条写接口的代价远大于收益；
 * 而这份数据丢了最坏结果只是「预设没了，重新调一次」，不涉及任何资产。
 * 日后若接后端，只需替换本文件的 read/write 两个函数体，调用方一行不用改。
 */

/**
 * 一份预设里保存的全部面板参数。
 *
 * ⚠️ 这里必须是**纯可序列化数据**，不能塞进 PicWish 模板对象里的函数或大字段。
 *    模板只存 id + name + category（回填时用得着的最小集），
 *    previewUrl 这种 CDN 地址存了也会过期，回填时反而误导。
 *
 * ⚠️ 不存 imageSrc / referenceSrc：
 *    它们是 dataURL，一张图就能轻松吃掉 localStorage 的 5MB 配额，
 *    几份预设就会把整个站点的存储写爆（写爆时其他模块的 setItem 会一起静默失败）。
 *    而且「预设」是参数模板，不是作品草稿 —— 用户要的是下次进来参数还在，
 *    不是下次进来上次那张产品图还在。
 */
export type SmartCommercePresetPayload = {
  compositionId: string;
  ecommerceId: string | null;
  ratio: string;
  resolution: string;
  count: number;
  backgroundMode: string;
  customPrompt: string;
  picwishTemplate: { id: number; name: string; category: string } | null;
};

export type SmartCommercePreset = {
  id: string;
  name: string;
  payload: SmartCommercePresetPayload;
  createdAt: number;
  updatedAt: number;
};

/**
 * 面板出厂默认参数——「回到初始态」这条菜单的目标值。
 *
 * ⚠️ 这里的每一个值都必须与组件里 useState 的初始值**逐字段一致**。
 *    对不上会造成一个很难察觉的错版：用户点「回到初始态」，
 *    得到的却不是他第一次打开面板时看到的样子，且零报错。
 *    SmartCommerceProductDialog.test.ts 里有守卫盯着这件事。
 */
export const SMART_COMMERCE_DEFAULT_PAYLOAD: SmartCommercePresetPayload = {
  compositionId: "center",
  ecommerceId: null,
  ratio: "1:1",
  resolution: "1k",
  count: 1,
  backgroundMode: "template",
  customPrompt: "",
  picwishTemplate: null,
};

const STORAGE_PREFIX = "artx:smart-commerce-presets";
/** 最后一次选中的预设 id，决定「下次进入自动套用哪一份」 */
const ACTIVE_PREFIX = "artx:smart-commerce-active-preset";

/** 一个账号最多存多少份预设。超出后拒绝新增，而不是悄悄挤掉最老的一份。 */
export const SMART_COMMERCE_PRESET_LIMIT = 12;

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
 *    少一个字段就会让回填时 `payload.count` 变成 undefined，
 *    进而把生成数量按钮全部熄灭 —— 界面看起来正常，只是没有一个是选中的。
 */
function normalizePayload(raw: unknown): SmartCommercePresetPayload {
  const source = (raw || {}) as Partial<SmartCommercePresetPayload>;
  const template = source.picwishTemplate;
  return {
    compositionId:
      typeof source.compositionId === "string" && source.compositionId
        ? source.compositionId
        : SMART_COMMERCE_DEFAULT_PAYLOAD.compositionId,
    ecommerceId: typeof source.ecommerceId === "string" ? source.ecommerceId : null,
    ratio:
      typeof source.ratio === "string" && source.ratio
        ? source.ratio
        : SMART_COMMERCE_DEFAULT_PAYLOAD.ratio,
    resolution:
      typeof source.resolution === "string" && source.resolution
        ? source.resolution
        : SMART_COMMERCE_DEFAULT_PAYLOAD.resolution,
    count:
      typeof source.count === "number" && Number.isFinite(source.count)
        ? Math.min(9, Math.max(1, Math.round(source.count)))
        : SMART_COMMERCE_DEFAULT_PAYLOAD.count,
    backgroundMode:
      source.backgroundMode === "prompt" ? "prompt" : "template",
    customPrompt:
      typeof source.customPrompt === "string" ? source.customPrompt.slice(0, 800) : "",
    picwishTemplate:
      template && typeof template === "object" && typeof template.id === "number"
        ? {
            id: template.id,
            name: typeof template.name === "string" ? template.name : "",
            category: typeof template.category === "string" ? template.category : "",
          }
        : null,
  };
}

export function readSmartCommercePresets(
  userId: string | null | undefined
): SmartCommercePreset[] {
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
    // 绝不能抛出去，否则整个电商面板会白屏。
    return [];
  }
}

/** 返回 false 表示写入失败（配额满 / 隐私模式），调用方需要提示用户。 */
export function writeSmartCommercePresets(
  userId: string | null | undefined,
  presets: SmartCommercePreset[]
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(listKey(userId), JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export function readActiveSmartCommercePresetId(
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
export function writeActiveSmartCommercePresetId(
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

export function createSmartCommercePresetId(): string {
  return `scp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成一个不与现有预设重名的默认名字：预设 1 / 预设 2 ...
 *
 * ⚠️ 不能简单用 `预设 ${list.length + 1}`：
 *    删掉中间一份后长度会回退，新建的名字就与已有的撞上，
 *    两份同名预设在菜单里完全无法区分（id 不同，但用户看不见 id）。
 */
export function nextSmartCommercePresetName(presets: SmartCommercePreset[]): string {
  const used = new Set(presets.map(item => item.name));
  for (let index = 1; index <= SMART_COMMERCE_PRESET_LIMIT + 1; index += 1) {
    const candidate = `预设 ${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `预设 ${Date.now().toString(36)}`;
}
