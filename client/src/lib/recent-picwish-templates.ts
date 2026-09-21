/**
 * 「最近使用的电商背景模板」存储 —— 唯一事实源。
 *
 * 【需求来源】2026-09-20：增高后的电商背景模板库区域里，
 * 按一排两个的布局放置**最近使用**的模板。
 *
 * 【为什么要持久化，而不是只记在组件 state 里】
 * 「最近使用」的价值全在**跨会话**：用户昨天挑的模板，今天进来还能一眼点回去。
 * 存在 state 里的话，关掉面板就没了 —— 那不叫最近使用，那叫本次选过。
 *
 * 【账号隔离】
 * 与 smart-commerce-presets.ts 同一套口径：key 带 user.id，未登录用 "guest"。
 * ⚠️ 共用一个全局 key 的话，换账号登录会看到别人用过的模板，且零报错。
 *
 * 【⚠️ 为什么要存 previewUrl，而预设模块明确不存】
 * 这两处的取舍**相反**，别照抄：
 *   · 预设（presets）存的是「参数模板」，回填时只需要 id/name/category，
 *     存 previewUrl 反而会在 CDN 链接过期后回填出一个坏图。
 *   · 最近使用存的是「给人看的卡片」，没有缩略图就只剩一行灰字，
 *     一排两个的格子会显得空且无法辨认。
 * ✅ 结论：这里存 previewUrl，但**渲染时必须容忍它加载失败**（onError 退回纯色卡片），
 *    因为它确实会过期。容忍失败比不存更划算。
 */

import type { PicWishBackgroundTemplate } from "@/lib/ai";

const STORAGE_PREFIX = "artx:recent-picwish-templates";

/**
 * 最多记几个。
 *
 * ⚠️ 这个数字不是随便定的：面板里一排两个、只留一行的位置，
 *    也就是说**可见的只有 2 个**。存 6 个是为了「删掉某个模板后还有后备」，
 *    以及日后想展示两行时不用改存储格式。
 * ⚠️ 但不能太大 —— 每条都带一个 previewUrl 字符串，
 *    存太多会无谓占用 localStorage 配额（配额写爆时其他模块的 setItem 会一起静默失败）。
 */
export const RECENT_PICWISH_TEMPLATE_LIMIT = 6;

/** 面板里一排放几个（需求硬性规定为 2）。 */
export const RECENT_PICWISH_TEMPLATE_COLUMNS = 2;

export type RecentPicwishTemplate = {
  id: number;
  name: string;
  category: string;
  previewUrl: string;
  /** 最后一次使用时间，用于排序。 */
  usedAt: number;
};

function accountKey(userId: string | null | undefined) {
  const trimmed = (userId || "").trim();
  return trimmed || "guest";
}

function storageKey(userId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${accountKey(userId)}`;
}

/**
 * 逐字段收敛，不用 `as RecentPicwishTemplate`。
 *
 * ⚠️ localStorage 里的数据可能来自上一个版本的字段结构。
 *    少一个字段不会抛错，只会在渲染时变成 undefined ——
 *    卡片上出现空白标题或 `src={undefined}` 的破图，且没有任何报错。
 */
function normalize(raw: unknown): RecentPicwishTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<RecentPicwishTemplate>;
  if (typeof source.id !== "number" || !Number.isFinite(source.id)) return null;
  return {
    id: source.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name : "未命名模板",
    category: typeof source.category === "string" ? source.category : "",
    previewUrl: typeof source.previewUrl === "string" ? source.previewUrl : "",
    usedAt:
      typeof source.usedAt === "number" && Number.isFinite(source.usedAt)
        ? source.usedAt
        : 0,
  };
}

export function readRecentPicwishTemplates(
  userId: string | null | undefined
): RecentPicwishTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((item): item is RecentPicwishTemplate => item !== null)
      /*
        ⚠️ 读出来必须**重新按 usedAt 排一次**，不能信任写入顺序。
           并发标签页各写各的、或旧版本写入过无序数据时，
           不排序会让「最近使用」显示成一个随机顺序 —— 零报错，但功能名不副实。
      */
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, RECENT_PICWISH_TEMPLATE_LIMIT);
  } catch {
    // 隐私模式 / JSON 损坏。返回空数组，让 UI 退回「还没有最近使用」的空态。
    return [];
  }
}

/**
 * 记录一次使用，返回写入后的新列表。
 *
 * ⚠️ 必须先按 id 去重再插到队首。
 *    不去重的话，反复选同一个模板会把列表塞满同一张卡，
 *    「最近使用」退化成「最近点击流水账」，而且不会报错。
 */
export function rememberPicwishTemplate(
  userId: string | null | undefined,
  template: PicWishBackgroundTemplate,
  now: number = Date.now()
): RecentPicwishTemplate[] {
  const entry: RecentPicwishTemplate = {
    id: template.id,
    name: template.name || "未命名模板",
    category: template.category || "",
    previewUrl: template.previewUrl || "",
    usedAt: now,
  };
  const rest = readRecentPicwishTemplates(userId).filter(item => item.id !== entry.id);
  const next = [entry, ...rest].slice(0, RECENT_PICWISH_TEMPLATE_LIMIT);
  writeRecentPicwishTemplates(userId, next);
  return next;
}

/**
 * 写入。
 *
 * ⚠️ 写失败时**只在控制台留痕，不向用户报错**。
 *    「最近使用」是锦上添花的便利功能，隐私模式下存不住是可预期的；
 *    为它弹一个错误提示会让用户以为自己的模板没选上。
 */
export function writeRecentPicwishTemplates(
  userId: string | null | undefined,
  items: RecentPicwishTemplate[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(items.slice(0, RECENT_PICWISH_TEMPLATE_LIMIT))
    );
  } catch (reason) {
    console.warn("[recent-picwish-templates] 写入失败，最近使用不会被保留", reason);
  }
}
