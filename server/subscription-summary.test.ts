import { describe, expect, it } from "vitest";
import { classifyOrderKind, summarizeSubscriptionOrders } from "./admin-store";

/**
 * 支付订单分类统计的行为测试。
 *
 * 这里保护的全是**会静默算错**的逻辑 —— 统计出错不会抛异常，
 * 只会给出一个看起来很正常的错数字，而财务会拿它去做决策。
 * 三类高危：
 *   1. 品类判错 → 订阅收入和充值收入互相串台
 *   2. 时区差 8 小时 → 跨月/跨周订单落错桶
 *   3. 订阅有效性判错 → 把历史订阅者算成当前订阅中
 */

/** 造一张订单。字段少写一个 TS 就会报，这里给一套最小完整默认值。 */
function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_default",
    userId: "u1",
    user: "tester",
    packageName: "Pro",
    channel: "微信支付",
    amount: 129,
    expectedCredits: 28000,
    issuedCredits: 28000,
    status: "paid",
    createdAt: "2026/09/10 10:00:00",
    paidAt: "2026/09/10 10:00:00",
    event: "支付成功",
    reconciliation: "matched",
    ...overrides,
  } as never;
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    name: "tester",
    account: "tester@artx.com",
    email: "tester@artx.com",
    plan: "Pro 专业版",
    credits: 0,
    totalRecharge: 0,
    totalConsumed: 0,
    frozenCredits: 0,
    expiredCredits: 0,
    status: "normal",
    registeredAt: "2026/09/01 10:00:00",
    lastSeen: "刚刚",
    risk: "低",
    ...overrides,
  } as never;
}

/** 造一份最小 AdminData。只填统计会读到的三个数组。 */
function makeData(overrides: Record<string, unknown> = {}) {
  return {
    users: [],
    orders: [],
    credits: [],
    creditBatches: [],
    creditNotifications: [],
    aiTasks: [],
    providers: [],
    feedback: [],
    alerts: [],
    riskEvents: [],
    auditLogs: [],
    plans: [],
    capabilityStatus: [],
    ...overrides,
  } as never;
}

/** 2026-09-18 12:00:00 UTC+8 = 2026-09-18T04:00:00Z。周五。 */
const NOW_MS = Date.UTC(2026, 8, 18, 4, 0, 0);

describe("订单品类判定", () => {
  it("会员单认 planId，优先级最高", () => {
    expect(classifyOrderKind(makeOrder({ planId: "pro", packageName: "Pro" }))).toBe("subscription");
  });

  it("充值单认 creditKind", () => {
    expect(classifyOrderKind(makeOrder({ creditKind: "recharge", packageName: "积分充值" }))).toBe("recharge");
  });

  it("历史订单没有 creditKind 时，靠 id 前缀兜底", () => {
    // 生产库里的 ord_test_001 就是这种：既没 creditKind 也没规范的 packageName。
    expect(classifyOrderKind(makeOrder({ id: "rch_legacy", packageName: "" }))).toBe("recharge");
  });

  it("第三方代收单归入「其他」，不混进订阅或充值", () => {
    expect(classifyOrderKind(makeOrder({
      id: "ext_001",
      creditKind: "manual",
      packageName: "接口方代收确认",
    }))).toBe("other");
  });

  it("🔴 名字里带套餐名的充值包不能被误判成订阅", () => {
    // getMembershipPlanFromName 用 includes 模糊匹配，
    // 「Pro 用户专属充值包」会命中 Pro。必须先排除充值才不会串台。
    // 判定顺序一旦调换（先判 membership 再排除充值），这条就会挂。
    expect(classifyOrderKind(makeOrder({
      id: "rch_bonus",
      creditKind: "recharge",
      packageName: "Pro 用户专属充值包",
    }))).toBe("recharge");
  });
});

