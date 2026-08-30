import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("global dialog surface", () => {
  it("uses the shared #171717 floor for modal primitives and custom surfaces", () => {
    const css = readFileSync(
      resolve(__dirname, "../../index.css"),
      "utf-8"
    );

    expect(css).toContain("--dialog-surface: #171717");
    expect(css).toContain('[data-slot="dialog-content"]');
    expect(css).toContain('[data-slot="alert-dialog-content"]');
    expect(css).toContain('[data-artx-dialog-surface]');
    expect(css).toContain("background-color: var(--dialog-surface) !important");
  });
});
