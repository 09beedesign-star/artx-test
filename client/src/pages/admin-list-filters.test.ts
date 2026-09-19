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

  it("matches user id, login account, and organization, not only name and email", () => {
    const users = [
      { id: "6bb44758-0f4a", name: "Sofa Lab", email: "sofa@example.com", account: "sofa_login", organization: "Sofa Group", plan: "Pro" },
      { id: "u-2", name: "Lamp Shop", email: "lamp@example.com", account: "lamp_login", organization: "Lamp Group", plan: "Free" },
    ];
    const run = (query: string) => filterAdminUsers(users, {
      query,
      accountType: "all",
      registeredFrom: "",
      registeredTo: "",
    }).map((user) => user.id);

    expect(run("6bb44758")).toEqual(["6bb44758-0f4a"]);
    expect(run("sofa_login")).toEqual(["6bb44758-0f4a"]);
    expect(run("lamp group")).toEqual(["u-2"]);
  });

  it("does not match a query spanning two different fields", () => {
    const result = filterAdminUsers([
      { id: "u-1", name: "Sofa e", email: "x@example.com", plan: "p Lab" },
    ], {
      query: "e p",
      accountType: "all",
      registeredFrom: "",
      registeredTo: "",
    });

    expect(result).toEqual([]);
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
