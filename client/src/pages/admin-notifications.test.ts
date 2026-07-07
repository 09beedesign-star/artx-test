import { describe, expect, it } from "vitest";

import { buildAdminNotifications } from "./admin-notifications";

describe("buildAdminNotifications", () => {
  it("groups order, security, and feedback sources into admin message tabs", () => {
    const messages = buildAdminNotifications({
      orders: [
        {
          id: "ord_1001",
          user: "alice@example.com",
          channel: "微信支付",
          amount: 90,
          credits: 900,
          status: "pending",
          createdAt: "2026/07/07 10:00:00",
          reconciliation: "pending",
        },
      ],
      alerts: [
        {
          id: "al_1001",
          category: "风控",
          title: "异常登录拦截",
          detail: "同一 IP 高频尝试后台登录",
          severity: "critical",
          time: "2026/07/07 10:01:00",
          owner: "Security",
          unread: true,
          linkedSection: "risk",
        },
      ],
      feedback: [
        {
          id: "fb_1001",
          user: "bob@example.com",
          title: "充值后没有到账",
          module: "支付订单",
          status: "new",
          priority: "P1",
          createdAt: "2026/07/07 10:02:00",
          linkedOrderId: "ord_1001",
        },
      ],
      riskEvents: [
        {
          id: "risk_1001",
          title: "支付回调签名异常",
          detail: "第三方回调签名校验失败",
          status: "open",
          severity: "high",
          target: "ord_1001",
          createdAt: "2026/07/07 10:03:00",
        },
      ],
    });

    expect(messages.order).toEqual([
      expect.objectContaining({
        id: "order:ord_1001",
        title: "alice@example.com · 待确认",
        targetSection: "orders",
        targetId: "ord_1001",
        unread: true,
      }),
    ]);
    expect(messages.security.map((item) => item.id)).toEqual(["risk:risk_1001", "alert:al_1001"]);
    expect(messages.voice).toEqual([
      expect.objectContaining({
        id: "feedback:fb_1001",
        title: "bob@example.com · 充值后没有到账",
        targetSection: "orders",
        targetId: "ord_1001",
        unread: true,
      }),
    ]);
  });
});
