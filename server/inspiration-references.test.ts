import { describe, expect, it } from "vitest";
import { buildInspirationReferenceProxyUrl, getInspirationReferences } from "./inspiration-references";
import { RAW_INSPIRATION_REFERENCES } from "./inspiration-reference-data";

describe("inspiration references", () => {
  it("returns 882 verified prompt-image references with proxied image URLs", () => {
    const result = getInspirationReferences({ limit: 900 });

    // 900 条原始数据里剔除了 18 条 github.com/user-attachments（代理取不回图）
    expect(result.references).toHaveLength(882);
    expect(result.total).toBe(882);
    expect(result.limit).toBe(900);
    expect(result.offset).toBe(0);
    expect(result.hasMore).toBe(false);
    for (const reference of result.references) {
      // 🔒 提示词不下发：响应里不能有 prompt / stylePromptEn 字段（连空串也不行）
      expect("prompt" in reference).toBe(false);
      expect("stylePromptEn" in reference).toBe(false);
      // 内部质量过滤仍按原始提示词生效
      const raw = RAW_INSPIRATION_REFERENCES.find(item => item.id === reference.id);
      expect(raw?.prompt.trim().length).toBeGreaterThanOrEqual(24);
      expect(raw?.prompt.trim()).not.toBe(reference.title.trim());
      expect(reference.imageUrl).toMatch(/^https:\/\/(?:raw\.githubusercontent\.com|pbs\.twimg\.com|cms-assets\.youmind\.com)\//);
      expect(reference.imageUrl).not.toMatch(/^https:\/\/github\.com\//);
      expect(reference.proxyImageUrl).toBe(buildInspirationReferenceProxyUrl(reference.imageUrl));
      expect("sourceUrl" in reference).toBe(false);
      expect("sourceSite" in reference).toBe(false);
      expect("licenseNote" in reference).toBe(false);
    }
  });

  it("keeps verified prompt-only results aligned with imported prompt-image data", () => {
    const result = getInspirationReferences({ limit: 900, verifiedPromptOnly: true });

    expect(result.references).toHaveLength(882);
    expect(result.total).toBe(882);
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

    expect(firstPage.total).toBe(882);
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

  it("never serializes prompt text into the JSON response", () => {
    const result = getInspirationReferences({ limit: 900 });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/"prompt"|"stylePromptEn"/);
    const sample = RAW_INSPIRATION_REFERENCES.find(item => item.prompt.trim().length >= 40);
    expect(sample).toBeTruthy();
    expect(json.includes(sample!.prompt.trim().slice(0, 40))).toBe(false);
  });
});
