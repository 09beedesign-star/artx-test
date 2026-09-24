import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CSV_BOM,
  ORDER_EXPORT_COLUMNS,
  buildOrderExportFileName,
  buildOrderExportRow,
  escapeCsvCell,
  exportOrdersToCsv,
  filterOrdersByPaidDate,
  formatExportAmount,
  resolveOrderAccount,
  serializeOrdersToCsv,
  type OrderExportRecord,
} from "./admin-order-export";

const adminPageSource = readFileSync(
  fileURLToPath(new URL("./AdminPrototypePage.tsx", import.meta.url)),
  "utf8",
);

function order(overrides: Partial<OrderExportRecord> = {}): OrderExportRecord {
  return {
    id: "ord-1",
    user: "Sofa Lab",
    amount: 128,
    channel: "微信支付",
    createdAt: "2026/07/05 10:01:00",
    paidAt: "2026/07/05 10:03:00",
    ...overrides,
  };
}

describe("支付订单导出：账号列", () => {
  it("优先用登录账号，其次邮箱、用户 ID，最后才是显示名", () => {
    expect(resolveOrderAccount(order({ userAccount: "sofa_login", userEmail: "s@x.com", userId: "u-1" }))).toBe("sofa_login");
    expect(resolveOrderAccount(order({ userEmail: "s@x.com", userId: "u-1" }))).toBe("s@x.com");
    expect(resolveOrderAccount(order({ userId: "u-1" }))).toBe("u-1");
    expect(resolveOrderAccount(order())).toBe("Sofa Lab");
  });

  it("空白字符串不算有效账号，必须继续往下回落", () => {
    // ⚠️ 服务端把没填的字段下发成 "" 或 "   " 是常见的，
    // 只判 undefined 会让账号列变成空白，用户以为这列没导出来。
    expect(resolveOrderAccount(order({ userAccount: "   ", userEmail: "s@x.com" }))).toBe("s@x.com");
  });

  it("四个来源全空时给 - 而不是空单元格", () => {
    expect(resolveOrderAccount(order({ user: "" }))).toBe("-");
  });
});

describe("支付订单导出：时间口径", () => {
  it("本地时间串原样导出，不会被当成 UTC 而偏移 8 小时", () => {
    // ⚠️ 这是最容易零报错翻车的一条：`"2026/07/05 10:01:00"` 是 UTC+8 本地串，
    // 用 Date.parse 解析会得到 18:01，页面和导出对不上。
    const row = buildOrderExportRow(order());
    expect(row.下单时间).toBe("2026/07/05 10:01:00");
    expect(row.支付时间).toBe("2026/07/05 10:03:00");
    expect(row.下单时间).not.toContain("18:01");
  });

  it("ISO 时间串按上海时区换算后导出", () => {
    const row = buildOrderExportRow(order({
      createdAt: "2026-07-05T02:01:00.000Z",
      paidAt: "2026-07-05T02:03:00.000Z",
    }));
    expect(row.下单时间).toBe("2026/07/05 10:01:00");
    expect(row.支付时间).toBe("2026/07/05 10:03:00");
  });

  it("未支付订单的支付时间显示「待支付」，下单时间不会借用这个词", () => {
    const row = buildOrderExportRow(order({ paidAt: undefined, createdAt: "" }));
    expect(row.支付时间).toBe("待支付");
    expect(row.下单时间).toBe("未提供精确时间");
  });
});

describe("支付订单导出：时间过滤", () => {
  const orders = [
    order({ id: "a", paidAt: "2026/07/04 23:59:00" }),
    order({ id: "b", paidAt: "2026/07/05 00:00:00" }),
    order({ id: "c", paidAt: "2026/07/06 12:00:00" }),
    order({ id: "d", paidAt: undefined }),
  ];
  const ids = (list: OrderExportRecord[]) => list.map((item) => item.id);

  it("起止日期都是闭区间", () => {
    expect(ids(filterOrdersByPaidDate(orders, { from: "2026-07-05", to: "2026-07-06" }))).toEqual(["b", "c"]);
  });

  it("只给开始日期时取该日及之后", () => {
    expect(ids(filterOrdersByPaidDate(orders, { from: "2026-07-05" }))).toEqual(["b", "c"]);
  });

  it("只给结束日期时取该日及之前", () => {
    expect(ids(filterOrdersByPaidDate(orders, { to: "2026-07-05" }))).toEqual(["a", "b"]);
  });

  it("不设范围时保留全部订单，包括未支付的", () => {
    // ⚠️ 默认导出丢数据是零报错事故：用户点导出拿到文件，不会去数条数。
    expect(ids(filterOrdersByPaidDate(orders, {}))).toEqual(["a", "b", "c", "d"]);
  });

  it("设了范围时排除没有支付时间的订单", () => {
    expect(ids(filterOrdersByPaidDate(orders, { from: "2026-07-01", to: "2026-12-31" }))).toEqual(["a", "b", "c"]);
  });

  it("ISO 与本地串混在一起也按同一口径过滤", () => {
    const mixed = [
      order({ id: "iso", paidAt: "2026-07-04T16:30:00.000Z" }), // 上海时间 2026-07-05 00:30
      order({ id: "local", paidAt: "2026/07/05 00:30:00" }),
    ];
    expect(ids(filterOrdersByPaidDate(mixed, { from: "2026-07-05", to: "2026-07-05" }))).toEqual(["iso", "local"]);
  });
});

