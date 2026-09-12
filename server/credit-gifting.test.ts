import { describe, expect, it } from "vitest";

import {
  DAILY_GIFT_MAX_CREDITS_PER_USER,
  DEFAULT_GIFT_EXPIRY_DAYS,
  GIFT_LEDGER_TYPE,
  SINGLE_GIFT_MAX_CREDITS,
  grantCredits,
  type GiftableData,
  type GiftableUser,
} from "./credit-gifting";

function makeData(): GiftableData {
  return { credits: [], creditBatches: [], creditNotifications: [] };
}

function makeUser(overrides: Partial<GiftableUser> = {}): GiftableUser {
  return { id: "u_1", name: "测试用户", credits: 100, ...overrides };
}

describe("grantCredits 统一赠送服务", () => {
  it("一次赠送同时写入流水、批次、通知并更新余额", () => {
    const data = makeData();
    const user = makeUser();

    const result = grantCredits(data, {
      user,
      amount: 500,
      reason: "运营活动奖励",
      source: "admin/batch-gift",
      operator: "admin",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    // 四处必须同时落地，缺一处都会导致对账不平。
    expect(data.credits).toHaveLength(1);
    expect(data.creditBatches).toHaveLength(1);
    expect(data.creditNotifications).toHaveLength(1);
    expect(user.credits).toBe(600);

    expect(data.credits[0].delta).toBe(500);
    expect(data.credits[0].type).toBe(GIFT_LEDGER_TYPE);
    expect(data.creditBatches[0].kind).toBe("gift");
    expect(data.creditBatches[0].remainingCredits).toBe(500);
  });

  it("赠送积分默认 30 天过期", () => {
    const data = makeData();
    const user = makeUser();

    grantCredits(data, {
      user,
      amount: 100,
      reason: "新用户注册赠送",
      source: "rule/signup",
      operator: "系统",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    expect(DEFAULT_GIFT_EXPIRY_DAYS).toBe(30);
    expect(data.creditBatches[0].expiresAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("通知里的余额是赠送后的余额，不是赠送前的", () => {
    // 用户看到的弹窗如果显示旧余额，会直接引发客诉。
    const data = makeData();
    const user = makeUser({ credits: 100 });

    grantCredits(data, {
      user,
      amount: 400,
      reason: "运营补偿",
      source: "admin/manual",
      operator: "admin",
    });

    expect(data.creditNotifications[0].balance).toBe(500);
    expect(data.creditNotifications[0].balance).toBe(user.credits);
  });

  it("幂等键命中时不重复入账", () => {
    const data = makeData();
    const user = makeUser();

    const first = grantCredits(data, {
      user,
      amount: 200,
      reason: "首充赠送",
      source: "order/o_1",
      operator: "系统",
      idempotencyKey: "first-recharge:o_1",
    });
    const second = grantCredits(data, {
      user,
      amount: 200,
      reason: "首充赠送",
      source: "order/o_1",
      operator: "系统",
      idempotencyKey: "first-recharge:o_1",
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    // 余额只涨一次，流水也只有一条。
    expect(user.credits).toBe(300);
    expect(data.credits).toHaveLength(1);
  });

  it("没有幂等键时，同额度重复赠送是允许的", () => {
    // 运营一天内给同一个人发两笔同额奖励是合法操作，
    // 不能被近似判重误杀。
    const data = makeData();
    const user = makeUser();

    grantCredits(data, {
      user, amount: 100, reason: "活动奖励", source: "admin/gift", operator: "admin",
    });
    const second = grantCredits(data, {
      user, amount: 100, reason: "活动奖励", source: "admin/gift", operator: "admin",
    });

    expect(second.success).toBe(true);
    expect(data.credits).toHaveLength(2);
    expect(user.credits).toBe(300);
  });

  it("拒绝非正数赠送", () => {
    const data = makeData();
    const user = makeUser();

    expect(grantCredits(data, {
      user, amount: 0, reason: "x", source: "s", operator: "admin",
    }).success).toBe(false);
    expect(grantCredits(data, {
      user, amount: -100, reason: "x", source: "s", operator: "admin",
    }).success).toBe(false);

    // 失败时不能留下任何副作用。
    expect(user.credits).toBe(100);
    expect(data.credits).toHaveLength(0);
    expect(data.creditBatches).toHaveLength(0);
    expect(data.creditNotifications).toHaveLength(0);
  });

  it("超出单笔上限直接拒绝", () => {
    const data = makeData();
    const user = makeUser();

    const result = grantCredits(data, {
      user,
      amount: SINGLE_GIFT_MAX_CREDITS + 1,
      reason: "误操作",
      source: "admin/gift",
      operator: "admin",
    });

    expect(result.success).toBe(false);
    expect(user.credits).toBe(100);
  });

  it("超出单用户单日累计上限时拒绝", () => {
    const data = makeData();
    const user = makeUser();
    const day = "2026-09-12T03:00:00.000Z";

    // 先把当日额度耗到接近上限。
    let granted = 0;
    while (granted + SINGLE_GIFT_MAX_CREDITS <= DAILY_GIFT_MAX_CREDITS_PER_USER) {
      const result = grantCredits(data, {
        user,
        amount: SINGLE_GIFT_MAX_CREDITS,
        reason: "压测发放",
        source: "admin/gift",
        operator: "admin",
        createdAt: day,
      });
      expect(result.success).toBe(true);
      granted += SINGLE_GIFT_MAX_CREDITS;
    }

    const overflow = grantCredits(data, {
      user,
      amount: 1,
      reason: "再发一笔",
      source: "admin/gift",
      operator: "admin",
      createdAt: day,
    });
    expect(overflow.success).toBe(false);
  });

  it("单日额度按自然日隔离，跨天重新计算", () => {
    const data = makeData();
    const user = makeUser();

    grantCredits(data, {
      user,
      amount: SINGLE_GIFT_MAX_CREDITS,
      reason: "前一天发放",
      source: "admin/gift",
      operator: "admin",
      createdAt: "2026-09-11T10:00:00.000Z",
    });

    const nextDay = grantCredits(data, {
      user,
      amount: SINGLE_GIFT_MAX_CREDITS,
      reason: "第二天发放",
      source: "admin/gift",
      operator: "admin",
      createdAt: "2026-09-12T10:00:00.000Z",
    });

    expect(nextDay.success).toBe(true);
  });

  it("单日额度只统计赠送流水，不把充值入账算进来", () => {
    const data = makeData();
    const user = makeUser();
    // 手动塞一条大额充值流水，它不应该占用赠送额度。
    data.credits.push({
      id: "cr_recharge",
      userId: user.id,
      user: user.name,
      type: "充值入账",
      delta: DAILY_GIFT_MAX_CREDITS_PER_USER,
      reason: "用户充值",
      source: "order/o_x",
      operator: "系统",
      createdAt: "2026-09-12T01:00:00.000Z",
    });

    const result = grantCredits(data, {
      user,
      amount: 1000,
      reason: "正常赠送",
      source: "admin/gift",
      operator: "admin",
      createdAt: "2026-09-12T02:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("createdAt 非法时拒绝，不产生半截数据", () => {
    const data = makeData();
    const user = makeUser();

    const result = grantCredits(data, {
      user,
      amount: 100,
      reason: "x",
      source: "s",
      operator: "admin",
      createdAt: "not-a-date",
    });

    expect(result.success).toBe(false);
    expect(data.credits).toHaveLength(0);
    expect(data.creditBatches).toHaveLength(0);
    expect(user.credits).toBe(100);
  });
});
