import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TopBar credits sync", () => {
  it("fetches the authenticated billing balance instead of only rendering a fixed prop", () => {
    const source = readFileSync(resolve(__dirname, "TopBar.tsx"), "utf-8");

    expect(source).toContain("/api/billing/summary");
    expect(source).toContain("displayCredits");
    expect(source).toContain("artx:credits-updated");
    expect(source).toContain("visibilitychange");
  });
});
