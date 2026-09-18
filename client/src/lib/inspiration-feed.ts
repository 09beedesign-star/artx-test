/**
 * 灵感内容的**远程数据源唯一事实源**。
 *
 * 【为什么要有这个文件】
 * ⚠️⚠️⚠️ 改之前，首页和专题页读的是**两套零重叠的数据**：
 *   - 首页：本地 CSV `ai_image_prompt_rank_50.csv`，288 条，标题全中文；
 *   - 专题页：远程 `/api/inspiration/references`，900 条，标题以英文为主。
 * 线上实测：拿首页第一条标题去远程 900 条里查，匹配结果是 `false`。
 *
 * 📌 这意味着用户要的「同一个灵感卡片的头像和点赞数在两页一致」
 * 在当时**技术上无法成立** —— 两页根本没有同一条内容。
 * 头像函数本身没错（它是 title 的纯函数），错的是喂给它的 title 来自两个宇宙。
 *
 * ⚠️ 注意这类缺陷的伪装性：两页各自看起来都很正常，头像各自也很稳定，
 * 只有把两页并排比对才会发现对不上，**不会有任何报错**。
 *
 * 【为什么不是反过来让专题页读 CSV】
 * CSV 只有 288 条，专题页要展示 900 条，降到 CSV 等于砍掉三分之二内容。
 * 反之首页只展示前 50 条，用远程数据完全够。
 *
 * 【网络失败怎么办 —— 首页是落地页，不能白屏】
 * 所以这里保留本地 CSV 作**兜底**，而不是删掉：
 *   - 远程成功 → 两页同源，头像与计数天然一致（用户的目标）；
 *   - 远程失败 → 首页退回 CSV 有内容可看，只是这一次与专题页对不上。
 * 📌 「一致」是目标，「有内容」是底线，两者冲突时先保底线。
 */

import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "./api-base-url";

/** 后端 `/api/inspiration/references` 单条返回结构。 */
export type InspirationReference = {
  id: string;
  group: string;
  subcategory: string;
  imageUrl: string;
  proxyImageUrl: string;
  title: string;
  prompt: string;
  stylePromptEn: string;
};

/** 两页共用的灵感条目结构。 */
export type InspirationFeedItem = {
  rank: number;
  group: string;
  subcategory: string;
  field: string;
  model: string;
  title: string;
  description: string;
  prompt: string;
  imageUrl: string;
  author: string;
  isExternal?: boolean;
};

/** 专题页一次性拉取的条数上限，与后端数据量对齐。 */
export const INSPIRATION_TARGET_COUNT = 900;

export function getInspirationApiBaseUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return normalizeApiBaseUrl(
    env.VITE_API_BASE_URL || env.VITE_TEST_BACKEND_URL || defaultApiBaseUrlForCurrentHost("")
  );
}

/**
 * 远程 reference → 统一条目。
 *
 * ⚠️⚠️ 这个映射**必须只有一份**。改之前它在三个文件里各写了一遍
 * （`InspirationPage.tsx`、`InspirationPromptDialog.tsx`、以及首页自己的 CSV 映射），
 * 任何一处口径漂移（尤其是 `title`）都会让头像和计数在页面之间对不上，且不报错。
 *
 * ⚠️ `rank` 是 `1000 + index` 现编的，**只能当 React key 用，绝不能当身份键**：
 * 同一条内容在不同请求/不同筛选下 index 会变。身份键只能是 title。
 */
export function toInspirationFeedItem(
  reference: InspirationReference,
  index: number,
  apiBase: string
): InspirationFeedItem {
  const imageUrl =
    reference.proxyImageUrl.startsWith("/") && apiBase
      ? `${apiBase}${reference.proxyImageUrl}`
      : reference.proxyImageUrl;
  return {
    rank: 1000 + index,
    group: reference.group || "其他分类",
    subcategory: reference.subcategory || "其他",
    field: reference.subcategory || reference.group || "外部灵感",
    model: "ArtX",
    title: reference.title,
    description: `灵感提示词描述 · ${reference.group} / ${reference.subcategory}`,
    prompt: reference.prompt || reference.stylePromptEn,
    imageUrl,
    author: "ArtX",
    isExternal: true,
  };
}

/**
 * 拉取远程灵感列表。
 *
 * @param signal 传入 AbortController 的 signal；调用方卸载时必须 abort。
 * @returns 统一条目数组。⚠️ 失败时**抛错**而不是返回空数组 ——
 *   返回空数组会让调用方分不清「真的没有内容」和「请求失败了」，
 *   首页就没法判断该不该切兜底。
 */
export async function fetchInspirationFeed(
  signal?: AbortSignal,
  limit: number = INSPIRATION_TARGET_COUNT
): Promise<InspirationFeedItem[]> {
  const apiBase = getInspirationApiBaseUrl();
  const endpoint = `${apiBase}/api/inspiration/references?limit=${limit}&verifiedPromptOnly=1`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { references?: InspirationReference[] };
  const references = Array.isArray(payload.references) ? payload.references : [];
  return references.map((reference, index) => toInspirationFeedItem(reference, index, apiBase));
}
