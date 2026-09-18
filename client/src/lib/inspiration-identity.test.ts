import { describe, expect, it } from "vitest";
import {
  hashInspirationSeed,
  normalizeInspirationIdentity,
} from "./inspiration-identity";

/**
 * 灵感卡片身份键的防护测试。
 *
 * 【原来守的是什么、现在守的是什么】
 * 这组测试原本叫 `inspiration-avatar.test.ts`，守的是「同一条内容在两页是同一张脸」。
 * 头像已全站移除，但**身份键本身还在用**：点赞/收藏的计数与勾选态都靠它。
 *
 * 📌 所以断言从「同 title → 同头像 URL」重锚为「同 title → 同身份键/同哈希」。
 * ⚠️ 不能因为头像没了就把整组测试删掉 —— 那样身份键退化成随机或改用 rank 时，
 * 界面上看不出任何异常（每张卡片确实都有点赞数），
 * 但同一条灵感在首页和专题页会显示两个不同的数，刷新一次又变一次。
 */

describe("inspiration identity key", () => {
  it("returns the same identity for the same title every time", () => {
    const first = normalizeInspirationIdentity("赛博朋克城市夜景");
    const second = normalizeInspirationIdentity("赛博朋克城市夜景");
    const third = normalizeInspirationIdentity("赛博朋克城市夜景");
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("keeps the identity identical across home page and topic page data shapes", () => {
    // 首页条目：rank 来自 CSV 名次，imageUrl 是原始地址
    const homeItem = { rank: 7, title: "极简产品静物摄影", imageUrl: "https://cdn.example.com/a.jpg" };
    // 专题页同一条内容：rank 是 1000+index 现编的，imageUrl 带 proxy 前缀
    const topicItem = {
      rank: 1032,
      title: "极简产品静物摄影",
      imageUrl: "/api/inspiration/proxy?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg",
    };

    expect(normalizeInspirationIdentity(topicItem.title)).toBe(
      normalizeInspirationIdentity(homeItem.title)
    );
    // 反面确认：如果当初拿 rank 当 key，两边必然不同 —— 这正是要避免的
    expect(String(homeItem.rank)).not.toBe(String(topicItem.rank));
  });

  it("gives different hashes to different titles", () => {
    const titles = [
      "赛博朋克城市夜景",
      "极简产品静物摄影",
      "水彩风格植物插画",
      "复古胶片人像",
      "3D 等距小场景",
      "国潮海报设计",
      "未来感汽车渲染",
      "手绘绘本童话",
    ];
    const hashes = new Set(titles.map(title => hashInspirationSeed(normalizeInspirationIdentity(title))));
    // 不要求 100% 互不相同（哈希分桶允许碰撞），但绝不能全都一样
    expect(hashes.size).toBeGreaterThan(titles.length / 2);
  });

  it("normalizes whitespace and casing so near-identical titles share one identity", () => {
    expect(normalizeInspirationIdentity("  Cyber City  ")).toBe("cyber city");
    expect(hashInspirationSeed(normalizeInspirationIdentity("  Cyber City  "))).toBe(
      hashInspirationSeed(normalizeInspirationIdentity("cyber city"))
    );
  });

  it("always produces a usable identity even for empty or missing titles", () => {
    for (const input of ["", "   ", null, undefined]) {
      const identity = normalizeInspirationIdentity(input as string | null | undefined);
      expect(identity).toBe("");
      // 空身份也必须能算出哈希，不能抛错
      expect(Number.isInteger(hashInspirationSeed(identity))).toBe(true);
    }
  });

  it("produces a stable non-negative hash independent of call order", () => {
    const a = hashInspirationSeed("abc");
    hashInspirationSeed("zzzzzz");
    const b = hashInspirationSeed("abc");
    expect(b).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(a)).toBe(true);
  });
});
