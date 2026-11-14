/**
 * 创作历史「色彩标签」—— 常量与纯函数（无 IndexedDB / DOM 依赖，便于单测）。
 *
 * 🔒 2026-11-14 用户硬性要求：
 *   - 六种颜色的标签，每种颜色的名称可编辑；
 *   - 标签显示在图片左上角，可取消；
 *   - **所有色彩标签仅在创作历史界面中可以看到**。
 *
 * ⚠️ 因此本模块只被 CreationHistoryPage 与创作历史本地存储层引用：
 *    标签配置存 `artx-creation-history` 库的 settings store（不进云同步），
 *    标签分配写在记录自身的 tagIds 字段里，**画布 / 社区 / 其他页面一律不读不渲染**。
 */

export const CREATION_HISTORY_TAG_COLORS = [
  { id: "red", name: "红色", hex: "#E5484D", fg: "#ffffff" },
  { id: "orange", name: "橙色", hex: "#F2792B", fg: "#ffffff" },
  { id: "yellow", name: "黄色", hex: "#E8B931", fg: "#161616" },
  { id: "green", name: "绿色", hex: "#2E9E6B", fg: "#ffffff" },
  { id: "blue", name: "蓝色", hex: "#3B7DDD", fg: "#ffffff" },
  { id: "purple", name: "紫色", hex: "#8B5CC7", fg: "#ffffff" },
] as const;

export type TagColorId = (typeof CREATION_HISTORY_TAG_COLORS)[number]["id"];
export type TagNames = Record<TagColorId, string>;

export const TAG_COLOR_IDS: TagColorId[] = CREATION_HISTORY_TAG_COLORS.map(
  color => color.id as TagColorId,
);

/** 标签名最长字符数：卡片左上角空间有限，超了会顶掉图片。 */
export const TAG_NAME_MAX_LENGTH = 12;

export const DEFAULT_TAG_NAMES: TagNames = CREATION_HISTORY_TAG_COLORS.reduce(
  (acc, color) => ({ ...acc, [color.id]: color.name }),
  {} as TagNames,
);

const VALID_IDS = new Set<string>(TAG_COLOR_IDS);

export function isTagColorId(value: unknown): value is TagColorId {
  return typeof value === "string" && VALID_IDS.has(value);
}

export function tagColor(colorId: TagColorId) {
  return CREATION_HISTORY_TAG_COLORS.find(color => color.id === colorId) ?? CREATION_HISTORY_TAG_COLORS[0];
}

/** 脏数据 / 老记录里的 tagIds 一律收敛成合法且去重的有序数组。 */
export function normalizeTagIds(raw: unknown): TagColorId[] {
  if (!Array.isArray(raw)) return [];
  const out: TagColorId[] = [];
  for (const id of raw) {
    if (isTagColorId(id) && !out.includes(id)) out.push(id);
  }
  return TAG_COLOR_IDS.filter(id => out.includes(id));
}

/** 逐字段回落：任何一格坏掉都不该让整套标签名失效。 */
export function normalizeTagNames(raw: unknown): TagNames {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TAG_NAMES };
  for (const id of TAG_COLOR_IDS) {
    const value = source[id];
    if (typeof value === "string" && value.trim()) {
      out[id] = value.trim().slice(0, TAG_NAME_MAX_LENGTH);
    }
  }
  return out;
}

/**
 * 给一条记录切换某个颜色标签：已有则移除（= 取消标签），没有则追加。
 * 用泛型而非 import CreationHistoryRecord，避免与 core 形成循环依赖。
 */
export function toggleRecordTag<T extends { tagIds?: TagColorId[] }>(
  record: T,
  colorId: TagColorId,
): T {
  const current = normalizeTagIds(record.tagIds);
  const next = current.includes(colorId)
    ? current.filter(id => id !== colorId)
    : normalizeTagIds([...current, colorId]);
  return { ...record, tagIds: next.length ? next : undefined };
}

/** 清空一条记录的全部色彩标签。 */
export function clearRecordTags<T extends { tagIds?: TagColorId[] }>(record: T): T {
  return { ...record, tagIds: undefined };
}

/** 各颜色当前被多少张图片使用（右侧面板的计数）。 */
export function countTaggedRecords(
  records: ReadonlyArray<{ tagIds?: TagColorId[] }>,
): Record<TagColorId, number> {
  const counts = TAG_COLOR_IDS.reduce(
    (acc, id) => ({ ...acc, [id]: 0 }),
    {} as Record<TagColorId, number>,
  );
  for (const record of records) {
    for (const id of normalizeTagIds(record.tagIds)) counts[id] += 1;
  }
  return counts;
}
