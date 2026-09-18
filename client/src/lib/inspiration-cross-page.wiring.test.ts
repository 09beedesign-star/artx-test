import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 相对路径，不用 @shared 别名：vitest 不解析它，写别名会让整个套件
//    加载失败并显示「0 test」—— 不是失败，是压根没跑。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../shared/strip-source-comments";

/**
 * 「首页与灵感专题页跨页一致」的接线防护。
 *
 * 【用户的硬约束】
 * 「同一个灵感卡片的头像和点赞数在两页都要一致，这是最终目标。」
 *
 * 【为什么光有纯函数测试不够】
 * `inspiration-avatar.ts` 和 `inspiration-metrics.ts` 都是纯函数，
 * 各自的单测早就全绿了 —— 但线上两页头像照样对不上。
 *
 * ⚠️⚠️⚠️ 根因不在算法，在**喂给算法的 title 来自两个不同的数据源**：
 * 首页读本地 CSV（288 条中文标题），专题页读远程接口（900 条英文标题为主）。
 * 线上实测：首页第一条标题去远程 900 条里查，结果是 `false`（零重叠）。
 *
 * 📌 所以「一致」这件事**没有任何纯函数测试能守住**，只能守接线：
 * 两页必须调同一个取数函数。这就是本文件存在的理由。
 */

const HOME_PATH = resolve(__dirname, "../pages/HomePage.tsx");
const INSPIRATION_PATH = resolve(__dirname, "../pages/InspirationPage.tsx");
const FEED_PATH = resolve(__dirname, "./inspiration-feed.ts");

