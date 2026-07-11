import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage urgent notifications", () => {
  it("provides an urgent filter and an action to dismiss each urgent alert", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("紧急类");
    expect(page).toContain("解除警报");
    expect(page).toContain("onDismissNotification");
    expect(page).toContain("handleMarkNotificationRead(item);");
    expect(page).toContain('item.severity === "critical" && item.unread');
  });
});
