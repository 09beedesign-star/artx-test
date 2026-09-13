/**
 * 邀请码「暂停接受新绑定」开关 —— 防护测试（2026-09-13 新增）
 *
 * ## 这个功能为什么存在
 *
 * 用户担心邀请码泄露后有风险，第一反应是「能不能换一个码」。
 * 但换码解决不了问题且代价极大：
 *   - 邀请码天生就是要发给别人的，发出去必然扩散，换多少次都还会泄露；
 *   - 换码会让所有已发出的旧链接立刻作废，好友点开后关系**静默**绑不上，
 *     而 hasPaid 一旦落盘就没有第二次机会补绑 —— 用户永远不会知道自己丢了奖励。
 * 所以做成「暂停开关」：控制权留在用户手里，且只挡新人。
 *
 * ## 本文件锁住的四条意图（改动前请先想清楚为什么要破坏它们）
 *
 * 1. 暂停后**新绑定必须被拒**，否则开关是死的、等于没做；
 * 2. 暂停**绝不能影响已有关系与已发积分** —— 这是用户按下开关前最担心的事，
 *    也是这个功能敢不敢被用的前提；
 * 3. ⭐⭐ 暂停闸门**只能存在于绑定阶段，绝不能出现在发奖阶段**。
 *    奖励在「首次付费」时才结算，绑定与付费之间隔着最长 bindingValidDays 天。
 *    若发奖阶段也查开关，「暂停前已绑定、暂停后才付费」的好友会被凭空吞掉奖励；
 * 4. 开关**不得顺手改动 inviteCode** —— 一旦改了就退化成「换码」，
 *    与整个设计意图正好相反。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  evaluateBindingEligibility,
  evaluateRewardEligibility,
  countRewardedInvites,
  buildInviteSummary,
  type InviteUserLike,
} from "./invite-rewards";
import { INVITE_REWARD_CONFIG } from "../shared/billing-config";

function mkUser(over: Partial<InviteUserLike> = {}): InviteUserLike {
  return {
    id: over.id || "u-" + Math.random().toString(36).slice(2, 9),
    username: over.username || "user@example.com",
    loginKey: over.loginKey ?? (over.username || "user@example.com").toLowerCase(),
    identityKey: over.identityKey ?? (over.username || "user@example.com").toLowerCase(),
    createdAt: over.createdAt || new Date().toISOString(),
    ...over,
  };
}

/** 构造一对「各方面都合法」的邀请人/被邀请人，确保拒绝一定来自被测闸门本身。 */
function mkPair(inviterOver: Partial<InviteUserLike> = {}) {
  const inviter = mkUser({
    id: "inviter",
    username: "inviter@x.com",
    signupIp: "1.1.1.1",
    inviteCode: "ABCD2345",
    ...inviterOver,
  });
  const invitee = mkUser({
    id: "invitee",
    username: "invitee@y.com",
    signupIp: "2.2.2.2",
  });
  return { inviter, invitee };
}

describe("暂停开关 — 必须真的挡住新绑定", () => {
  it("⭐ 暂停后新绑定被拒，且理由是 inviter_paused", () => {
    const { inviter, invitee } = mkPair({ inviteAcceptDisabled: true });
    const verdict = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: invitee.identityKey!,
      inviteeIp: invitee.signupIp,
      allUsers: [inviter, invitee],
    });
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) throw new Error("unreachable");
    expect(verdict.reason).toBe("inviter_paused");
  });

  /*
   * 反向断言。没有这条，上面那条在「所有绑定都被拒」的实现里也会通过 ——
   * 比如有人误把闸门写成无条件 return false，测试依然全绿。
   */
  it("⭐ 未暂停时同样一对用户必须放行（反向断言，防闸门写死）", () => {
    const { inviter, invitee } = mkPair({ inviteAcceptDisabled: false });
    const verdict = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: invitee.identityKey!,
      inviteeIp: invitee.signupIp,
      allUsers: [inviter, invitee],
    });
    expect(verdict.eligible).toBe(true);
  });

  it("字段缺失（历史账号）必须视为未暂停，不能误伤老用户", () => {
    const { inviter, invitee } = mkPair();
    delete inviter.inviteAcceptDisabled;
    const verdict = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: invitee.identityKey!,
      inviteeIp: invitee.signupIp,
      allUsers: [inviter, invitee],
    });
    expect(verdict.eligible).toBe(true);
  });

  /*
   * 只认真布尔 true。写成 if (inviter.inviteAcceptDisabled) 的话，
   * 任何真值（比如从 JSON 读出来的字符串 "false"）都会意外触发暂停。
   */
  it("非布尔真值不得触发暂停（防 truthy 误判）", () => {
    const { inviter, invitee } = mkPair();
    (inviter as Record<string, unknown>).inviteAcceptDisabled = "false";
    const verdict = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: invitee.identityKey!,
      inviteeIp: invitee.signupIp,
      allUsers: [inviter, invitee],
    });
    expect(verdict.eligible).toBe(true);
  });
});