describe("支付订单导出：金额与支付方式", () => {
  it("金额带 ¥ 且固定两位小数", () => {
    expect(formatExportAmount(128)).toBe("¥128.00");
    expect(formatExportAmount(9.5)).toBe("¥9.50");
    expect(formatExportAmount(0)).toBe("¥0.00");
  });

  it("金额异常时兜底为 ¥0.00 而不是 ¥NaN", () => {
    expect(formatExportAmount(Number.NaN)).toBe("¥0.00");
    expect(formatExportAmount(Number.POSITIVE_INFINITY)).toBe("¥0.00");
  });

  it("支付方式缺失时给「未知」", () => {
    expect(buildOrderExportRow(order({ channel: "" })).支付方式).toBe("未知");
    expect(buildOrderExportRow(order({ channel: "支付宝" })).支付方式).toBe("支付宝");
  });
});

describe("支付订单导出：CSV 序列化", () => {
  it("含逗号、引号、换行的单元格按 RFC 4180 转义", () => {
    expect(escapeCsvCell("纯文本")).toBe("纯文本");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('他说"好"')).toBe('"他说""好"""');
    expect(escapeCsvCell("第一行\n第二行")).toBe('"第一行\n第二行"');
  });

  it("带逗号的账号不会把列挤错位", () => {
    const csv = serializeOrdersToCsv([buildOrderExportRow(order({ userAccount: "Lab, Inc" }))]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"Lab, Inc",')).toBe(true);
    expect(dataLine.split(",").length).toBeGreaterThan(5); // 引号内的逗号确实存在
    expect(dataLine).toContain("¥128.00");
  });

  it("文件以 UTF-8 BOM 开头，否则 Excel 打开中文乱码", () => {
    const csv = serializeOrdersToCsv([]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("表头就是需求指定的五列且顺序固定", () => {
    expect([...ORDER_EXPORT_COLUMNS]).toEqual(["账号", "下单时间", "支付时间", "支付金额", "支付方式"]);
    const header = serializeOrdersToCsv([]).slice(CSV_BOM.length);
    expect(header).toBe("账号,下单时间,支付时间,支付金额,支付方式");
  });

  it("行分隔用 \\r\\n", () => {
    const csv = serializeOrdersToCsv([buildOrderExportRow(order())]);
    expect(csv).toContain("\r\n");
  });
});

describe("支付订单导出：入口函数与文件名", () => {
  it("exportOrdersToCsv 返回的行数与筛选结果一致", () => {
    const result = exportOrdersToCsv([
      order({ id: "a", paidAt: "2026/07/05 10:00:00" }),
      order({ id: "b", paidAt: "2026/07/09 10:00:00" }),
    ], { from: "2026-07-05", to: "2026-07-05" });

    expect(result.rowCount).toBe(1);
    expect(result.content.split("\r\n")).toHaveLength(2); // 表头 + 1 行
  });

  it("文件名带时间范围，导出多份不互相覆盖", () => {
    expect(buildOrderExportFileName({ from: "2026-07-01", to: "2026-07-31" }, "2026-09-24"))
      .toBe("artx-支付订单-2026-07-01_2026-07-31.csv");
    expect(buildOrderExportFileName({ to: "2026-07-31" }, "2026-09-24"))
      .toBe("artx-支付订单-起始_2026-07-31.csv");
    expect(buildOrderExportFileName({}, "2026-09-24"))
      .toBe("artx-支付订单-2026-09-24.csv");
  });

  it("文件名不含 Windows 非法字符", () => {
    const name = buildOrderExportFileName({ from: "2026-07-01" }, "2026-09-24");
    expect(/[:*?"<>|\\/]/.test(name)).toBe(false);
  });
});

describe("后台页面接线（源码断言）", () => {
  it("导出按钮存在且绑定 handleExportOrders", () => {
    expect(adminPageSource).toContain("导出订单表格");
    expect(adminPageSource).toContain("onClick={handleExportOrders}");
  });

  it("导出传的是 filteredOrders 而不是只有一页的 visibleOrders", () => {
    // ⚠️ 传错了会静默只导出当前页，界面毫无异常。
    expect(adminPageSource).toContain("exportOrdersToCsv(filteredOrders, range)");
    expect(adminPageSource).not.toContain("exportOrdersToCsv(visibleOrders");
    expect(adminPageSource).not.toContain("exportOrdersToCsv(adminData.orders");
  });

  it("导出复用页面既有的支付时间过滤状态", () => {
    expect(adminPageSource).toContain("const range = { from: paidFrom, to: paidTo };");
  });

  it("前端 Order 类型声明了账号字段，否则账号列取不到值", () => {
    expect(adminPageSource).toContain("userAccount?: string;");
    expect(adminPageSource).toContain("userEmail?: string;");
  });

  it("页面不自己做 CSV 序列化，全部走导出模块收口", () => {
    expect(adminPageSource).not.toContain("\\uFEFF");
    expect(adminPageSource).toContain('from "./admin-order-export"');
  });

  it("零结果时给出提示而不是下载一个空文件", () => {
    expect(adminPageSource).toContain("没有可导出的支付订单");
  });
});