describe("订阅用户口径", () => {
  it("planExpiresAt 未过期才算当前订阅用户", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1", planExpiresAt: "2026-10-18T00:00:00.000Z" })],
    }), NOW_MS);
    expect(summary.activeSubscriberCount).toBe(1);
  });

  it("planExpiresAt 已过期不算", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1", planExpiresAt: "2026-09-01T00:00:00.000Z" })],
    }), NOW_MS);
    expect(summary.activeSubscriberCount).toBe(0);
  });

  it("🔴 有 membership 但已到期降级的用户，不能算成当前订阅中", () => {
    // expireMemberships 到期降级时只清 planExpiresAt，membership 对象会留在原地。
    // 如果拿 membership 是否存在来判有效，所有历史订阅者都会被算成在订阅。
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({
        id: "u1",
        plan: "Free 免费版",
        planExpiresAt: undefined,
        membership: { orderId: "ord_1", planId: "pro", monthlyCredits: 28000, totalPeriods: 12, issuedPeriods: 12, startedAt: "2025-09-01T00:00:00.000Z" },
      })],
    }), NOW_MS);
    expect(summary.activeSubscriberCount).toBe(0);
  });

  it("🔴 super_admin 的角色派发档位不算付费订阅", () => {
    // 这些账号的 Studio 档是白给的，没有 planExpiresAt、没有订单。
    // 拿 plan !== Free 判定会把员工账号算成付费用户，虚报订阅数。
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "admin1", role: "super_admin", plan: "Studio 工作室版", planExpiresAt: undefined })],
    }), NOW_MS);
    expect(summary.activeSubscriberCount).toBe(0);
  });
});

describe("到期未续费（退订）口径", () => {
  it("统计审计日志里的「会员到期降级」，按用户去重", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      auditLogs: [
        { id: "a1", actorId: "system", actorName: "系统", action: "会员到期降级", target: "u1", createdAt: "2026/09/10 10:00:00" },
        { id: "a2", actorId: "system", actorName: "系统", action: "会员到期降级", target: "u1", createdAt: "2026/09/15 10:00:00" },
        { id: "a3", actorId: "system", actorName: "系统", action: "会员到期降级", target: "u2", createdAt: "2026/09/16 10:00:00" },
      ],
    }), NOW_MS);
    // u1 降级两次（买了又过期又买又过期）只算 1 个流失用户。
    expect(summary.churnedSubscriberCount).toBe(2);
  });

  it("🔴 「无有效订阅降级」是脏数据修复，不能算流失", () => {
    // 那是给孤儿付费档做的数据订正（见 expireMemberships 步骤 3），
    // 混进流失数会让退订率凭空虚高。
    const summary = summarizeSubscriptionOrders(makeData({
      auditLogs: [
        { id: "a1", actorId: "system", actorName: "系统", action: "无有效订阅降级", target: "u1", createdAt: "2026/09/10 10:00:00" },
      ],
    }), NOW_MS);
    expect(summary.churnedSubscriberCount).toBe(0);
  });
});