function readCode(path: string, maxLossRatio = 0.3): string {
  const raw = readFileSync(path, "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

/**
 * 从源码里切出一段区间再断言。
 *
 * ⚠️⚠️ 必须**抛错**而不是返回空串：空串会让区间内所有 `not.toContain` 恒绿
 * （静默失守），而且「切片没切到」和「区间里确实没有这串」输出一模一样。
 */
function sliceBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  minLength = 120
): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`切片起点不存在：${startMarker}（实现可能已重命名）`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切片终点不存在：${endMarker}`);
  const block = source.slice(start, end);
  if (block.length < minLength) {
    throw new Error(`切片过短（${block.length} 字符），区间多半不对`);
  }
  return block;
}

describe("跨页一致：两页必须消费同一个远程数据源", () => {
  it("首页调用了共享取数函数 fetchInspirationFeed", () => {
    const home = readCode(HOME_PATH);
    expect(home).toContain("fetchInspirationFeed(controller.signal)");
  });

  it("专题页调用了同一个共享取数函数", () => {
    const page = readCode(INSPIRATION_PATH);
    expect(page).toContain("fetchInspirationFeed(controller.signal, INSPIRATION_TARGET_COUNT)");
  });

  /**
   * ⚠️⚠️ 只断言「两页都调了 fetchInspirationFeed」是不够的 ——
   * 我能在不触碰那个字符串的前提下把 bug 改回来：
   * 只要专题页自己再写一份 `fetch(".../references")` 并覆盖 state 即可。
   * 所以这里补一条反向断言：两页都不许自己拼接口 URL。
   */
  it("两页都不许绕过共享模块自己拼接口 URL", () => {
    const home = readCode(HOME_PATH);
    const page = readCode(INSPIRATION_PATH);
    for (const code of [home, page]) {
      expect(code).not.toContain("/api/inspiration/references");
      expect(code).not.toContain("verifiedPromptOnly");
    }
  });

  /**
   * 首页的本地 CSV 只能当兜底，不能重新变回主数据源。
   * ⚠️ 这条守的是一个非常容易的倒退：有人为了「首屏快一点」
   * 把主数据源改回 CSV，两页立刻又对不上，而且不报错。
   */
  it("首页 CSV 只用于兜底函数，不能直接喂给列表 state", () => {
    const home = readCode(HOME_PATH);
    const fallbackBlock = sliceBetween(
      home,
      "function createHomeInspirationFallbackFeed",
      "const getStageScale"
    );
    expect(fallbackBlock).toContain("INSPIRATION_RECOMMENDATIONS");

    // CSV 常量只允许出现在「定义」和「兜底函数」两处，多一处就是有人又拿它当主源了
    const occurrences = home.split("INSPIRATION_RECOMMENDATIONS").length - 1;
    expect(occurrences).toBe(2);
  });

  /**
   * 远程接管后不许被重洗回兜底。
   * ⚠️ 倒退场景：登录成功的 effect 无条件重洗列表，
   * 于是「登录前一致 → 登录后不一致」，零报错。
   */
  it("登录后重洗列表前必须先判远程是否已接管", () => {
    const home = readCode(HOME_PATH);
    const loginBlock = sliceBetween(
      home,
      "setLoginBubble(null);",
      "}, [isAuthenticated]);"
    );
    expect(loginBlock).toContain("if (remoteInspirationLoadedRef.current) return;");
  });
});

describe("计数：必须是确定性基数，不能是随机数", () => {
  it("首页浏览数与点赞数都走哈希基数", () => {
    const home = readCode(HOME_PATH);
    const metricsBlock = sliceBetween(
      home,
      "function withInspirationMetrics",
      "function createHomeInspirationFallbackFeed"
    );
    expect(metricsBlock).toContain("getInspirationViewBaseCount(item.title)");
    expect(metricsBlock).toContain("getInspirationLikeBaseCount(item.title)");
    // 反向：这个函数体内一旦出现随机数，确定性立刻失效
    expect(metricsBlock).not.toContain("Math.random");
  });

  it("首页不许再有生成随机计数的函数", () => {
    const home = readCode(HOME_PATH);
    expect(home).not.toContain("randomInspirationMetric");
  });

  /**
   * 用户原话：「点赞收藏数的数值，记得要让用户点赞或者收藏之后都要有增加数值」。
   * 改之前专题页卡片的点赞按钮**根本没传 count**（只有一颗心，没数字）。
   */
  it("专题页卡片的点赞按钮传了 count", () => {
    const page = readCode(INSPIRATION_PATH);
    const slotBlock = sliceBetween(page, "reactionSlot={", "</section>", 200);
    expect(slotBlock).toContain("count={getDisplayLikeCount(");
    expect(slotBlock).toContain("getInspirationLikeBaseCount(item.title)");
  });

  it("专题页详情浮窗的收藏按钮也传了 count（改之前全站没有收藏数）", () => {
    const page = readCode(INSPIRATION_PATH);
    const favoriteBlock = sliceBetween(
      page,
      'kind="favorite"',
      'onToggle={() =>\n                    inspirationReactions.toggle("favorite"',
      120
    );
    expect(favoriteBlock).toContain("getInspirationFavoriteBaseCount(selectedItem.title)");
  });
});

describe("身份键：两页都必须用 title，不能用 rank / index", () => {
  it("共享映射把 rank 标成仅供 key 使用", () => {
    /*
     * 【为什么这里放宽到 0.45】
     * 默认 0.3 拦下了它。⚠️ 没取证就放宽 = 亲手把闸门焊死，所以按两步验过：
     * 1. 用独立脚本逐行数真注释：注释行 47/121 = 38.8%，注释字符占比 37.0%，
     *    与剥离器量到的 37.0% **完全吻合** → 是真注释多（这文件全是判据说明），
     *    不是 "image/*" 那类字符串把代码吃掉了；
     * 2. 逐个验本条用到的锚点剥离前后次数一致：
     *    `rank: 1000 + index` 1→1、`toInspirationFeedItem` 2→2、
     *    `fetchInspirationFeed` 1→1、`proxyImageUrl` 4→4。
     * 📌 只给这一个调用点传参，**绝不改默认值**。
     */
    const feed = readCode(FEED_PATH, 0.45);
    // rank 是 1000 + index 现编的，绝不能当身份键
    expect(feed).toContain("rank: 1000 + index");
  });

  it("两页的点赞身份键都走 normalizeInspirationIdentity(title)", () => {
    const home = readCode(HOME_PATH);
    const page = readCode(INSPIRATION_PATH);
    expect(home).toContain("normalizeInspirationIdentity(item.title)");
    expect(page).toContain("normalizeInspirationIdentity(item.title)");
    // 反向：不许拿 rank 或 id 当反应身份键
    expect(home).not.toContain('toggle("like", { id: item.rank');
    expect(page).not.toContain("isActive(\"like\", item.rank");
  });
});
