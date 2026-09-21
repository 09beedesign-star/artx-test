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
 * 【网络失败怎么办 —— 「有内容」和「完全一致」可以同时成立】
 * ⚠️⚠️⚠️ 曾经以为这两者互斥，是因为两页的**降级路径不一样**：
 *   - 首页远程失败 → 退回本地 CSV，有内容；
 *   - 专题页远程失败 → `externalItems` 保持空数组 → **整页空态**。
 * 所以那种情况下根本不是「两页对不上」，而是**专题页什么都没有**。
 *
 * 📌 真正的解法不是二选一，而是**让降级也走同一个出口**：
 * 两页远程失败时都退回 `getInspirationFallbackFeed()` 返回的同一份数组。
 * 于是首页展示的是这份兜底的**子集**，专题页是它的**全集**，
 * 同一条内容在两页 title 完全相同 → 头像与计数依然一致。
 *
 * ⚠️ 成立的前提有两条，缺一条就静默失效：
 *   1. **CSV 的解析与映射只能有一份**（就在本文件里）。
 *      改之前首页 `loadInspirationRecommendations` 和专题页 `loadPromptItems`
 *      是两份重复代码，目前 title 口径恰好相同，但任何一边改一下
 *      就会让 title 漂移，两页又对不上，且**不会有任何报错**。
 *   2. **一致性不依赖顺序**。头像和计数都是 title 的纯函数，
 *      所以首页可以照旧洗牌，洗的是顺序不是身份。
 *
 * 📌 这个方案零存储、零新接口、不占服务器容量：CSV 早已打进前端 bundle。
 * ⚠️ 顺便记下为什么**没有**做「缓存上次远程结果」：远程 900 条 JSON 实测 1.6MB，
 * 精简成数组也要 805KB，塞 localStorage 既可能触顶又会挤掉画布数据，
 * 而它换来的只是降级时多几百条内容 —— 不值。
 */

import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "./api-base-url";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";

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

/* ------------------------------------------------------------------ *
 * 兜底数据源：本地 CSV
 *
 * ⚠️⚠️⚠️ 以下解析 + 分类 + 映射整段代码，**必须只有这一份**。
 * 它原本在 `HomePage.tsx`（`loadInspirationRecommendations`）和
 * `InspirationPage.tsx`（`loadPromptItems`）各写了一遍。
 * 两份重复实现当时 title 口径**恰好**相同，所以看不出问题 ——
 * 但只要有人在其中一边给 title 加个 trim / 前缀 / 兜底，
 * 降级时两页的头像和点赞数就会重新对不上，而且没有任何报错。
 * 📌 「一致」必须是结构上保证的，不能靠两份代码碰巧长得一样。
 * ------------------------------------------------------------------ */

/** 灵感分类树。⚠️ 专题页的筛选器直接消费它，改动会影响左侧分类可见性。 */
export const INSPIRATION_TAXONOMY: Record<string, string[]> = {
  行业品类: ["服装", "化妆品", "游戏", "母婴亲子", "美食饮品", "AI智能", "教育", "汽车相关", "3C数码", "医美纤体", "宠物广告", "家居美学", "运动户外"],
  品牌商业: ["商务视觉", "VI套件", "营销活动", "B端视觉设计", "UI设计", "陈列展示", "机制图设计"],
  风格美术: ["生活美学", "酸性视觉", "复古未来主义", "Vintage复古", "赛博美术", "美式嘻哈", "和风", "中国现代", "怪诞美学", "二次元"],
  人物角色: ["肖像特写", "AI角色设", "古装宫廷"],
  空间对象: ["工业概念", "概念设计", "建筑效果", "游戏道具"],
  图形技法: ["字体排版", "铅笔线描"],
  影像叙事: ["分镜脚本", "镜头提示词"],
  节庆文化: ["传统节庆", "国际节庆"],
  其他分类: ["其他"],
};

