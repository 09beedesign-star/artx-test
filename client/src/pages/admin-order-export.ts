import { formatExactOrderTime } from "./admin-order-time";
import { shanghaiDate } from "./admin-list-filters";

/**
 * 支付订单导出（后台管理端）。
 *
 * 需求口径（2026-09-24）：导出成表格，带时间过滤，每行必须有
 * **账号 / 下单时间 / 支付时间 / 支付金额 / 支付方式**。
 *
 * ⚠️⚠️⚠️ 三条踩过的坑，改这个文件前先读完：
 *
 * 1. **时间串不是 ISO**。订单落库后被 server/admin-store.ts 的 ensureBillingConsistency
 *    改写成 `"2026/07/05 10:01:00"` 这种 **UTC+8 本地串**。
 *    对它用 `Date.parse` 会被当成 UTC 解析 → **整整差 8 小时，且零报错**
 *    （服务端 resolveOrderPaidMs 明确禁止过这件事）。
 *    ✅ 所以本文件一律复用既有事实源：日期归一化用 `shanghaiDate`，
 *    展示格式化用 `formatExactOrderTime`，**不自己写时间解析**。
 *
 * 2. **导出的是「筛选后的全部」，不是「当前这一页」**。
 *    页面里 `visibleOrders = pageItems(filteredOrders, orderPage)` 只有一页，
 *    传它进来会导出 20 条就完事，而且**界面看不出任何异常** ——
 *    用户以为导全了。调用方必须传 `filteredOrders`。
 *
 * 3. **CSV 必须带 UTF-8 BOM**。不带的话 Excel 会按 GBK 猜，
 *    中文列头直接变乱码。这是「文件能下载」≠「表格能看」的典型。
 */

/** Excel / WPS 认 UTF-8 的唯一方式：文件开头的字节序标记。 */
export const CSV_BOM = "\uFEFF";

export const ORDER_EXPORT_COLUMNS = [
  "账号",
  "下单时间",
  "支付时间",
  "支付金额",
  "支付方式",
] as const;

export type OrderExportRecord = {
  id: string;
  user: string;
  userId?: string;
  /** 服务端 PaymentOrder 一直在下发，前端以前没声明类型所以取不到。 */
  userAccount?: string;
  userEmail?: string;
  amount: number;
  channel: string;
  status?: string;
  createdAt: string;
  paidAt?: string;
};

export type OrderExportRow = {
  账号: string;
  下单时间: string;
  支付时间: string;
  支付金额: string;
  支付方式: string;
};

/**
 * 账号列取值：多级回落。
 *
 * ⚠️ 用户要的是「具体的账号」，`user` 往往是昵称/显示名，重名了根本对不上人。
 * 优先级：登录账号 > 邮箱 > 用户 ID > 显示名。
 * 全都没有才退回 `-`，而不是给空字符串 —— 空单元格在表格里
 * 和「这列没导出来」长得一模一样。
 */
export function resolveOrderAccount(order: OrderExportRecord): string {
  const candidates = [order.userAccount, order.userEmail, order.userId, order.user];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return "-";
}

/**
 * 金额列。带 ¥ 前缀，保留两位小数。
 *
 * ⚠️ 订单结构里**没有 currency 字段**，全站固定人民币元
 * （页面 formatCurrency 也是硬编码 ¥）。这里写死是与现状一致的，
 * 哪天真出了多币种，改的是数据结构不是这一行。
 */
export function formatExportAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "¥0.00";
  return `¥${amount.toFixed(2)}`;
}

/**
 * 时间过滤：只按**支付时间**过滤，口径与页面列表筛选完全一致。
 *
 * ⚠️ 为什么复用 `shanghaiDate` 而不是自己比字符串：
 *    `paidAt` 可能是 `"2026/07/05 10:01:00"` 也可能是 ISO，
 *    两种形态必须先归一到 `YYYY-MM-DD` 才能和 `<input type="date">`
 *    的值做字典序比较。
 *
 * ⚠️ 未支付订单（没有 paidAt）在设了时间范围时会被排除 —— 这是对的：
 *    「导出某段时间的支付订单」本来就不该包含没支付的。
 *    但**不设范围时必须保留**，否则默认导出会悄悄丢数据。
 */
export function filterOrdersByPaidDate<T extends { paidAt?: string }>(
  orders: T[],
  range: { from?: string; to?: string },
): T[] {
  const from = (range.from || "").trim();
  const to = (range.to || "").trim();
  if (!from && !to) return [...orders];
  return orders.filter((order) => {
    const day = shanghaiDate(order.paidAt);
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

/** 单条订单 → 导出行。 */
export function buildOrderExportRow(order: OrderExportRecord): OrderExportRow {
  return {
    账号: resolveOrderAccount(order),
    // 下单时间一定有；缺失时给「未提供精确时间」而不是「待支付」——
    // 「待支付」是支付时间的语义，放在下单列会读成订单状态。
    下单时间: formatExactOrderTime(order.createdAt, "未提供精确时间"),
    支付时间: formatExactOrderTime(order.paidAt),
    支付金额: formatExportAmount(order.amount),
    支付方式: (order.channel || "").trim() || "未知",
  };
}

export function buildOrderExportRows(orders: OrderExportRecord[]): OrderExportRow[] {
  return orders.map(buildOrderExportRow);
}

/**
 * CSV 单元格转义。
 *
 * ⚠️ 订单号、账号里出现逗号或引号是完全可能的，不转义会**整行列错位**，
 * 而且 Excel 不会报错，只会把数据放到错误的列里。
 * 规则按 RFC 4180：含 , " 换行 时整体加引号，内部 " 变 ""。
 */
export function escapeCsvCell(value: string): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * 序列化为 CSV 文本（含 BOM）。
 *
 * 选 CSV 而不是 xlsx：仓库没装 xlsx/exceljs，为一个导出拉一个
 * 几百 KB 的依赖不划算；CSV 双击就能用 Excel / WPS / Numbers 打开。
 */
export function serializeOrdersToCsv(rows: OrderExportRow[]): string {
  const header = ORDER_EXPORT_COLUMNS.map(escapeCsvCell).join(",");
  const body = rows.map((row) =>
    ORDER_EXPORT_COLUMNS.map((column) => escapeCsvCell(row[column])).join(","),
  );
  // 用 \r\n：Excel for Windows 对纯 \n 的兼容性更差。
  return CSV_BOM + [header, ...body].join("\r\n");
}

/**
 * 导出文件名。带上时间范围，导出多份时不会互相覆盖。
 * ⚠️ 冒号不能进文件名（Windows 非法字符），所以只取到日期。
 */
export function buildOrderExportFileName(
  range: { from?: string; to?: string },
  today: string,
): string {
  const from = (range.from || "").trim();
  const to = (range.to || "").trim();
  const scope = from || to ? `${from || "起始"}_${to || "至今"}` : today;
  return `artx-支付订单-${scope}.csv`;
}

/**
 * 一步到位：筛选 + 构造 + 序列化。
 * 页面只调这一个，避免「过滤在 A、构造在 B」漂移成两套口径。
 */
export function exportOrdersToCsv(
  orders: OrderExportRecord[],
  range: { from?: string; to?: string },
): { content: string; rowCount: number } {
  const filtered = filterOrdersByPaidDate(orders, range);
  const rows = buildOrderExportRows(filtered);
  return { content: serializeOrdersToCsv(rows), rowCount: rows.length };
}
