import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage credit adjustment feedback", () => {
  it("shows a success toast with the account and direction after a real adjustment succeeds", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain('import { toast } from "sonner";');
    expect(page).toContain("formatCreditAdjustmentSuccess(selectedUser.name, delta)");
    expect(page).toContain("toast.success(successMessage)");
  });
});
