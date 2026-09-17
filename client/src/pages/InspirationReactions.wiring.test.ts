import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../shared/strip-source-comments";

/**
 * 点赞 / 收藏 / 虚拟头像「三处接线」的防护测试。
 *
 * 【为什么要扫源码而不是只测纯函数】
 * 本项目踩过一次（`32a6561`）：纯函数测得再全，只要**没人调用它**，
 * 功能一样等于没做，而且零报错。
 * 这批需求恰恰是「同一份能力接到三个页面」，
 * 📌 最可能的失败形态就是「库写好了，某个页面忘了接」。
 *
 * 【锚点怎么选】
 * 一律挑**实现里独有的字符串常量**（testid、函数名、字面量），
 * 不挑会被压缩器改名的局部变量名。
 */

function readSource(relative: string, maxLossRatio?: number): string {
  const raw = readFileSync(resolve(__dirname, relative), "utf-8");
  expect(raw.length).toBeGreaterThan(1000);
  const stripped = stripSourceComments(raw);
  // ⚠️ 自检：剥离函数一旦退化成贪心正则会误吃代码，让下面的反向断言集体恒绿。
  expect(() => assertStripKeptSource(raw, stripped, maxLossRatio)).not.toThrow();
  return stripped;
}

/**
 * `inspiration-avatar.ts` 的剥离损耗上限单独放宽到 0.6。
 *
 * 【放宽前的取证，不是拍脑袋】
 * 默认上限 0.3 拦下了它，报「吃掉 52.0%」。
 * 用**独立于 stripSourceComments 的脚本**逐行数了一遍真注释：
 *   总 116 行 / 注释 63 行，注释字符占比 **52.23%**。
 * 两个数字吻合 → 剥离函数没有误吃代码，是这个文件本身注释密度就高
 * （它记录了「身份键为什么只能是 title」这条最关键的判据）。
 *
 * ⚠️ 只在这一个调用点放宽，**不动 assertStripKeptSource 的默认值**：
 * 默认值一旦调高，全项目十几个源码断言测试的守门线会一起松掉。
 * 📌 并且下面紧跟着验证了关键代码锚点确实还在剥离结果里 ——
 *    否则「放宽上限」就等于把反向断言放成恒绿。
 */
const AVATAR_LIB_MAX_LOSS_RATIO = 0.6;

/**
 * `InspirationAvatar.tsx` 的剥离损耗上限，同样单独放宽。
 *
 * 【取证，同样不是拍脑袋】（2026-09-18）
 * 默认 0.3 拦下它，报「吃掉 48.7%」。
 * 用同一个独立脚本 `/tmp/artx-comment-ratio-2.mjs` 逐行数：
 *   总 83 行 / 纯注释 38 行 / 代码 35 行，注释字符占比 **48.69%**。
 * 与闸门报的 48.7% 吻合到小数点后一位 → 剥离函数没误吃代码。
 * 另外 `grep 'image/\*'` 零命中，排除了「含 /* 的字符串把正则带跑」这个成因。
 *
 * ⚠️ 只放宽这一个调用点，不动默认值。
 * 📌 且这条断言里先做了正向锚点校验（onError / AVATAR_FALLBACK_SRC 等都要在），
 *    保证放宽后反向断言不会变成恒绿的装饰品。
 */
const AVATAR_COMPONENT_MAX_LOSS_RATIO = 0.55;

