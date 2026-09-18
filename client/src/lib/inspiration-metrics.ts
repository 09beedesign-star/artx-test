/**
 * 灵感卡片的展示计数（浏览数 / 点赞数 / 收藏数）——**确定性映射的唯一事实源**。
 *
 * 【用户的硬约束】
 * 「同一个灵感卡片的头像和点赞数在两页都要一致，这是最终目标，
 *   帮我按照这个目标找寻最稳定，最不占服务器容量的解决办法。」
 *
 * 【为什么不是存数据库】
 * 真实累计计数需要：新建表/新 key + 写接口 + 每次渲染拉取 + 并发自增。
 * ⚠️ 而 `PostgresJsonDocumentStore.save()` 是整文档 UPSERT 覆盖、无行级锁，
 * 拿它做高频自增计数天然带竞态（后写的整份抹掉先写的，且零报错）。
 * 📌 所以这里选**纯函数**方案：title → 哈希 → 固定基数。
 * 零存储、零新接口、零网络请求、零并发风险 —— 这就是「最稳定 + 最不占服务器容量」。
 *
 * 【为什么原来的做法是错的】
 * 首页原本用 `Math.floor(1000 + Math.random() * 9001)` 现算计数：
 *   - 同一张卡片在首页和专题页数不一样；
 *   - 同一张卡片刷新一次数就变；
 *   - 用户点赞 +1 完全没有意义，因为基数本身每次都在跳。
 * ⚠️⚠️ 随机数的致命之处是**它不报错**，看起来一直在正常工作。
 *
 * 【身份键为什么只能是 title】
 * 与 `inspiration-avatar.ts` 完全同一套理由：rank 在两页是不同来源现编的，
 * imageUrl 在专题页带 proxy 前缀。**唯一跨页稳定的标识就是 title。**
 * 📌 所以这里直接复用 `normalizeInspirationIdentity` + `hashInspirationSeed`，
 * 不另起一套哈希 —— 否则就是「同一份逻辑的多个出口」，迟早对不上。
 */

import { hashInspirationSeed, normalizeInspirationIdentity } from "./inspiration-avatar";

/** 点赞数区间。跟原来的随机区间保持一致，避免线上数量级突变被用户察觉成 bug。 */
const LIKE_MIN = 1000;
const LIKE_MAX = 10000;

/**
 * 收藏数区间。
 *
 * 📌 刻意比点赞数低一个量级：真实产品里「收藏」永远比「点赞」门槛高、数量少。
 * 若两者同区间，用户一眼就能看出这两个数字是编的。
 *
 * ⚠️⚠️ 上限必须**严格小于** `LIKE_MIN`（1000），不能只是「平均更低」。
 * 区间一旦重叠，就会出现具体某张卡「收藏 1103 > 点赞 1045」的穿帮 ——
 * 这是测试实测抓到的：原来写 1600 时 300 个样本里立刻有反例。
 * 📌 「整体量级更低」和「每一条都更低」是两回事，用户看到的永远是具体某一条。
 */
const FAVORITE_MIN = 80;
const FAVORITE_MAX = 960;

/**
 * 浏览数区间。
 *
 * 📌 必须**整体高于点赞数上限**（10000），否则会出现「赞比看还多」的穿帮。
 * ⚠️ 也刻意不取到百万级：这个数字在卡片上是**裸数字直出**，
 * 位数一多就会挤压右侧的点赞按钮，属于改计数顺手改坏布局。
 */
const VIEW_MIN = 20000;
const VIEW_MAX = 99000;

/**
 * 把一个 32 位 seed 的指定位段映射到 [min, max] 闭区间。
 *
 * ⚠️⚠️ `shift` 是关键：三个计数必须取 seed 的**不同位段**。
 * 若都用同一段，会出现「点赞数大的那张收藏数也一定大」的强相关，
 * 区间长度相近时甚至直接相等 —— 一眼假。
 *
 * ⚠️⚠️⚠️ 这里必须用**循环移位**而不是 `>>>`。
 * `seed >>> 20` 只剩 12 位 = 最多 4096 种取值，而浏览数区间跨度 79001，
 * 于是 `segment % span === segment`，映射退化成「从 min 开始线性递增」，
 * 整个哈希被废掉，且**完全不报错**，只是所有卡片的数字挤在区间最低端。
 * 循环移位把高位挪到低位、低位补到高位，32 位熵一位不丢。
 */
function pickFromSeed(seed: number, shift: number, min: number, max: number): number {
  const span = max - min + 1;
  const normalized = seed >>> 0;
  const rotated =
    shift === 0 ? normalized : ((normalized >>> shift) | (normalized << (32 - shift))) >>> 0;
  return min + (rotated % span);
}

/**
 * 取某条灵感内容的点赞基数。
 *
 * @param title 灵感卡片标题，**跨页面唯一稳定的身份键**
 */
export function getInspirationLikeBaseCount(title: string | null | undefined): number {
  const identity = normalizeInspirationIdentity(title);
  return pickFromSeed(hashInspirationSeed(identity), 0, LIKE_MIN, LIKE_MAX);
}

/**
 * 取某条灵感内容的收藏基数。
 *
 * ⚠️ 用 seed 的中位段（>>> 11），与点赞数（低位）、浏览数（高位）互不重叠。
 */
export function getInspirationFavoriteBaseCount(title: string | null | undefined): number {
  const identity = normalizeInspirationIdentity(title);
  return pickFromSeed(hashInspirationSeed(identity), 11, FAVORITE_MIN, FAVORITE_MAX);
}

/**
 * 取某条灵感内容的浏览基数。
 *
 * ⚠️ 用 seed 的高位段（>>> 20）。
 */
export function getInspirationViewBaseCount(title: string | null | undefined): number {
  const identity = normalizeInspirationIdentity(title);
  return pickFromSeed(hashInspirationSeed(identity), 20, VIEW_MIN, VIEW_MAX);
}
