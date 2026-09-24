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

  it("按上海时区归一跨日的 UTC 时间，不取字面日期前缀", () => {
    // ⚠️⚠️⚠️ 防回归：`2026-07-04T16:30:00.000Z` 的上海时间是 07-05 00:30。
    // 曾经的实现用 /^(\d{4})[/-](\d{2})[/-](\d{2})/ 直接取前缀 → 算成 07-04，
    // 于是列表显示 07/05（展示侧按上海换算）却按 07-05 筛不出来，差一天且零报错。
    const orders = [
      { id: "utc-cross-day", user: "Sofa Lab", amount: 99, paidAt: "2026-07-04T16:30:00.000Z" },
      { id: "local-same-day", user: "Sofa Lab", amount: 99, paidAt: "2026/07/05 00:30:00" },
      { id: "offset-cross-day", user: "Sofa Lab", amount: 99, paidAt: "2026-07-04T18:30:00+02:00" },
    ];
    const run = (paidFrom: string, paidTo: string) => filterAdminOrders(orders, {
      query: "",
      paidFrom,
      paidTo,
      amountMin: "",
      amountMax: "",
    }).map((order) => order.id);

    expect(run("2026-07-05", "2026-07-05")).toEqual(["utc-cross-day", "local-same-day", "offset-cross-day"]);
    expect(run("2026-07-04", "2026-07-04")).toEqual([]);
  });

  it("无时区标记的本地串按字面日期处理，不受运行时时区影响", () => {
    // ⚠️ 落库后的 paidAt 就是 `"2026/07/05 10:01:00"` 这种本地串。
    // 对它走 Date.parse 会按运行环境时区解析，服务器换个 TZ 结果就漂。
    const result = filterAdminOrders([
      { id: "ord-local", user: "Sofa Lab", amount: 99, paidAt: "2026/07/05 00:10:00" },
    ], {
      query: "",
      paidFrom: "2026-07-05",
      paidTo: "2026-07-05",
      amountMin: "",
      amountMax: "",
    });

    expect(result.map((order) => order.id)).toEqual(["ord-local"]);
  });
});
