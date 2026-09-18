import { describe, expect, it } from "vitest";

import {
  getInspirationFavoriteBaseCount,
  getInspirationLikeBaseCount,
  getInspirationViewBaseCount,
} from "./inspiration-metrics";
import { getDisplayLikeCount } from "./inspiration-reactions";

/**
 * 灵感卡片展示计数的确定性防护。
 *
 * 【用户的硬约束】
 * 「同一个灵感卡片的头像和点赞数在两页都要一致」+「点赞收藏之后都要有增加数值」。
 *
 * 📌 这里全是**纯函数行为测试**（真的调函数、真的比数值），
 * 不是读源码文本 —— 所以不存在「断言看不到源码」那类恒绿。
 */
describe("灵感计数：确定性", () => {
  const TITLES = [
    "产品营销 - 生成式盆景展览海报",
    "GPT Image 2 3D Social Profile Card Diorama",
    "赛博朋克霓虹街景",
    "Minimal Brand Identity Mockup",
  ];

  it("同一标题多次调用返回同一个数（这是两页一致的根本前提）", () => {
    for (const title of TITLES) {
      const first = getInspirationLikeBaseCount(title);
      for (let round = 0; round < 20; round += 1) {
        expect(getInspirationLikeBaseCount(title)).toBe(first);
      }
    }
  });

  it("大小写与首尾空白不影响结果（两页数据源的标题可能有空白差异）", () => {
    const base = getInspirationLikeBaseCount("Neon City Poster");
    expect(getInspirationLikeBaseCount("  neon city poster  ")).toBe(base);
    expect(getInspirationFavoriteBaseCount("  NEON CITY POSTER")).toBe(
      getInspirationFavoriteBaseCount("neon city poster")
    );
  });

  it("不同标题会落到不同的数（否则所有卡片数字一样，一眼假）", () => {
    const counts = new Set(TITLES.map(getInspirationLikeBaseCount));
    expect(counts.size).toBe(TITLES.length);
  });

  /**
   * ⚠️⚠️ 这条守的是 `pickFromSeed` 必须用**循环移位**而不是 `>>>`。
   * `seed >>> 20` 只剩 12 位（最多 4096 种取值），而浏览数区间跨度 79001，
   * 于是 `segment % span === segment`，映射退化成「从 VIEW_MIN 线性递增」——
   * 所有卡片的浏览数都会挤在区间最低端（20000~24095），
   * 而且**不会报任何错**，只是看起来「怎么大家浏览量都差不多」。
   */
  it("浏览数要铺满整个区间，不能挤在低端（防位移丢熵）", () => {
    const samples = Array.from({ length: 400 }, (_, index) =>
      getInspirationViewBaseCount(`sample-title-${index}`)
    );
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    // 区间 [20000, 99000]，跨度 79001。若退化成线性，max 不会超过 20000+4096。
    expect(max).toBeGreaterThan(80000);
    expect(min).toBeLessThan(40000);
  });

  /**
   * 点赞数与收藏数必须取 seed 的**不同位段**，否则会出现
   * 「点赞数大的那张收藏数也一定大」的强相关，一眼就看出是算出来的。
   *
   * ⚠️ 这里用**皮尔逊相关系数**直接度量线性相关，而不是「相邻样本同向率」。
   * 第一版写的是同向率，用 200 个形如 `corr-0`…`corr-199` 的连续标题，
   * 实测 0.256 触发假警报。独立量化后（皮尔逊 -0.0067、
   * 随机标题同向率 0.4956）确认两段其实完全独立 ——
   * 📌 是**样本有偏**（标题高度相似 + 量太小），不是实现有问题。
   * 「测出判据失效时先怀疑样本无效」，这条就是实例。
   */
  it("点赞数与收藏数不能线性相关（防两者取同一段比特）", () => {
    const size = 4000;
    const likes: number[] = [];
    const favorites: number[] = [];
    for (let index = 0; index < size; index += 1) {
      // 加入非连续、结构差异大的标题，避免样本本身带规律
      const title = `${index}-${(index * 7919).toString(36)}-灵感-${index % 13}`;
      likes.push(getInspirationLikeBaseCount(title));
      favorites.push(getInspirationFavoriteBaseCount(title));
    }
    const meanLike = likes.reduce((a, b) => a + b, 0) / size;
    const meanFav = favorites.reduce((a, b) => a + b, 0) / size;
    let cov = 0;
    let varLike = 0;
    let varFav = 0;
    for (let index = 0; index < size; index += 1) {
      cov += (likes[index] - meanLike) * (favorites[index] - meanFav);
      varLike += (likes[index] - meanLike) ** 2;
      varFav += (favorites[index] - meanFav) ** 2;
    }
    const pearson = cov / Math.sqrt(varLike * varFav);
    // 独立时应接近 0。阈值 0.1 是量出来的（实测 |r| < 0.02），不是拍的。
    expect(Math.abs(pearson)).toBeLessThan(0.1);
  });

  it("量级关系符合常识：浏览 > 点赞 > 收藏（防出现赞比看还多）", () => {
    for (let index = 0; index < 300; index += 1) {
      const title = `scale-${index}`;
      expect(getInspirationViewBaseCount(title)).toBeGreaterThan(
        getInspirationLikeBaseCount(title)
      );
      expect(getInspirationLikeBaseCount(title)).toBeGreaterThan(
        getInspirationFavoriteBaseCount(title)
      );
    }
  });

  it("空标题不炸，且落在合法区间内", () => {
    for (const empty of ["", "   ", null, undefined]) {
      const like = getInspirationLikeBaseCount(empty);
      expect(Number.isFinite(like)).toBe(true);
      expect(like).toBeGreaterThanOrEqual(1000);
      expect(like).toBeLessThanOrEqual(10000);
    }
  });

  /**
   * 用户原话：「点赞或者收藏之后都要有增加数值」。
   * 这条把「基数确定 + 我这一票」合起来验一次端到端。
   */
  it("点赞后展示值 = 基数 + 1，取消后回到基数", () => {
    const title = "产品营销 - 生成式盆景展览海报";
    const base = getInspirationLikeBaseCount(title);
    expect(getDisplayLikeCount(base, false)).toBe(base);
    expect(getDisplayLikeCount(base, true)).toBe(base + 1);

    const favBase = getInspirationFavoriteBaseCount(title);
    expect(getDisplayLikeCount(favBase, true)).toBe(favBase + 1);
  });
});
