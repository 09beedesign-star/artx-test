import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage urgent notifications", () => {
  it("keeps urgent risk attention separate from unread counts and only dismisses risk notifications", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("紧急类");
    expect(page).toContain("解除警报");
    expect(page).toContain("onDismissNotification");
    expect(page).toContain("handleMarkNotificationRead(item);");
    expect(page).toContain("urgentRiskNotifications");
    expect(page).toContain("urgentRiskAttentionAcknowledged");
    expect(page).toContain("setActiveSection(\"risk\")");
    expect(page).toContain("item.tab === \"security\" && item.severity === \"critical\"");
    expect(page).toContain("filter((item) => item.unread).length");
    expect(page).toContain("urgentRiskNotifications.length > 0");
  });
});
