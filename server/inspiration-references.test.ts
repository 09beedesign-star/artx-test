import { describe, expect, it } from "vitest";
import { buildInspirationReferenceProxyUrl, getInspirationReferences } from "./inspiration-references";

describe("inspiration references", () => {
  it("returns link-only public references with proxied image URLs", () => {
    const result = getInspirationReferences({ limit: 5 });

    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references.length).toBeLessThanOrEqual(5);
    for (const reference of result.references) {
      expect(reference.sourceUrl).toMatch(/^https:\/\/promptbase\.com\//);
      expect(reference.imageUrl).toMatch(/^https:\/\/assets\.promptbase\.com\//);
      expect(reference.proxyImageUrl).toBe(buildInspirationReferenceProxyUrl(reference.imageUrl));
      expect(reference.proxyImageUrl).toContain("/api/images/proxy?url=");
      expect("localImagePath" in reference).toBe(false);
    }
  });

  it("filters by subcategory and clamps the response size", () => {
    const result = getInspirationReferences({ subcategory: "服装", limit: 999 });

    expect(result.references.length).toBeGreaterThan(0);
    expect(result.limit).toBe(900);
    expect(result.references.length).toBeLessThanOrEqual(900);
    expect(result.references.every(reference => reference.subcategory === "服装")).toBe(true);
  });

  it("supports offset pagination for larger imported datasets", () => {
    const firstPage = getInspirationReferences({ limit: 2, offset: 0 });
    const secondPage = getInspirationReferences({ limit: 2, offset: 2 });

    expect(firstPage.total).toBeGreaterThan(2);
    expect(firstPage.limit).toBe(2);
    expect(firstPage.offset).toBe(0);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.offset).toBe(2);
    expect(secondPage.references[0]?.id).not.toBe(firstPage.references[0]?.id);
  });
});
