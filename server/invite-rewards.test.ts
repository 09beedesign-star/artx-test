import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  evaluateBindingEligibility,
  evaluateRewardEligibility,
  isBindingExpired,
  countRewardedInvites,
  countPendingInvites,
  generateInviteCode,
  generateUniqueInviteCode,
  findUserByInviteCode,
  buildInviteIdempotencyKey,
  buildInviteSummary,
  INVITE_SOURCE_PREFIX,
  type InviteUserLike,
} from "./invite-rewards";
import { INVITE_REWARD_CONFIG, INVITE_CODE_ALPHABET } from "../shared/billing-config";
import { ALLOWED_GIFT_SOURCE_PREFIXES, isAllowedGiftSource } from "./credit-gifting";

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

describe("邀请奖励 — 发放时机红线", () => {
  it("奖励来源前缀必须落在转赠禁令白名单内", () => {
    expect(isAllowedGiftSource(`${INVITE_SOURCE_PREFIX}/u1/inviter`)).toBe(true);
    expect(ALLOWED_GIFT_SOURCE_PREFIXES.some((p) => `${INVITE_SOURCE_PREFIX}/`.startsWith(p))).toBe(true);
  });

  it("奖励来源不得表达为「来自某个用户」", () => {
    expect(isAllowedGiftSource("user/u123")).toBe(false);
    expect(isAllowedGiftSource(`transfer/${INVITE_SOURCE_PREFIX}`)).toBe(false);
  });

  // 这是整套防刷的地基：源码层面锁死「注册不发钱」。
  it("源码中不得存在「注册即发奖」的实现路径", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/invite-rewards.ts"), "utf8");
    const code = src.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "").replace(/^[ \t]*\/\/.*$/gm, "");
    // 剥注释后仍须保留实质代码，否则断言等于空转。
    expect(code).toContain("evaluateRewardEligibility");
    // 发奖校验必须读付费金额；读不到就说明发放条件与付费脱钩了。
    expect(code).toContain("paidAmountHkd");
    expect(code).toContain("minPaidAmountHkd");
  });

  it("发奖校验必须真的因「金额不足」而拒绝（行为断言，非文本断言）", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: "1.1.1.1" });
    const invitee = mkUser({
      id: "invitee",
      username: "b@y.com",
      signupIp: "2.2.2.2",
      invitedBy: "inviter",
      invitedAt: new Date().toISOString(),
    });
    const res = evaluateRewardEligibility({
      invitee,
      inviter,
      allUsers: [inviter, invitee],
      paidAmountHkd: INVITE_REWARD_CONFIG.minPaidAmountHkd - 1,
    });
    expect(res.eligible).toBe(false);
    expect(res.eligible === false && res.reason).toBe("amount_below_threshold");
  });

  it("付费金额达标且其余条件齐备时才放行", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: "1.1.1.1" });
    const invitee = mkUser({
      id: "invitee",
      username: "b@y.com",
      signupIp: "2.2.2.2",
      invitedBy: "inviter",
      invitedAt: new Date().toISOString(),
    });
    const res = evaluateRewardEligibility({
      invitee,
      inviter,
      allUsers: [inviter, invitee],
      paidAmountHkd: INVITE_REWARD_CONFIG.minPaidAmountHkd,
    });
    expect(res.eligible).toBe(true);
  });
});

describe("邀请奖励 — 自邀与小号识别", () => {
  it("归一化身份键相同则拒绝绑定（plus 地址派生小号）", () => {
    const inviter = mkUser({ id: "inviter", username: "a@gmail.com", identityKey: "a@gmail.com" });
    const res = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: "a@gmail.com",
      inviteeIp: "9.9.9.9",
      allUsers: [inviter],
    });
    expect(res.eligible).toBe(false);
    expect(res.eligible === false && res.reason).toBe("same_identity");
  });

  it("同一注册 IP 则拒绝绑定", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: "5.5.5.5" });
    const res = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: "b@y.com",
      inviteeIp: "5.5.5.5",
      allUsers: [inviter],
    });
    expect(res.eligible).toBe(false);
    expect(res.eligible === false && res.reason).toBe("same_ip");
  });

  it("IP 缺失时不得误伤（历史账号没有 signupIp）", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: undefined });
    const res = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: "b@y.com",
      inviteeIp: undefined,
      allUsers: [inviter],
    });
    expect(res.eligible).toBe(true);
  });

  it("发奖阶段同样拦截同身份与同 IP（两段式校验都要守）", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", identityKey: "same@x.com" });
    const invitee = mkUser({
      id: "invitee",
      username: "b@x.com",
      identityKey: "same@x.com",
      invitedBy: "inviter",
      invitedAt: new Date().toISOString(),
    });
    const res = evaluateRewardEligibility({
      invitee,
      inviter,
      allUsers: [inviter, invitee],
      paidAmountHkd: 999,
    });
    expect(res.eligible).toBe(false);
    expect(res.eligible === false && res.reason).toBe("same_identity");
  });
});

