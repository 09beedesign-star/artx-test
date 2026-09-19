type AccountFilterRecord = {
  id: string;
  name: string;
  email: string;
  plan: string;
  account?: string;
  organization?: string;
  accountType?: "regular" | "test";
  registeredAt?: string;
};

type OrderFilterRecord = {
  id: string;
  user: string;
  amount: number;
  paidAt?: string;
};

function shanghaiDate(input?: string) {
  if (!input) return "";
  const absoluteMatch = input.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (absoluteMatch) return `${absoluteMatch[1]}-${absoluteMatch[2]}-${absoluteMatch[3]}`;
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isWithinDateRange(value: string, from: string, to: string) {
  if (!value) return !from && !to;
  return (!from || value >= from) && (!to || value <= to);
}

export function filterAdminUsers<T extends AccountFilterRecord>(users: T[], input: {
  query: string;
  accountType: "all" | "regular" | "test";
  registeredFrom: string;
  registeredTo: string;
}) {
  const query = input.query.trim().toLowerCase();
  return users.filter((user) => {
    // 把登录账号、用户 ID 和组织也纳入匹配：管理员常常是从订单详情或任务
    // 记录里复制一串 ID / 登录账号回来搜，只匹配 name+email 会「搜不到人」，
    // 看起来就像列表没接数据。逐字段 some() 而不是拼成一个大字符串，
    // 避免跨字段边界被误命中（例如搜 "e p" 命中 "name e" + "plan p"）。
    const matchesQuery = !query
      || [user.name, user.email, user.account, user.id, user.organization, user.plan]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    const accountType = user.accountType || "regular";
    const matchesAccountType = input.accountType === "all" || accountType === input.accountType;
    return matchesQuery
      && matchesAccountType
      && isWithinDateRange(shanghaiDate(user.registeredAt), input.registeredFrom, input.registeredTo);
  });
}

export function filterAdminOrders<T extends OrderFilterRecord>(orders: T[], input: {
  query: string;
  paidFrom: string;
  paidTo: string;
  amountMin: string;
  amountMax: string;
}) {
  const query = input.query.trim().toLowerCase();
  const min = input.amountMin.trim() ? Number(input.amountMin) : undefined;
  const max = input.amountMax.trim() ? Number(input.amountMax) : undefined;
  return orders.filter((order) => {
    const matchesQuery = !query || `${order.id} ${order.user}`.toLowerCase().includes(query);
    const matchesAmount = (!Number.isFinite(min) || order.amount >= min!)
      && (!Number.isFinite(max) || order.amount <= max!);
    return matchesQuery
      && matchesAmount
      && isWithinDateRange(shanghaiDate(order.paidAt), input.paidFrom, input.paidTo);
  });
}