describe("home page inspiration wiring", () => {
  const source = readSource("HomePage.tsx");

  it("replaces the fake heart with the real reaction button", () => {
    expect(source).toContain("InspirationReactionButton");
    expect(source).toContain('kind="like"');
    expect(source).toContain("inspirationReactions.toggle(");
  });

  it("no longer renders a decorative Heart that cannot be clicked", () => {
    // 原实现是 `<Heart size={14} fill="currentColor" ... />` 的纯展示块。
    // 📌 它留在源码里就意味着还有第二个出口，用户仍会点到假爱心。
    expect(source).not.toContain("<Heart ");
  });

  it("keeps the like count display-only instead of persisting a fake counter", () => {
    expect(source).toContain("getDisplayLikeCount(");
  });

  it("renders the deterministic avatar keyed by title", () => {
    /*
     * ⚠️ 重锚（2026-09-18）：头像渲染已从首页内联 <img> 抽成共享组件
     * InspirationAvatar，好让「CDN 挂了换本地 Logo」的兜底逻辑只有一个出口。
     * 约束没变（仍是「按 title 确定性取头像 + 不可点」），只是守门位置变了：
     * 首页守「把 title 传给了共享组件」，取值逻辑由组件自己的用例守。
     */
    expect(source).toContain('testId="home-inspiration-avatar"');
    expect(source).toContain("<InspirationAvatar");
    expect(source).toContain("title={item.title}");
    // ⚠️ 用户要求头像不可点
    expect(source).toContain("pointer-events-none");
    // 📌 反向：首页不能再自己拼头像 URL，否则兜底又变成两个出口
    expect(source).not.toContain("getInspirationAvatarUrl(");
  });

  it("routes every avatar through the shared fallback-aware component", () => {
    /*
     * 📌 头像有两个渲染出口（首页板块、共享卡片）。
     * 兜底逻辑只写进其中一个，另一个在 DiceBear 不可达时仍然是破图，
     * 而且**不会报任何错** —— 本项目踩过十几次的「多出口只改一个」。
     */
    const avatarComponent = readSource(
      "../components/inspiration/InspirationAvatar.tsx",
      AVATAR_COMPONENT_MAX_LOSS_RATIO
    );
    expect(avatarComponent).toContain("onError={handleError}");
    expect(avatarComponent).toContain("AVATAR_FALLBACK_SRC");
    expect(avatarComponent).toContain("artxStudioLogo");
    // ⚠️ 兜底图是 5.4:1 的横版 Logo，cover 会裁成一条糊色块
    expect(avatarComponent).toContain('objectFit: "contain"');
    // title 变了要清掉失败标记，否则列表复用时会一直显示兜底图
    expect(avatarComponent).toContain("setFailed(false)");

    const card = readSource("../components/inspiration/InspirationCard.tsx");
    expect(card).toContain("<InspirationAvatar");
    expect(card).not.toContain("getInspirationAvatarUrl(");
  });

  it("never derives the avatar from a random source", () => {
    /*
     * 📌 随机 = 同一张卡片每次换一张脸，正是用户说的「很假」。
     *
     * ⚠️ 这里**不能**直接断言整个 HomePage 不含 `Math.random()`：
     * 首页本来就有两处合法随机（展示用的播放/点赞基数、灵感洗牌），
     * 那样写会变成一条恒红的断言，只能靠删实现来求绿 —— 毫无意义。
     * 正确的守门位置是头像映射库本身。
     */
    const avatarLib = readSource("../lib/inspiration-avatar.ts", AVATAR_LIB_MAX_LOSS_RATIO);
    // ⚠️ 先证「代码还在剥离结果里」，否则下面两条反向断言就是恒绿的装饰品。
    expect(avatarLib).toContain("export function getInspirationAvatarUrl");
    expect(avatarLib).toContain("export function hashInspirationSeed");
    expect(avatarLib).toContain("AVATAR_STYLES[seed % AVATAR_STYLES.length]");
    expect(avatarLib).not.toContain("Math.random");
    expect(avatarLib).not.toContain("Date.now()");
    /*
     * 头像取值必须直接来自内容标题，中间不经过任何随机量。
     * ⚠️ 重锚：调用点已搬进 InspirationAvatar 组件，首页只负责把 title 传进去。
     */
    const avatarComponent = readSource(
      "../components/inspiration/InspirationAvatar.tsx",
      AVATAR_COMPONENT_MAX_LOSS_RATIO
    );
    expect(avatarComponent).toContain("getInspirationAvatarUrl(title)");
    expect(avatarComponent).not.toContain("Math.random");
  });

  it("avoids nesting a button inside a button", () => {
    // 卡片外层必须是 role="button" 的 div，否则内嵌的点赞按钮是非法 HTML。
    expect(source).toContain('role="button"');
    expect(source).toContain("tabIndex={0}");
  });
});

