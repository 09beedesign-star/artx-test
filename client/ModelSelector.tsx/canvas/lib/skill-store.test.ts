import { describe, expect, it } from "vitest";
import { skillCategoryMeta } from "./skill-store";

describe("skill store category labels", () => {
  it("keeps slash separators padded in visible category tabs", () => {
    for (const meta of Object.values(skillCategoryMeta)) {
      if (!meta.label.includes("/")) continue;
      expect(meta.label).toContain(" / ");
    }
  });
});
