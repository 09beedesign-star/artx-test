import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HomePage auth flow", () => {
  it("does not create a workspace project automatically after login or registration", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");
    const handleAuthAction = source.match(
      /const handleAuthAction = async[\s\S]*?const handleAuthSubmit/
    )?.[0];

    expect(handleAuthAction).toBeTruthy();
    expect(handleAuthAction).not.toContain("createProjectFromPrompt()");
  });
});