describe("inspiration topic page wiring", () => {
  const source = readSource("InspirationPage.tsx");

  it("renders cards through the shared component instead of a local copy", () => {
    expect(source).toContain("<InspirationCard");
    expect(source).toContain("onImportToCanvas={() => importToCanvas(item)}");
  });

  it("uses the title-normalized identity as the cross-page key", () => {
    expect(source).toContain("normalizeInspirationIdentity(item.title)");
    // 反面：拿 rank 当身份键的话，首页与专题页必然对不上
    expect(source).not.toContain("hashInspirationSeed(String(item.rank))");
  });

  it("puts both like and favorite controls in the detail dialog", () => {
    expect(source).toContain('kind="like"');
    expect(source).toContain('kind="favorite"');
    expect(source).toContain('inspirationReactions.toggle("favorite"');
  });

  it("never auto-runs generation when importing to canvas", () => {
    // 涉及花钱的动作不替用户做决定。
    expect(source).toContain("shouldAutoRun: false");
  });
});

describe("profile page reaction tabs", () => {
  const source = readSource("ProfilePage.tsx");

  it("adds the liked and favorite tabs", () => {
    // testid 是按 tab.key 拼出来的模板串，所以按前缀 + 两个 key 分别断言，
    // ⚠️ 不去匹配 `...-like"` 这种拼好的完整字面量 —— 源码里根本不存在，
    //    那会是一条恒红的断言。
    expect(source).toContain("data-testid={`profile-reaction-tab-${tab.key}`}");
    expect(source).toContain('key: "like" as const, label: "我赞过的"');
    expect(source).toContain('key: "favorite" as const, label: "我的收藏"');
    expect(source).toContain('data-testid="profile-reaction-section"');
  });

  it("reuses the topic page card including the import-to-canvas icon", () => {
    expect(source).toContain("<InspirationCard");
    expect(source).toContain("onImportToCanvas={() => importReactionToCanvas(item)}");
  });

  it("reads from the shared reaction source so cancellations sync in", () => {
    expect(source).toContain("useInspirationReactions()");
    expect(source).toContain("inspirationReactions.likedItems");
    expect(source).toContain("inspirationReactions.favoriteItems");
  });

  it("never reads localStorage directly, which would skip the change broadcast", () => {
    // 📌 直接读存储 = 取消收藏后本页不重渲染，也就是「取消了它还在」。
    expect(source).not.toContain("artx:inspiration-reactions");
  });

  it("keeps the canvas import consistent with the topic page", () => {
    expect(source).toContain("createWorkspaceHistoryProject(");
    expect(source).toContain("writeHomePromptHandoff(");
    expect(source).toContain("shouldAutoRun: false");
  });
});

describe("shared inspiration card", () => {
  const source = readSource("../components/inspiration/InspirationCard.tsx");

  it("keeps the avatar clear of the text and tag row below", () => {
    // 用户明确要求「描边不能覆盖下方的文字或者标签」：
    // 头像绝对定位在图片容器内、只越界一点，信息区用 pt-7 让位。
    expect(source).toContain("pt-7");
    expect(source).toContain("bottom: -14");
  });

  it("paints the avatar ring with the card background color", () => {
    // 用户要求描边颜色与卡片同色，才是「挖空」观感。
    expect(source).toContain("avatarBorderColor || cardBg");
    expect(source).toContain("avatarBorderWidth = 2");
  });

  it("keeps the avatar non-interactive", () => {
    expect(source).toContain("pointer-events-none");
    expect(source).not.toContain("onClick={() => {}}");
  });

  it("always exposes the import-to-canvas action", () => {
    expect(source).toContain('aria-label="一键导入画布"');
  });
});
