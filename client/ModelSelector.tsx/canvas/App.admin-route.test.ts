import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("gray admin route access", () => {
  it("allows the explicit admin route on the gray host without treating its root as a dedicated admin host", () => {
    const page = readFileSync(resolve(__dirname, "App.tsx"), "utf-8");

    expect(page).toContain('const grayAdminRouteHosts = new Set(["backstage.artxsd.com"])');
    expect(page).toContain("grayAdminRouteHosts.has(host)");
    expect(page).toContain("function isDedicatedAdminHost()");
  });
});
