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
  it("首页兜底必须走共享出口，且两页都不许自己解析 CSV", () => {
    const home = readCode(HOME_PATH);
    const page = readCode(INSPIRATION_PATH);

    const fallbackBlock = sliceBetween(
      home,
      "function createHomeInspirationFallbackFeed",
      "const getStageScale"
    );
    expect(fallbackBlock).toContain("getInspirationFallbackFeed()");

    /*
     * ⚠️⚠️⚠️ 这是「远程挂掉时两页仍然一致」的结构性保证。
     * 改之前两页各写了一份 CSV 解析（`parseCsv` + `loadXxx`），
     * 当时 title 口径**碰巧**相同所以看不出问题 —— 但只要有一边
     * 给 title 加个 trim / 前缀，降级时两页头像和点赞数就重新对不上，
     * 而且不会有任何报错。
     * 📌 一致必须由「只有一份实现」来保证，不能靠两份代码长得一样。
     */
    for (const code of [home, page]) {
      expect(code).not.toContain("function parseCsv");
      expect(code).not.toContain("csv?raw");
    }
  });

  /**
   * 远程失败 / 返回空时，专题页必须退到与首页同一份兜底。
   *
   * ⚠️⚠️⚠️ 改之前这里只打一条 warn 就什么都不做，`externalItems` 停在空数组，
   * 于是专题页**整页空态**。那不是「两页对不上」，是「一页什么都没有」。
   * 这条断言守的就是这个分支不能再退化成只打日志。
   */
  it("专题页远程失败与空结果都必须退回共享兜底", () => {
    const page = readCode(INSPIRATION_PATH);
    const fetchBlock = sliceBetween(
      page,
      "fetchInspirationFeed(controller.signal, INSPIRATION_TARGET_COUNT)",
      "return () => controller.abort();",
      200
    );
    // 失败分支
    expect(fetchBlock).toContain("setExternalItems(getInspirationFallbackFeed())");
    // 空结果分支：200 但没数据，后果和失败一样
    expect(fetchBlock).toContain("items.length > 0 ? items : getInspirationFallbackFeed()");
  });

  /**
   * 兜底数组必须是拷贝。
   * ⚠️ 首页会对它洗牌（sort 原地改数组），直接返回模块级数组
   * 会把专题页的顺序一起搅乱 —— 表现为「刷新首页，专题页顺序也变了」。
   */
  it("共享兜底返回的是拷贝而不是模块级数组本身", () => {
    const feed = readCode(FEED_PATH, 0.45);
    const block = sliceBetween(
      feed,
      "export function getInspirationFallbackFeed",
      "\n}",
      20
    );
    expect(block).toContain("[...FALLBACK_FEED]");
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

  /**
   * 用户追加要求：「详情也需要加上补充」。
   * ⚠️ 改之前首页详情浮窗只有「复制 / 关闭」两个按钮，
   * 用户点开大图想点赞必须退回去点卡片上的小图标。
   */
  it("首页详情浮窗有点赞和收藏，且基数与专题页同函数", () => {
    const home = readCode(HOME_PATH);
    const dialogBlock = sliceBetween(
      home,
      "selectedHomeInspiration && (",
      "复制提示词",
      200
    );
    expect(dialogBlock).toContain('kind="like"');
    expect(dialogBlock).toContain('kind="favorite"');
    expect(dialogBlock).toContain("getInspirationLikeBaseCount(selectedHomeInspiration.title)");
    expect(dialogBlock).toContain("getInspirationFavoriteBaseCount(selectedHomeInspiration.title)");
    /*
     * ⚠️ 反向：收藏不许复用点赞基数。
     * 若两处都写 LikeBaseCount，点赞数和收藏数会永远相等 ——
     * 看起来"有数字"但明显是假的，且不报错。
     */
    const favoriteSlice = dialogBlock.slice(dialogBlock.indexOf('kind="favorite"'));
    expect(favoriteSlice).not.toContain("getInspirationLikeBaseCount");
  });

  /**
   * 两页的收藏快照字段必须同口径。
   * ⚠️ 首页原来把 `item.field` 同时塞给 group 和 subcategory，
   * 于是同一条内容从首页收藏、从专题页收藏，进个人中心后分类标签不一样。
   */
  it("首页收藏快照用 toReactionItem 且不再把 field 当 group", () => {
    const home = readCode(HOME_PATH);
    expect(home).toContain("group: item.group");
    expect(home).toContain("subcategory: item.subcategory");
    expect(home).not.toContain("group: item.field");
    expect(home).not.toContain("subcategory: item.field");
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
