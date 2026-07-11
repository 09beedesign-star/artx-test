const adminTimeZone = "Asia/Shanghai";

export function formatExactOrderTime(input?: string, fallback = "待支付") {
  if (!input) return fallback;

  const absoluteMatch = input.match(/^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (absoluteMatch) {
    const [, year, month, day, hour, minute, second = "00"] = absoluteMatch;
    return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
  }

  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) return "未提供精确时间";

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: adminTimeZone,
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";

  return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}
