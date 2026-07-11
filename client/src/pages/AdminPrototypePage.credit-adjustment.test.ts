import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage credit adjustment feedback", () => {
  it("keeps adjustment feedback directly below the increase and decrease controls", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("formatCreditAdjustmentSuccess(selectedUser.name, delta)");
    expect(page).not.toContain('import { toast } from "sonner";');
    expect(page).not.toContain("toast.success(successMessage)");
    expect(page).not.toContain("toast.error(\"积分调整失败\"");
    expect(page).toContain("creditAdjustmentFeedback");
    expect(page).toContain("积分调整完成");
    expect(page).toContain("确定");
    expect(page).toContain("creditAdjustmentFeedback={creditAdjustmentFeedback}");
    expect(page).toContain("onDismissCreditAdjustmentFeedback");
    expect(page).toContain('"mt-1.5 flex items-start');
    expect(page).not.toContain('className="fixed inset-0 z-[70]');
    expect(page).not.toContain("setTimeout(() => setCreditAdjustmentFeedback(null)");
  });
});
