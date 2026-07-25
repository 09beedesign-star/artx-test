import { describe, expect, it } from "vitest";

import { formatExactOrderTime } from "./admin-order-time";

describe("formatExactOrderTime", () => {
  it("renders payment and order timestamps with seconds in Shanghai time", () => {
    expect(formatExactOrderTime("2026-07-05T02:01:00.000Z")).toBe("2026/07/05 10:01:00");
    expect(formatExactOrderTime("2026/07/05 10:01:00")).toBe("2026/07/05 10:01:00");
  });

  it("does not show relative time labels when no exact timestamp is available", () => {
    expect(formatExactOrderTime("刚刚")).toBe("未提供精确时间");
    expect(formatExactOrderTime()).toBe("待支付");
  });
});
