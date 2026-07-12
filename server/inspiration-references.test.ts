import { describe, expect, it } from "vitest";
import { buildInspirationReferenceProxyUrl, getInspirationReferences } from "./inspiration-references";

describe("inspiration references", () => {
  it("returns 900 verified prompt-image references with proxied image URLs", () => {
    const result = getInspirationReferences({ limit: 900 });

    expect(result.references).toHaveLength(900);
    expect(result.total).toBe(900);
    expect(result.limit).toBe(900);
    expect(result.offset).toBe(0);
    expect(result.hasMore).toBe(false);
    for (const reference of result.references) {
      expect(reference.prompt.trim().length).toBeGreaterThanOrEqual(24);
      expect(reference.prompt.trim()).not.toBe(reference.title.trim());
      expect(reference.imageUrl).toMatch(/^https:\/\/(?:raw\.githubusercontent\.com|pbs\.twimg\.com|cms-assets\.youmind\.com|github\.com)\//);
      expect(reference.proxyImageUrl).toBe(buildInspirationReferenceProxyUrl(reference.imageUrl));
      expect("sourceUrl" in reference).toBe(false);
      expect("sourceSite" in reference).toBe(false);
      expect("licenseNote" in reference).toBe(false);
    }
  });

  it("keeps verified prompt-only results aligned with imported prompt-image data", () => {
    const result = getInspirationReferences({ limit: 900, verifiedPromptOnly: true });

    expect(result.references).toHaveLength(900);
    expect(result.total).toBe(900);
    expect(result.hasMore).toBe(false);
  });

  it("filters by subcategory and clamps the response size", () => {
    const result = getInspirationReferences({ subcategory: "服装", limit: 999 });

    expect(result.references.length).toBeGreaterThan(0);
    expect(result.limit).toBe(900);
    expect(result.references.every(reference => reference.subcategory === "服装")).toBe(true);
  });

  it("supports offset pagination for the imported dataset", () => {
    const firstPage = getInspirationReferences({ limit: 2, offset: 0 });
    const secondPage = getInspirationReferences({ limit: 2, offset: 2 });

    expect(firstPage.total).toBe(900);
    expect(firstPage.limit).toBe(2);
    expect(firstPage.offset).toBe(0);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.offset).toBe(2);
    expect(secondPage.references[0]?.id).not.toBe(firstPage.references[0]?.id);
  });

  it("builds proxied image URLs for future verified sources", () => {
    const imageUrl = "https://raw.githubusercontent.com/example/repo/main/foo.jpg";

    expect(buildInspirationReferenceProxyUrl(imageUrl)).toBe(
      `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`,
    );
  });
});