describe("本周 / 本月新增订阅", () => {
  it("按首次支付时间落桶，续费不重复计入新增", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" })],
      orders: [
        makeOrder({ id: "ord_1", userId: "u1", planId: "pro", paidAt: "2026/08/10 10:00:00" }),
        makeOrder({ id: "ord_2", userId: "u1", planId: "pro", paidAt: "2026/09/10 10:00:00" }),
      ],
    }), NOW_MS);
    // 首单在 8 月，9 月这单是续费 → 本月新增应为 0。
    expect(summary.monthlyNewSubscriberCount).toBe(0);
  });

  it("本月首单计入本月新增，并给出用户 ID", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" }), makeUser({ id: "u2", account: "u2@artx.com" })],
      orders: [
        makeOrder({ id: "ord_1", userId: "u1", planId: "pro", paidAt: "2026/09/05 10:00:00" }),
        makeOrder({ id: "ord_2", userId: "u2", planId: "lite", paidAt: "2026/09/12 10:00:00" }),
      ],
    }), NOW_MS);
    expect(summary.monthlyNewSubscriberCount).toBe(2);
    // 按首次支付时间升序
    expect(summary.monthlyNewSubscriberIds).toEqual(["u1", "u2"]);
  });

  it("本周只算周一及以后（2026-09-18 是周五，周一是 09-14）", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" }), makeUser({ id: "u2" })],
      orders: [
        makeOrder({ id: "ord_1", userId: "u1", planId: "pro", paidAt: "2026/09/13 23:59:59" }),
        makeOrder({ id: "ord_2", userId: "u2", planId: "pro", paidAt: "2026/09/14 00:00:01" }),
      ],
    }), NOW_MS);
    expect(summary.weeklyNewSubscriberCount).toBe(1);
    expect(summary.monthlyNewSubscriberCount).toBe(2);
  });

  it("🔴 月初边界：UTC+8 的 09/01 00:00 必须算本月，不能因时区漂到上月", () => {
    // 这是时区 bug 的典型表现 —— 用 Date.parse 解析 "2026/09/01 00:00:30"
    // 会按服务器本地时区算，在 UTC 服务器上得到的是 UTC+0 的 09/01 00:00，
    // 减 8 小时后落到 8/31，本月新增就少一个人。
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" })],
      orders: [makeOrder({ id: "ord_1", userId: "u1", planId: "pro", paidAt: "2026/09/01 00:00:30" })],
    }), NOW_MS);
    expect(summary.monthlyNewSubscriberCount).toBe(1);
  });

  it("🔴 月末边界：UTC+8 的 08/31 23:59 不能被算进 9 月", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" })],
      orders: [makeOrder({ id: "ord_1", userId: "u1", planId: "pro", paidAt: "2026/08/31 23:59:59" })],
    }), NOW_MS);
    expect(summary.monthlyNewSubscriberCount).toBe(0);
  });

  it("未支付订单不计入新增", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" }), makeUser({ id: "u2" })],
      orders: [
        makeOrder({ id: "ord_1", userId: "u1", planId: "pro", status: "pending", paidAt: undefined }),
        makeOrder({ id: "ord_2", userId: "u2", planId: "pro", status: "refunded" }),
      ],
    }), NOW_MS);
    expect(summary.monthlyNewSubscriberCount).toBe(0);
  });
});

describe("品类汇总", () => {
  it("订阅与充值分开汇总金额，互不串台", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      users: [makeUser({ id: "u1" })],
      orders: [
        makeOrder({ id: "ord_1", userId: "u1", planId: "pro", amount: 129, paidAt: "2026/09/10 10:00:00" }),
        makeOrder({ id: "rch_1", userId: "u1", creditKind: "recharge", packageName: "积分充值", amount: 50, paidAt: "2026/09/11 10:00:00" }),
        makeOrder({ id: "ext_1", userId: "u1", creditKind: "manual", packageName: "接口方代收确认", amount: 20, paidAt: "2026/09/12 10:00:00" }),
      ],
    }), NOW_MS);

    const byKind = Object.fromEntries(summary.byKind.map((row) => [row.kind, row]));
    expect(byKind.subscription.paidAmount).toBe(129);
    expect(byKind.recharge.paidAmount).toBe(50);
    expect(byKind.other.paidAmount).toBe(20);
  });

  it("byKind 顺序固定为 订阅 / 充值 / 其他", () => {
    const summary = summarizeSubscriptionOrders(makeData(), NOW_MS);
    expect(summary.byKind.map((row) => row.kind)).toEqual(["subscription", "recharge", "other"]);
  });

  it("退款金额缺失时回退到订单原始金额", () => {
    const summary = summarizeSubscriptionOrders(makeData({
      orders: [makeOrder({ id: "ord_1", planId: "pro", status: "refunded", amount: 129, refundAmount: undefined })],
    }), NOW_MS);
    const subscription = summary.byKind.find((row) => row.kind === "subscription")!;
    expect(subscription.refundedCount).toBe(1);
    expect(subscription.refundedAmount).toBe(129);
  });

  it("空数据不报错，全部返回 0", () => {
    const summary = summarizeSubscriptionOrders(makeData(), NOW_MS);
    expect(summary.activeSubscriberCount).toBe(0);
    expect(summary.monthlyNewSubscriberIds).toEqual([]);
    expect(summary.byKind.every((row) => row.paidCount === 0)).toBe(true);
  });
});

describe("订单截断告警", () => {
  it("下发保留上限与当前条数，供前端判断是否已在丢历史单", () => {
    const summary = summarizeSubscriptionOrders(makeData(), NOW_MS);
    // 200 太小，统计会静默漏数；这里锁住已提高后的值。
    expect(summary.orderRetention).toBe(3000);
    expect(summary.orderCount).toBe(0);
  });
});
