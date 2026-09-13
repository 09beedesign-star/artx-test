import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 邀请功能前端接线防护
 *
 * 这里用源码扫描而不是渲染测试，原因是要守的两件事都属于「结构约定」：
 *   1. 侧边栏新增入口必须同时改三处，漏一处就是「点了没反应」；
 *   2. 前端绝不能出现任何"领取奖励"的写接口。
 * 渲染测试守不住第 2 条 —— 它只会验证已有按钮的行为，
 * 守不住将来有人新增一个按钮。
 */

const root = path.resolve(__dirname, "../../../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

/** 剥掉整行注释，避免断言命中我们自己写的解释性说明。 */
function stripLineComments(source: string) {
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("邀请入口接线", () => {
  it("三处联动齐全：NAV_ITEMS / ICON_MAP / handleNavClick", () => {
    const navData = stripLineComments(read("client/src/lib/workspace-data.ts"));
    const sidebar = stripLineComments(read("client/src/components/workspace/Sidebar.tsx"));

    // 剥注释后必须仍含实质代码，否则下面的断言全是空转。
    expect(navData).toContain("NAV_ITEMS");
    expect(sidebar).toContain("ICON_MAP");

    // 1) 导航数据里有邀请项
    expect(navData).toMatch(/id:\s*"invite"/);
    expect(navData).toMatch(/icon:\s*"Gift"/);

    // 2) 图标已注册，否则会回落成默认 Home 图标
    expect(sidebar).toMatch(/ICON_MAP[\s\S]*?Gift[\s\S]*?\}/);
    expect(sidebar).toMatch(/import\s*\{[\s\S]*?Gift[\s\S]*?\}\s*from\s*"lucide-react"/);

    // 3) 点击分支已放行，否则只会弹「功能即将上线」
    expect(sidebar).toMatch(/id\s*===\s*"invite"/);
    expect(sidebar).toContain("setInviteOpen(true)");

    // 弹窗真的被渲染了（只声明 state 不挂组件是最常见的漏接）
    expect(sidebar).toContain("<InviteDialog");
    expect(sidebar).toMatch(/import\s+InviteDialog\s+from/);
  });

  it("邀请弹窗只读不写：不得出现任何领取/发放类写接口", () => {
    const dialog = stripLineComments(read("client/src/components/workspace/InviteDialog.tsx"));
    expect(dialog).toContain("/api/invite/summary");

    // 反向断言：守的是「将来新增的出口」，不是已知的那几个。
    // 逐个点名正向断言只能守住今天，守不住明天。
    expect(dialog).not.toMatch(/\/api\/invite\/(claim|grant|reward|redeem)/i);
  });

  it("邀请以复制链接为主推，前端不再调用邮件发送接口", () => {
    const raw = read("client/src/components/workspace/InviteDialog.tsx");
    const dialog = stripLineComments(raw);

    // 自证：剥注释后仍含实质代码，否则下面的 not.toContain 是空转。
    expect(dialog).toContain("/api/invite/summary");
    expect(dialog).toContain("handleCopy");

    // ⚠️ 邮件对 outlook/hotmail 被微软静默丢弃，已改为复制链接主推。
    // 这里锁住「前端不再调发信接口」；后端路由刻意保留，故只断言前端。
    expect(dialog).not.toMatch(/\/api\/invite\/send/);
    expect(dialog).not.toContain("handleSendEmail");
    expect(dialog).not.toContain("setEmailInput");

    // 邮件输入相关的 UI 组件也必须清干净，否则是「删了逻辑留了壳」。
    expect(dialog).not.toMatch(/type=["']email["']/);
    expect(dialog).not.toMatch(/lucide-react["'][\s\S]{0,200}\bSend\b/);

    // 主推渠道必须真的在：一次性复制整段邀请消息，链接为次级出口。
    expect(dialog).toContain('handleCopy("message")');
    expect(dialog).toContain('handleCopy("link")');
    expect(dialog).toContain("inviteLink");
    expect(dialog).toContain("buildInviteMessage");

    // 自证：raw 未被剥离时体积明显更大，证明 stripLineComments 确实在工作，
    // 否则上面所有 not.* 断言都可能是「因为没读到内容」而假通过。
    expect(raw.length).toBeGreaterThan(dialog.length);
  });

  it("邀请码只在注册路径透传，密码登录不带", () => {
    const auth = stripLineComments(read("client/src/contexts/AuthContext.tsx"));
    expect(auth).toContain("getPendingInviteCode");

    // 密码登录绝不能带邀请码：login 分支走的是**已有账号**，
    // 无条件带上等于允许存量用户事后认爹，邀请奖励会被刷穿。
    expect(auth).toMatch(/action\s*===\s*"register"\s*\?\s*getPendingInviteCode\(\)/);
  });

  it("验证码登录属于注册路径，必须携带邀请码", () => {
    const auth = stripLineComments(read("client/src/contexts/AuthContext.tsx"));

    // ⚠️ sms-login / email-login 对新手机号、新邮箱会**自动建号**，
    // 它们同时是注册入口。此前这两条完全不带邀请码，
    // 从邀请链接进来却选了验证码登录的用户，关系永远绑不上且零报错。
    expect(auth).toMatch(/fetchAuth\("sms-login",\s*\{[\s\S]{0,200}?inviteCode/);
    expect(auth).toMatch(/fetchAuth\("email-login",\s*\{[\s\S]{0,200}?inviteCode/);
  });

  it("邀请码必须持久化，且绑定后清除", () => {
    const auth = stripLineComments(read("client/src/contexts/AuthContext.tsx"));

    // ⚠️ 只在提交那一刻现读 URL 是不够的：用户从邀请链接落地后
    // 往往会先逛几个页面，跳转会把 ?invite= 弄丢，等他回来注册时
    // 邀请码已经不在了 —— 全程零报错，且首次付费后无法补救。
    expect(auth).toContain("localStorage.setItem");
    expect(auth).toContain("INVITE_CODE_STORAGE_KEY");

    // 用完必须清，否则同一浏览器换号注册会重复携带。
    expect(auth).toContain("clearPendingInviteCode");
  });

  it("后端绑定收敛在单一函数，且只对新账号生效", () => {
    const raw = read("server/auth-store.ts");
    const store = stripLineComments(raw);

    // 自证：剥注释后仍含实质代码，否则下面的断言可能是空转。
    expect(store).toContain("bindInviteRelationIfEligible");
    expect(raw.length).toBeGreaterThan(store.length);

    // 🔒 只对新账号绑定 —— 少了这道闸门，老用户重复登录时带上邀请码
    // 就能事后建立邀请关系，等于把防刷体系整条拆掉。
    expect(store).toMatch(/if\s*\(!isNewUser\s*\|\|\s*user\.invitedBy\)\s*return/);

    // 三条会产生新账号的路径都必须接上这个函数：
    // 密码注册、短信验证码登录、邮箱验证码登录。
    const bindCalls = store.match(/bindInviteRelationIfEligible\(\{/g) || [];
    expect(bindCalls.length).toBeGreaterThanOrEqual(3);

    // 🔒 绑定阶段绝不发积分，发放统一在首次付费（invite-rewards.ts）。
    const bindBody = store.slice(
      store.indexOf("function bindInviteRelationIfEligible"),
      store.indexOf("export async function settleFirstPaymentForInvite"),
    );
    expect(bindBody.length).toBeGreaterThan(0);
    expect(bindBody).not.toContain("grantCredits");
  });

  it("邀请链接指向注册入口并带邀请码参数", () => {
    const dialog = stripLineComments(read("client/src/components/workspace/InviteDialog.tsx"));
    expect(dialog).toMatch(/\?invite=\$\{encodeURIComponent\(code\)\}/);
  });

  it("一次性复制的文案必须同时含链接与邀请码，且数字不写死", () => {
    const raw = read("client/src/components/workspace/InviteDialog.tsx");
    const dialog = stripLineComments(raw);
    expect(raw.length).toBeGreaterThan(dialog.length);

    const messageBody = dialog.slice(
      dialog.indexOf("function buildInviteMessage"),
      dialog.indexOf("async function copyText"),
    );
    expect(messageBody.length).toBeGreaterThan(0);

    // 链接与邀请码都要有：链接是主路径，明文码是兜底 ——
    // 部分聊天工具会截断 URL 查询参数，?invite= 一旦丢失，
    // 链接照样能打开但邀请关系悄悄没了，全程零报错。
    expect(messageBody).toContain("${link}");
    expect(messageBody).toContain("summary.inviteCode");

    // ⚠️ 奖励数字必须取接口返回值。写死会导致「文案说 200、实际发 300」，
    // 而 shared/billing-config.ts 里的配置是会调整的。
    expect(messageBody).toContain("summary.inviteeCredits");
    expect(messageBody).toContain("summary.minPaidAmountHkd");
    expect(messageBody).not.toMatch(/\d{3}\s*积分/);
  });

  it("弹窗定高 800 且内容区可滚动，标题不被顶出视口", () => {
    const raw = read("client/src/components/workspace/InviteDialog.tsx");
    const dialog = stripLineComments(raw);
    expect(raw.length).toBeGreaterThan(dialog.length);

    // 只取 DialogContent 这一行，避免把内部卡片的样式类误当成容器样式。
    const contentLine = dialog
      .split("\n")
      .find(line => line.includes("<DialogContent"));
    expect(contentLine).toBeDefined();

    // 定高 800：用户明确要求的固定高度，宽度维持原样不动。
    expect(contentLine).toContain("h-[800px]");
    expect(contentLine).toContain("sm:max-w-[480px]");

    // ⚠️⚠️ 这两条是「成对出现」的核心防线，少一条改动就等于没做：
    //
    // DialogContent 基座是 grid，而 **grid 子项的 min-height 默认为 auto**
    //（即「不得小于内容高度」）。若这里写成 grid-rows-[auto_1fr]，
    // 内容区会被子项内容顶开、直接撑破 800px —— overflow-y-auto 永远不触发，
    // 表现为「定高了但还是被顶住」，且零报错。必须用 minmax(0,1fr) 压下限。
    expect(contentLine).toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(contentLine).not.toMatch(/grid-rows-\[auto_1fr\]/);

    // 视口不足 800 时必须让步，否则又会复现「上下被顶出屏幕」的原始症状。
    expect(contentLine).toContain("max-h-[calc(100vh-2rem)]");

    // 滚动容器真的存在。只定高不给滚动 = 把内容直接裁掉，比原来更糟。
    expect(dialog).toContain("overflow-y-auto");
  });

  it("三个状态共用同一个滚动容器，保证 grid 行数恒为二", () => {
    const raw = read("client/src/components/workspace/InviteDialog.tsx");
    const dialog = stripLineComments(raw);
    expect(raw.length).toBeGreaterThan(dialog.length);

    // 截取 DialogContent 内部整段。
    const start = dialog.indexOf("<DialogContent");
    const end = dialog.indexOf("</DialogContent>");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = dialog.slice(start, end);

    // ⚠️ 若让 loading / error / summary 三个分支各自充当 grid item，
    // grid 行数会随状态变化（1~2 行），与 grid-rows-[auto_minmax(0,1fr)]
    // 两行模板对不上，高度分配会错乱。
    // 故三者必须被同一个滚动容器包住 —— 断言滚动容器出现在最早的
    // 状态分支之前，即它确实包在外层。
    const scrollerIdx = body.indexOf("overflow-y-auto");
    const loadingIdx = body.indexOf("{loading &&");
    expect(scrollerIdx).toBeGreaterThan(-1);
    expect(loadingIdx).toBeGreaterThan(-1);
    expect(scrollerIdx).toBeLessThan(loadingIdx);

    // 三个分支都还在（防止有人为了「修布局」顺手删掉状态分支）。
    expect(body).toContain("{loading &&");
    expect(body).toContain("{!loading && error &&");
    expect(body).toContain("{!loading && !error && summary &&");

    // 底部的暂停开关必须在滚动容器内 —— 它正是此前被顶出屏幕、点不到的元素。
    const toggleIdx = body.indexOf("handleToggleAccept");
    expect(toggleIdx).toBeGreaterThan(scrollerIdx);
  });

  it("落地页必须提示邀请并自动切到注册态", () => {
    const raw = read("client/src/pages/HomePage.tsx");
    const home = stripLineComments(raw);
    expect(raw.length).toBeGreaterThan(home.length);

    // ⚠️ 此前朋友打开邀请链接后页面毫无变化：既不提示是谁邀请的，
    // 也不引导注册，面板默认停在 prelogin —— 用户自然会找
    // 「在哪里输邀请码」，而正确答案是「不用输，但必须去注册」。
    expect(home).toContain("rememberInviteCodeFromUrl");
    expect(home).toMatch(/setPanelMode\("register"\)/);

    // 提示里的奖励数字同样取自配置，不写死。
    expect(home).toContain("INVITE_REWARD_CONFIG");
    expect(home).toContain("好友邀请你加入");
  });
});
