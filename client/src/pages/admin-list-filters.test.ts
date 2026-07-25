import { describe, expect, it } from "vitest";

import { filterAdminOrders, filterAdminUsers } from "./admin-list-filters";

describe("admin list filters", () => {
  it("filters accounts by name, type, and Shanghai registration date", () => {
    const result = filterAdminUsers([
      { id: "u-1", name: "Sofa Lab", email: "sofa@example.com", plan: "Pro", accountType: "test", registeredAt: "2026-07-17T01:00:00.000Z" },
      { id: "u-2", name: "Lamp Shop", email: "lamp@example.com", plan: "Free", accountType: "regular", registeredAt: "2026-07-16T01:00:00.000Z" },
    ], {
      query: "sofa",
      accountType: "test",
      registeredFrom: "2026-07-17",
      registeredTo: "2026-07-17",
    });

    expect(result.map((user) => user.id)).toEqual(["u-1"]);
  });

  it("filters orders by account, payment date, and inclusive amount range", () => {
    const result = filterAdminOrders([
      { id: "ord-1", user: "Sofa Lab", amount: 99, paidAt: "2026-07-17T01:00:00.000Z" },
      { id: "ord-2", user: "Lamp Shop", amount: 19, paidAt: "2026-07-16T01:00:00.000Z" },
    ], {
      query: "sofa",
      paidFrom: "2026-07-17",
      paidTo: "2026-07-17",
      amountMin: "99",
      amountMax: "99",
    });

    expect(result.map((order) => order.id)).toEqual(["ord-1"]);
  });
});
