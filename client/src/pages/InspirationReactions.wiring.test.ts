import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../shared/strip-source-comments";

/**
 * 点赞 / 收藏 / 身份键「多处接线」的防护测试。
 *
 * ⚠️ 原本还包含「虚拟创作者头像」，该功能已按用户要求全站移除（2026-09-18）。
 * 相关用例**没有删除而是反转**：从「头像必须渲染」改成「头像必须不存在」，
 * 这样将来有人把头像加回来会被立刻拦下。
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
 * `inspiration-identity.ts`（原 `inspiration-avatar.ts`）的剥离损耗上限放宽到 0.72。
 *
 * 【放宽前的取证，不是拍脑袋】（2026-09-18 头像移除后重新量过）
 * 头像实现删掉后，这个文件只剩两个短函数，但「身份键为什么只能是 title」
 * 那段判据注释原样保留 → **代码变少、注释没少，占比自然升高**。
 * 用独立于 stripSourceComments 的脚本逐行数：
 *   总 48 行 / 注释 34 行，注释字符占比 **68.89%**，与闸门报数吻合
 *   → 剥离函数没有误吃代码。
 *
 * ⚠️ 只在这一个调用点放宽，**不动 assertStripKeptSource 的默认值**：
 * 默认值一旦调高，全项目十几个源码断言测试的守门线会一起松掉。
 * 📌 并且下面紧跟着验证了关键代码锚点确实还在剥离结果里 ——
 *    否则「放宽上限」就等于把反向断言放成恒绿。
 */
const IDENTITY_LIB_MAX_LOSS_RATIO = 0.72;

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

  it("首页灵感卡片不再渲染任何虚拟创作者头像", () => {
    /*
     * 【用户要求】「所有场景下的灵感推荐头像全部去掉」（2026-09-18）。
     *
     * ⚠️ 这条是反向断言，必须锚在**具体写法**上而不是泛泛的 "avatar" 字样：
     * 泛锚会被无关代码（比如用户自己的头像）带得恒红或恒绿。
     */
    expect(source).not.toContain("<InspirationAvatar");
    expect(source).not.toContain("home-inspiration-avatar");
    expect(source).not.toContain("getInspirationAvatarUrl");
    /*
     * 📌 正向锚点：证明这个文件确实是首页、且卡片渲染代码还在 ——
     * 否则「文件读空了」和「头像确实没了」输出一模一样，上面三条会静默恒绿。
     *
     * ⚠️ 不能用 `title={item.title}` 当锚点：那串**只存在于头像组件的传参里**，
     * 头像删掉后它必然消失 —— 那样这条正向锚点会恒红，等于逼着人删断言求绿。
     * 改用卡片本身的渲染锚点。
     */
    expect(source).toContain("{item.title}");
    expect(source).toContain("InspirationReactionButton");
  });

  it("共享卡片（专题页 + 个人中心共用）同样不再渲染头像", () => {
    /*
     * 📌 头像原本有两个渲染出口：首页板块、共享卡片 `InspirationCard`。
     * 只删一个 = 专题页和个人中心照样有头像，而且**不会报任何错**
     * —— 本项目踩过十几次的「多出口只改一个」。
     */
    const card = readSource("../components/inspiration/InspirationCard.tsx");
    expect(card).not.toContain("<InspirationAvatar");
    expect(card).not.toContain("getInspirationAvatarUrl");
    expect(card).not.toContain("inspiration-card-avatar");
    // ⚠️ 为头像让位的布局补偿也必须回收，否则留一条无来由的空白
    expect(card).not.toContain("avatarBorderWidth");
    expect(card).not.toContain("avatarBorderColor");
    expect(card).not.toContain("p-4 pt-7");
    // 正向锚点：卡片主体还在，排除「读到空文件」导致的恒绿
    expect(card).toContain("{item.title}");
    expect(card).toContain("reactionSlot");
  });

  it("头像组件文件已彻底删除，不留死代码", () => {
    /*
     * ⚠️ 只删调用点、留着组件文件，下次有人搜到它会以为还能用，
     * 顺手接回去 —— 头像就又回来了。
     */
    const avatarComponentPath = resolve(
      __dirname,
      "../components/inspiration/InspirationAvatar.tsx"
    );
    expect(existsSync(avatarComponentPath)).toBe(false);
  });

  it("身份键仍然保留且不依赖随机源（点赞计数还在用）", () => {
    /*
     * ⚠️⚠️ 头像删了，但 `hashInspirationSeed` / `normalizeInspirationIdentity`
     * **不是头像专用的** —— 点赞/收藏的计数与勾选态同样靠它们确定身份。
     * 📌 所以这条从「守头像映射」重锚为「守身份键」：
     *    一旦有人把它换成随机或改用 rank，同一条灵感在两页会显示不同的点赞数，
     *    界面上看不出异常（每张卡片确实都有数），但数字对不上。
     */
    const identityLib = readSource("../lib/inspiration-identity.ts", IDENTITY_LIB_MAX_LOSS_RATIO);
    // ⚠️ 先证「代码还在剥离结果里」，否则下面的反向断言就是恒绿的装饰品。
    expect(identityLib).toContain("export function hashInspirationSeed");
    expect(identityLib).toContain("export function normalizeInspirationIdentity");
    expect(identityLib).not.toContain("Math.random");
    expect(identityLib).not.toContain("Date.now()");
    // 📌 头像相关的实现必须已经从这个文件里清干净
    expect(identityLib).not.toContain("AVATAR_STYLES");
    expect(identityLib).not.toContain("dicebear");
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

  /*
   * ⚠️⚠️ 下面三条原本守的是「头像的位置 / 描边 / 不可点」。
   * 头像已按用户要求全站移除（2026-09-18），这三条**没有删除而是反转**：
   * 守的变成「连带头像而生的那些布局补偿也必须一并回收」。
   *
   * 📌 判据：删一个元素时，只删元素不删「为它而加的补偿」，
   *    界面会留一条没有来由的空白 —— 看起来像排版 bug，而且不会报错。
   */
  it("为头像让位的上内边距与越界定位已一并回收", () => {
    // `pt-7` 是给越过交界线的头像留的；`bottom: -14` 是头像的越界量。
    expect(source).not.toContain("pt-7");
    expect(source).not.toContain("bottom: -14");
    // 正向锚点：信息区还在，排除「读到空文件」导致的恒绿
    expect(source).toContain("flex min-h-[270px] flex-col p-4");
  });

  it("头像描边相关的死参数已从组件契约里删除", () => {
    /*
     * ⚠️ 留着没人传、也没人用的 props，下次维护的人会以为头像还在，
     * 而 TypeScript 对「可选且未使用的 prop」不会有任何报错。
     */
    expect(source).not.toContain("avatarBorderColor");
    expect(source).not.toContain("avatarBorderWidth");
    expect(source).not.toContain("ringColor");
  });

  it("卡片里不再有任何头像元素", () => {
    expect(source).not.toContain("<InspirationAvatar");
    expect(source).not.toContain("pointer-events-none");
    // 正向锚点：卡片交互还在
    expect(source).toContain("onCopyPrompt");
  });

  it("always exposes the import-to-canvas action", () => {
    expect(source).toContain('aria-label="一键导入画布"');
  });
});