describe("⭐⭐ 暂停不得伤害已有关系与已发奖励", () => {
  /*
   * 这是整个功能的信任基础。用户按下暂停时最怕的就是
   * 「我之前邀请的人会不会白邀请了」。
   */
  it("⭐⭐ 暂停前已绑定的好友，暂停后才付费，奖励照发", () => {
    const inviter = mkUser({
      id: "inviter",
      username: "inviter@x.com",
      signupIp: "1.1.1.1",
      inviteAcceptDisabled: true, // 已经暂停了
    });
    const invitee = mkUser({
      id: "invitee",
      username: "invitee@y.com",
      signupIp: "2.2.2.2",
      invitedBy: "inviter", // 但关系是暂停之前就建立的
      invitedAt: new Date().toISOString(),
      hasPaid: false,
    });
    const verdict = evaluateRewardEligibility({
      inviter,
      invitee,
      paidAmountHkd: INVITE_REWARD_CONFIG.minPaidAmountHkd,
      allUsers: [inviter, invitee],
    });
    expect(verdict.eligible).toBe(true);
  });

  it("⭐⭐ 发奖校验源码中不得出现暂停开关（闸门不许扩散到发奖阶段）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/invite-rewards.ts"), "utf8");
    // 剥掉注释再扫 —— 本文件和实现文件都在注释里大量提到这个字段名，
    // 不剥的话断言会被注释污染，永远通过。
    const code = src
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    // 自证：剥注释确实生效了，否则下面的断言是空转。
    expect(src.length).toBeGreaterThan(code.length);

    /*
     * ⚠️ 必须切到**函数末尾**，不能一路切到文件尾。
     * 切到文件尾会把后面的 buildInviteSummary 也圈进来 —— 那里出现
     * inviteAcceptDisabled 是完全合法的（summary 就是要把暂停态返回给前端），
     * 断言会误报。范围划错的断言比没有断言更糟：它逼你去改正确的代码。
     */
    const start = code.indexOf("export function evaluateRewardEligibility");
    expect(start).toBeGreaterThan(-1);
    const next = code.indexOf("\nexport ", start + 1);
    const rewardFn = code.slice(start, next > start ? next : undefined);
    expect(rewardFn.length).toBeGreaterThan(200);
    // 自证范围收敛正确：不该把下一个导出函数圈进来。
    expect(rewardFn).not.toContain("buildInviteSummary");
    // 正向锚点：确认切到的确实是发奖校验函数体，而不是空片段。
    expect(rewardFn).toContain("invitedBy");
    expect(rewardFn).not.toContain("inviteAcceptDisabled");
  });

  it("暂停不影响已获奖人数统计", () => {
    const inviter = mkUser({ id: "inviter", inviteAcceptDisabled: true });
    const paidFriends = Array.from({ length: 3 }, (_, i) =>
      mkUser({ id: `f${i}`, invitedBy: "inviter", hasPaid: true }),
    );
    expect(countRewardedInvites([inviter, ...paidFriends], "inviter")).toBe(3);
  });
});

describe("暂停开关 — 与邀请码的边界", () => {
  it("⭐ 暂停状态必须出现在 summary 里，前端才渲染得出来", () => {
    const paused = mkUser({ id: "u1", inviteCode: "ABCD2345", inviteAcceptDisabled: true });
    expect(buildInviteSummary(paused, [paused]).acceptDisabled).toBe(true);

    const active = mkUser({ id: "u2", inviteCode: "EFGH6789" });
    expect(buildInviteSummary(active, [active]).acceptDisabled).toBe(false);
  });

  it("⭐⭐ 切换开关的实现绝不能改动 inviteCode（改了就退化成换码）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/auth-store.ts"), "utf8");
    const start = src.indexOf("export async function setInviteAcceptDisabled");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}", start));
    // 只允许把 inviteCode 读出来写进审计日志，不许赋值。
    expect(body).not.toMatch(/inviteCode\s*=[^=]/);
    expect(body).not.toContain("generateUniqueInviteCode");
    // 正向确认它确实写了目标字段，否则上面两条反向断言是空转。
    expect(body).toContain("inviteAcceptDisabled");
  });

  it("⭐ 切换接口只能作用于当前会话用户，不接受请求体传入的 userId", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");
    const start = src.indexOf('app.post("/api/invite/toggle-accept"');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 1400);
    expect(body).toContain("requireSessionUser");
    expect(body).toContain("setInviteAcceptDisabled(user.id");
    // 从请求体取 userId 就意味着能停掉别人的邀请码。
    expect(body).not.toMatch(/req\.body[^\n]*userId/);
  });
});
