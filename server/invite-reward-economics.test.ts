import { describe, expect, it } from "vitest";
import {
  CREDIT_EXPIRY_RULES,
  CREDIT_RECHARGE_TIERS,
  INVITE_REWARD_CONFIG,
  MEMBERSHIP_PLANS,
} from "../shared/billing-config";

/**
 * 邀请奖励的**经济性**约束（2026-09-13 定档）。
 *
 * ⚠️ 为什么必须单独写这一组：
 * 现有的 invite-rewards.test.ts / invite-reward-settlement.test.ts 全都
 * 引用 INVITE_REWARD_CONFIG 里的常量做断言 —— 也就是说**把额度改成任何值
 * 它们都照样全绿**。它们守的是「逻辑有没有按配置执行」，
 * 而不是「配置本身合不合理」。后者一直是没人守的空档。
 *
 * 这组用例锁的是配置值之间的**关系**，不锁具体数字，
 * 所以日后调额度只要仍然满足经济性就不会被挡，
 * 但「同向放松额度和门槛」这种会让成本失控的改法会被立刻打挂。
 */

/** 用户自己掏钱能买到的最差汇率 —— 用它估奖励成本是偏保守的。 */
function worstRechargeRate() {
  return Math.min(...CREDIT_RECHARGE_TIERS.map((tier) => tier.creditsPerHkd));
}

/** 一对邀请（邀请人 + 被邀请人）发出去的总积分。 */
function creditsPerInvitePair() {
  return INVITE_REWARD_CONFIG.inviterCredits + INVITE_REWARD_CONFIG.inviteeCredits;
}

describe("邀请奖励额度的经济性约束", () => {
  it("单对奖励的成本不得超过付费门槛的 20%", () => {
    /**
     * 这是本组最核心的一条。
     *
     * 上线时的占位值是 500+300=800 分、门槛 10 HKD：
     *   800 / 130 = 6.15 HKD 成本，占 10 HKD 收入的 **62%**。
     * 邀请渠道每带来一单，毛利先被吃掉六成，规模越大亏得越多。
     *
     * 20% 这个上限是拍的，但它拍在一个有意义的位置上：
     * 与「平台赠送积分占已发积分」的量级相当，且留了调整余地。
     */
    const costHkd = creditsPerInvitePair() / worstRechargeRate();
    const ratio = costHkd / INVITE_REWARD_CONFIG.minPaidAmountHkd;
    expect(
      ratio,
      `单对邀请成本 ${costHkd.toFixed(2)} HKD 占门槛 ${INVITE_REWARD_CONFIG.minPaidAmountHkd} HKD 的 ${(ratio * 100).toFixed(0)}%，超过 20% 上限`
    ).toBeLessThanOrEqual(0.2);
  });

  it("付费门槛不得低于最便宜的在售会员月卡", () => {
    /**
     * 门槛的语义是「怎样算一个真实付费用户」。
     * 低于一个月卡的付费不构成真实转化，为它发奖等于给薅羊毛的人
     * 提供了最低成本的触发方式（充最少的钱触发最多的奖励）。
     */
    const cheapestMonthly = Math.min(
      ...MEMBERSHIP_PLANS.filter((plan) => plan.monthlyPrice > 0).map((plan) => plan.monthlyPrice)
    );
    expect(cheapestMonthly).toBeGreaterThan(0); // 锚点失效保护
    expect(
      INVITE_REWARD_CONFIG.minPaidAmountHkd,
      `门槛 ${INVITE_REWARD_CONFIG.minPaidAmountHkd} 低于最便宜月卡 ${cheapestMonthly}`
    ).toBeGreaterThanOrEqual(cheapestMonthly);
  });

  it("🔒 奖励积分有效期必须严格短于充值积分", () => {
    /**
     * 红线。邀请奖励与平台赠送同属**零成本发放**，
     * 有效期一旦拉到和充值积分（366 天）同级，
     * 用户就能靠拉人头囤积长期积分 —— 等于开了一条绕过付费的发行渠道。
     *
     * 注意用 toBeLessThan 而不是 toBeLessThanOrEqual：
     * 「相等」也是不可接受的，必须严格更短。
     */
    const rechargeDays = CREDIT_EXPIRY_RULES.recharge.days;
    expect(rechargeDays).toBeGreaterThan(300); // 锚点失效保护
    expect(INVITE_REWARD_CONFIG.rewardCreditValidDays).toBeLessThan(rechargeDays);
    // 与 gift 口径保持一致，不得更长。
    expect(INVITE_REWARD_CONFIG.rewardCreditValidDays).toBeLessThanOrEqual(
      CREDIT_EXPIRY_RULES.gift.days
    );
  });

  it("单个邀请人的最大损失敞口必须封顶在可接受范围", () => {
    /**
     * 即便被小号农场打满上限，绝对损失也要有天花板。
     *
     * 这里用「一个邀请人最多领走多少钱」而不是比例 ——
     * 比例约束挡不住"额度不变但把上限从 10 放到 1000"这种改法。
     */
    const maxPayoutCredits =
      INVITE_REWARD_CONFIG.inviterCredits * INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser;
    const maxPayoutHkd = maxPayoutCredits / worstRechargeRate();
    expect(
      maxPayoutHkd,
      `单人最高可领 ${maxPayoutCredits} 分（约 ${maxPayoutHkd.toFixed(0)} HKD），敞口过大`
    ).toBeLessThanOrEqual(60);
  });

  it("单人打满上限时，平台收到的钱必须显著多于发出的奖励", () => {
    /**
     * 上一条只管绝对值，这条管**净额**。
     *
     * 打满上限意味着邀请人促成了 maxRewardedInvitesPerUser 笔付费，
     * 平台最少收到 上限 × 门槛 的收入，同时发出
     * （邀请人 + 被邀请人）× 上限 的积分。后者必须明显小于前者，
     * 否则这个功能在极限情况下是净亏的。
     */
    const n = INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser;
    const revenueHkd = n * INVITE_REWARD_CONFIG.minPaidAmountHkd;
    const costHkd = (creditsPerInvitePair() * n) / worstRechargeRate();
    expect(
      costHkd / revenueHkd,
      `打满上限时成本 ${costHkd.toFixed(0)} HKD / 收入 ${revenueHkd} HKD`
    ).toBeLessThanOrEqual(0.2);
  });

  it("邀请人奖励不得低于被邀请人，否则激励方向反了", () => {
    // 需要被激励去传播的是邀请人。被邀请人本来就要付费，
    // 给他更多反而在鼓励"自己邀自己"的小号玩法。
    expect(INVITE_REWARD_CONFIG.inviterCredits).toBeGreaterThanOrEqual(
      INVITE_REWARD_CONFIG.inviteeCredits
    );
  });

  it("所有额度都是正整数，绑定有效期有限", () => {
    for (const key of ["inviterCredits", "inviteeCredits", "maxRewardedInvitesPerUser", "bindingValidDays", "rewardCreditValidDays", "minPaidAmountHkd"] as const) {
      const value = INVITE_REWARD_CONFIG[key];
      expect(Number.isInteger(value), `${key} 不是整数：${value}`).toBe(true);
      expect(value, `${key} 必须为正：${value}`).toBeGreaterThan(0);
    }
    // 绑定关系不能永久有效，否则历史绑定会在任意远期被激活。
    expect(INVITE_REWARD_CONFIG.bindingValidDays).toBeLessThanOrEqual(90);
  });
});
