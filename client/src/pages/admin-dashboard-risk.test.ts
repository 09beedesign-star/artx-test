import { describe, expect, it } from "vitest";

import { getDashboardRiskTarget } from "./admin-dashboard-risk";

describe("getDashboardRiskTarget", () => {
  it("routes high-risk events to the risk page first", () => {
    expect(getDashboardRiskTarget({ paymentExceptions: 3, highRiskEvents: 1 })).toBe("risk");
  });

  it("routes payment exceptions to the orders page when there are no high-risk events", () => {
    expect(getDashboardRiskTarget({ paymentExceptions: 2, highRiskEvents: 0 })).toBe("orders");
  });

  it("keeps the quick action available by defaulting to the risk page", () => {
    expect(getDashboardRiskTarget({ paymentExceptions: 0, highRiskEvents: 0 })).toBe("risk");
  });
});
