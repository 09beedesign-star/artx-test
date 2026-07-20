import { describe, expect, it } from "vitest";

import { createCapabilityMarginRequestGuard } from "./capability-margin-request-guard";

describe("capability margin request guard", () => {
  it("accepts only the newest response when requests resolve out of order", () => {
    const guard = createCapabilityMarginRequestGuard();
    const firstRequest = guard.begin();
    const secondRequest = guard.begin();
    const committed: string[] = [];

    if (guard.isLatest(firstRequest, false)) committed.push("stale");
    if (guard.isLatest(secondRequest, false)) committed.push("latest");

    expect(committed).toEqual(["latest"]);
  });

  it("rejects an aborted latest request", () => {
    const guard = createCapabilityMarginRequestGuard();
    const request = guard.begin();

    expect(guard.isLatest(request, true)).toBe(false);
  });
});
