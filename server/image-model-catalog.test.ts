import { describe, expect, it, vi } from "vitest";
import { __testBuildImageModelCatalog } from "./image-generation";

describe("image model catalog", () => {
  it("discovers image-generation models without exposing credentials", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "gpt-image-2" },
        { id: "gpt-image-2-4k" },
        { id: "gemini-3.1-flash-image" },
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
      "gpt-image-2",
      "gpt-image-2-4k",
      "gemini-3.1-flash-image",
    ]);
    expect(catalog.image.map(model => model.label)).toEqual([
      "gpt-image-2",
      "gpt-image-2-4k",
      "gemini-3.1-flash-image",
    ]);
    expect(JSON.stringify(catalog)).not.toContain("secret-image-key");
    expect(JSON.stringify(catalog)).not.toContain("gpt-5.4-mini");
  });
});
