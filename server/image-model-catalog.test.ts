import { describe, expect, it, vi } from "vitest";
import { __testBuildImageModelCatalog } from "./image-generation";

describe("image model catalog", () => {
  it("discovers image-generation models without exposing credentials", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "gpt-image-2" },
        { id: "gpt-image-2-4k" },
        { id: "gemini-3.1-flash-image" },
        { id: "gemini-3.5-flash-preview" },
        { id: "jimeng-4.0" },
        { id: "mj-v7" },
        { id: "mj-v8.1" },
        { id: "og-image2-low" },
        { id: "og-image2-medium" },
        { id: "og-image2-high" },
        { id: "kling-2.1" },
        { id: "gpt-5.4-mini" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const catalog = await __testBuildImageModelCatalog({
      apiKey: "secret-image-key",
      baseUrl: "https://token.example.test/v1",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://token.example.test/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-image-key",
        }),
      })
    );
    expect(catalog.image.map(model => model.id)).toEqual([
      "gemini-3.5-flash-preview",
      "jimeng-4.0",
      "mj-v7",
      "mj-v8.1",
      "og-image2-low",
      "og-image2-medium",
      "og-image2-high",
    ]);
    expect(catalog.image.map(model => model.label)).toEqual([
      "gemini-3.5-flash-preview",
      "jimeng-4.0",
      "mj-v7",
      "mj-v8.1",
      "image2 low",
      "image2 medium",
      "image2 high",
    ]);
    expect(catalog.image.find(model => model.id === "gemini-3.5-flash-preview")?.description).toBe("低价高速强效");
    expect(catalog.image.find(model => model.id === "og-image2-high")).toMatchObject({
      description: "高价高清强",
      icon: "openai",
    });
    expect(catalog.image.find(model => model.id === "gemini-3.5-flash-preview")).toMatchObject({
      icon: "gemini",
    });
    expect(catalog.image.find(model => model.id === "jimeng-4.0")).toMatchObject({
      icon: "jimeng",
    });
    expect(catalog.image.find(model => model.id === "mj-v7")).toMatchObject({
      icon: "midjourney",
    });
    expect(JSON.stringify(catalog)).not.toContain("secret-image-key");
    expect(JSON.stringify(catalog)).not.toContain("gpt-image-2");
    expect(JSON.stringify(catalog)).not.toContain("gemini-3.1-flash-image");
    expect(JSON.stringify(catalog)).not.toContain("gpt-5.4-mini");
    expect(JSON.stringify(catalog)).not.toContain("kling-2.1");
  });
});