/** CSV 条目 → 分类。远程数据自带 group/subcategory，只有兜底需要现算。 */
export function classifyPromptItem(
  field: string,
  title: string,
  prompt: string
): { group: string; subcategory: string } {
  const text = `${field} ${title} ${prompt}`.toLowerCase();
  if (/logo/i.test(field)) return { group: "品牌商业", subcategory: "VI套件" };
  if (/ui|界面|dashboard|app/.test(text)) return { group: "品牌商业", subcategory: "UI设计" };
  if (/信息图|infographic|规格表|工程|指南|ar\s|数据|timeline/.test(text)) return { group: "品牌商业", subcategory: "机制图设计" };
  if (/广告|海报|poster|营销|youtube|thumbnail|社交媒体|产品营销/.test(text)) return { group: "品牌商业", subcategory: "营销活动" };
  if (/电商|主图|商品|产品摄影|香氛|蜡烛|饼干|牛奶|茶杯|腕表|太阳镜/.test(text)) return { group: "品牌商业", subcategory: "营销活动" };
  if (/时尚|服装|穿搭|lookbook|长裙|t恤|街头风|外套|fashion/.test(text)) return { group: "行业品类", subcategory: "服装" };
  if (/美妆|化妆|口红|护肤|香水/.test(text)) return { group: "行业品类", subcategory: "化妆品" };
  if (/美食|餐饮|咖啡|甜品|饮品|food/.test(text)) return { group: "行业品类", subcategory: "美食饮品" };
  if (/宠物|猫|狗|pet/.test(text)) return { group: "行业品类", subcategory: "宠物广告" };
  if (/家居|家具|室内软装|interior/.test(text)) return { group: "行业品类", subcategory: "家居美学" };
  if (/汽车|车|car|vehicle/.test(text)) return { group: "行业品类", subcategory: "汽车相关" };
  if (/3c|手机|数码|科技产品|gpt image|nano banana|ai\s/.test(text)) return { group: "行业品类", subcategory: "3C数码" };
  if (/教育|学习|课堂|whiteboard|learning/.test(text)) return { group: "行业品类", subcategory: "教育" };
  if (/IP|角色|机甲|手办|钥匙扣|character|portrait|人像|肖像/.test(text)) return { group: "人物角色", subcategory: "AI角色设" };
  if (/漫画|故事板|分镜|镜头|电影感|cinematic|movie|film/.test(text)) return { group: "影像叙事", subcategory: "分镜脚本" };
  if (/素描|线描|手绘|蜡笔|doodle|sketch|pencil/.test(text)) return { group: "图形技法", subcategory: "铅笔线描" };
  if (/字体|排版|typography|文字/.test(text)) return { group: "图形技法", subcategory: "字体排版" };
  if (/复古|retro|vintage|90 年代|90s/.test(text)) return { group: "风格美术", subcategory: "Vintage复古" };
  if (/二次元|anime|manga/.test(text)) return { group: "风格美术", subcategory: "二次元" };
  if (/奇幻|怪诞|surreal|fantasy/.test(text)) return { group: "风格美术", subcategory: "怪诞美学" };
  if (/建筑|空间|室内|arch/.test(text)) return { group: "空间对象", subcategory: "建筑效果" };
  if (/游戏|道具|game|sprite|terrain/.test(text)) return { group: "空间对象", subcategory: "游戏道具" };
  if (/足球|运动|户外|fitness|hiking/.test(text)) return { group: "行业品类", subcategory: "运动户外" };
  return { group: "其他分类", subcategory: "其他" };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuote) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuote = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function loadFallbackFeed(csv: string): InspirationFeedItem[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = rows[0] ?? [];
  const get = (record: string[], key: string) => record[header.indexOf(key)]?.trim() ?? "";

  return rows
    .slice(1)
    .filter(record => record.length > 1)
    .map(record => {
      const field = get(record, "field");
      const title = get(record, "title");
      const prompt = get(record, "prompt");
      const category = classifyPromptItem(field, title, prompt);
      return {
        rank: Number(get(record, "rank")) || 0,
        group: category.group,
        subcategory: category.subcategory,
        field,
        model: get(record, "model"),
        title,
        description: get(record, "description"),
        prompt,
        imageUrl: get(record, "image_url"),
        author: get(record, "author"),
      };
    })
    .filter(item => item.title && item.imageUrl);
}

/** 模块级只解析一次。CSV 有 288 条、74KB，重复解析纯属浪费。 */
const FALLBACK_FEED = loadFallbackFeed(promptCsv);

/**
 * 远程失败时两页共用的兜底数据。
 *
 * ⚠️⚠️ 返回的是**同一份数组的浅拷贝**，不是「首页一份、专题页另一份」。
 * 两页拿到的 title 完全相同，所以降级状态下头像与点赞数**依然一致** ——
 * 这正是「既有内容又完全一致」的实现方式。
 *
 * ⚠️ 必须返回拷贝：首页会对结果洗牌（`sort`原地改数组），
 * 直接返回模块级数组会把专题页的顺序一起搅乱。
 */
export function getInspirationFallbackFeed(): InspirationFeedItem[] {
  return [...FALLBACK_FEED];
}
