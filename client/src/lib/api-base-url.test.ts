import { describe, expect, it } from "vitest";
import {
  ART_X_TEST_API_BASE_URL,
  normalizeApiBaseUrl,
} from "./api-base-url";

describe("normalizeApiBaseUrl", () => {
  it("routes static GitHub Pages addresses to the Tencent Cloud test API", () => {
    expect(
      normalizeApiBaseUrl("https://09beedesign-star.github.io/artx-test/")
    ).toBe(ART_X_TEST_API_BASE_URL);
  });
});