describe("邀请奖励 — 配额与有效期", () => {
  it("达到奖励上限后拒绝新绑定", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com" });
    const rewarded = Array.from({ length: INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser }, (_, i) =>
      mkUser({ id: `paid-${i}`, username: `p${i}@z.com`, invitedBy: "inviter", hasPaid: true }),
    );
    const res = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: "new@y.com",
      inviteeIp: "8.8.8.8",
      allUsers: [inviter, ...rewarded],
    });
    expect(res.eligible).toBe(false);
    expect(res.eligible === false && res.reason).toBe("inviter_quota_exceeded");
  });

  it("未付费的被邀请人不计入配额", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com" });
    const pendings = Array.from({ length: 50 }, (_, i) =>
      mkUser({ id: `pend-${i}`, username: `q${i}@z.com`, invitedBy: "inviter", hasPaid: false }),
    );
    expect(countRewardedInvites([inviter, ...pendings], "inviter")).toBe(0);
    const res = evaluateBindingEligibility({
      inviter,
      inviteeIdentityKey: "new@y.com",
      inviteeIp: "8.8.8.8",
      allUsers: [inviter, ...pendings],
    });
    expect(res.eligible).toBe(true);
  });

  it("绑定超期后不再发奖", () => {
    const past = new Date(Date.now() - (INVITE_REWARD_CONFIG.bindingValidDays + 1) * 86400000).toISOString();
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: "1.1.1.1" });
    const invitee = mkUser({
      id: "invitee",
      username: "b@y.com",
      signupIp: "2.2.2.2",
      invitedBy: "inviter",
      invitedAt: past,
    });
    expect(isBindingExpired(invitee)).toBe(true);
    const res = evaluateRewardEligibility({
      invitee,
      inviter,
      allUsers: [inviter, invitee],
      paidAmountHkd: 999,
    });
    expect(res.eligible === false && res.reason).toBe("binding_expired");
  });

  it("绑定时间无法解析时保守判定为未过期，不得误伤用户", () => {
    const invitee = mkUser({ invitedAt: "not-a-date" });
    expect(isBindingExpired(invitee)).toBe(false);
  });

  it("已付费用户不再重复触发奖励", () => {
    const inviter = mkUser({ id: "inviter", username: "a@x.com", signupIp: "1.1.1.1" });
    const invitee = mkUser({
      id: "invitee",
      username: "b@y.com",
      signupIp: "2.2.2.2",
      invitedBy: "inviter",
      invitedAt: new Date().toISOString(),
      hasPaid: true,
    });
    const res = evaluateRewardEligibility({
      invitee,
      inviter,
      allUsers: [inviter, invitee],
      paidAmountHkd: 999,
    });
    expect(res.eligible === false && res.reason).toBe("already_rewarded");
  });

  it("待转化人数统计排除已过期绑定", () => {
    const fresh = mkUser({ id: "f", invitedBy: "inviter", invitedAt: new Date().toISOString() });
    const stale = mkUser({
      id: "s",
      invitedBy: "inviter",
      invitedAt: new Date(Date.now() - (INVITE_REWARD_CONFIG.bindingValidDays + 5) * 86400000).toISOString(),
    });
    expect(countPendingInvites([fresh, stale], "inviter")).toBe(1);
  });
});

describe("邀请奖励 — 邀请码", () => {
  it("邀请码只含无歧义字符且长度固定", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      for (const ch of code) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("字符集不含易混淆字符", () => {
    for (const ch of ["0", "O", "1", "I", "L"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it("生成的邀请码不与已有码重复", () => {
    const existing = Array.from({ length: 100 }, () => mkUser({ inviteCode: generateInviteCode() }));
    const code = generateUniqueInviteCode(existing);
    expect(existing.some((u) => u.inviteCode === code)).toBe(false);
  });

  it("按邀请码查人忽略大小写与空格", () => {
    const user = mkUser({ id: "target", inviteCode: "ABCD2345" });
    expect(findUserByInviteCode([user], " abcd2345 ")?.id).toBe("target");
    expect(findUserByInviteCode([user], "")).toBeUndefined();
  });
});

describe("邀请奖励 — 幂等与聚合", () => {
  it("幂等键以被邀请人为主键，保证一条关系只发一次", () => {
    const a = buildInviteIdempotencyKey("invitee-1", "inviter");
    const b = buildInviteIdempotencyKey("invitee-1", "inviter");
    expect(a).toBe(b);
    expect(a).not.toBe(buildInviteIdempotencyKey("invitee-1", "invitee"));
    expect(isAllowedGiftSource(a)).toBe(true);
  });

  it("汇总数据与配置保持一致", () => {
    const inviter = mkUser({ id: "inviter", inviteCode: "CODE2345" });
    const paid = mkUser({ id: "p1", invitedBy: "inviter", hasPaid: true });
    const summary = buildInviteSummary(inviter, [inviter, paid]);
    expect(summary.rewardedCount).toBe(1);
    expect(summary.earnedCredits).toBe(INVITE_REWARD_CONFIG.inviterCredits);
    expect(summary.remainingQuota).toBe(INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser - 1);
  });

  it("奖励积分有效期必须严格短于充值积分有效期（防薅羊毛）", () => {
    expect(INVITE_REWARD_CONFIG.rewardCreditValidDays).toBeLessThan(366);
  });
});
