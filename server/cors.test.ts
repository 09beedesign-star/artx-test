import { describe, expect, it } from "vitest";
import { getAllowedCorsOrigin } from "./cors";

describe("CORS origin allowlist", () => {
  it("allows GitHub Pages and production admin origins by default", () => {
    expect(getAllowedCorsOrigin("https://09beedesign-star.github.io")).toBe("https://09beedesign-star.github.io");
    expect(getAllowedCorsOrigin("https://admin.artxsd.com")).toBe("https://admin.artxsd.com");
  });

  it("allows additional configured frontend origins", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://staging.example.com, https://preview.example.com/";

    expect(getAllowedCorsOrigin("https://staging.example.com")).toBe("https://staging.example.com");
    expect(getAllowedCorsOrigin("https://preview.example.com")).toBe("https://preview.example.com");
    expect(getAllowedCorsOrigin("https://unknown.example.com")).toBe("");

    delete process.env.CORS_ALLOWED_ORIGINS;
  });
});
