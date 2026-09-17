import { describe, expect, it } from "vitest";
import {
  getInspirationAvatarAlt,
  getInspirationAvatarUrl,
  hashInspirationSeed,
  normalizeInspirationIdentity,
} from "./inspiration-avatar";

/**
 * 灵感卡片虚拟头像的防护测试。
 *
 * 【这组测试真正要守住的事故】
 * 用户的原话是：「所有头像随机分布，但是不论在首页的灵感推荐板块或者是
 * 灵感推荐专题页内，每一个灵感推荐卡片的头像与灵感推荐的内容，必须保持一致，
 * 避免头像和内容在两个页面之间出现不一致，那样会很假。」
 *
 * 📌 这句话里的「随机」是指**看起来各不相同**，不是 `Math.random()`。
 * 一旦有人图省事换成真随机，界面上看不出任何异常（每张卡片确实都有头像），
 * 但同一条灵感在首页和专题页会是两张脸，刷新一次又换一张。
 * 所以这里的核心断言是「同样的内容 → 永远同一个 URL」。
 *
 * 另一个必须守住的是**身份键只能是 title**：
 * 首页数据来自本地 CSV（rank 是 CSV 名次，且渲染前被打乱），
 * 专题页来自远程接口（rank 是 1000+index 现编的），
 * imageUrl 在专题页还带 proxy 前缀 —— 两边唯一对得上的只有 title。
 */

describe("inspiration avatar identity", () => {
  it("returns the same avatar for the same title every time", () => {
    const first = getInspirationAvatarUrl("赛博朋克城市夜景");
    const second = getInspirationAvatarUrl("赛博朋克城市夜景");
    const third = getInspirationAvatarUrl("赛博朋克城市夜景");
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("keeps the avatar identical across home page and topic page data shapes", () => {
    // 首页条目：rank 来自 CSV 名次，imageUrl 是原始地址
    const homeItem = { rank: 7, title: "极简产品静物摄影", imageUrl: "https://cdn.example.com/a.jpg" };
    // 专题页同一条内容：rank 是 1000+index 现编的，imageUrl 带 proxy 前缀
    const topicItem = {
      rank: 1032,
      title: "极简产品静物摄影",
      imageUrl: "/api/inspiration/proxy?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg",
    };

    expect(getInspirationAvatarUrl(topicItem.title)).toBe(getInspirationAvatarUrl(homeItem.title));
    // 反面确认：如果当初拿 rank 当 key，两边必然不同 —— 这正是要避免的
    expect(String(homeItem.rank)).not.toBe(String(topicItem.rank));
  });

  it("gives visibly different avatars to different titles", () => {
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
    const urls = new Set(titles.map(getInspirationAvatarUrl));
    // 不要求 100% 互不相同（哈希分桶允许碰撞），但绝不能全都一样
    expect(urls.size).toBeGreaterThan(titles.length / 2);
  });

  it("normalizes whitespace and casing so near-identical titles share one avatar", () => {
    expect(normalizeInspirationIdentity("  Cyber City  ")).toBe("cyber city");
    expect(getInspirationAvatarUrl("  Cyber City  ")).toBe(getInspirationAvatarUrl("cyber city"));
  });

  it("never falls back to a photo-realistic human avatar style", () => {
    // 用户明确要求「不包含真人的头像」。
    // 这里遍历足够多的标题，确保所有分支落点都是非写实风格。
    const humanLikeStyles = ["personas", "avataaars", "micah", "lorelei", "notionists", "adventurer"];
    for (let index = 0; index < 200; index += 1) {
      const url = getInspirationAvatarUrl(`灵感标题-${index}`);
      for (const style of humanLikeStyles) {
        expect(url).not.toContain(`/${style}/`);
      }
    }
  });

  it("always produces a usable url even for empty or missing titles", () => {
    for (const input of ["", "   ", null, undefined]) {
      const url = getInspirationAvatarUrl(input as string | null | undefined);
      expect(url.startsWith("https://")).toBe(true);
      expect(url).toContain("seed=");
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

  it("describes the avatar as a creator avatar without exposing a clickable identity", () => {
    const alt = getInspirationAvatarAlt("赛博朋克城市夜景");
    expect(alt).toContain("赛博朋克城市夜景");
    expect(alt).toContain("头像");
  });
});
