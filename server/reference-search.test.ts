import { afterEach, describe, expect, it, vi } from "vitest";
import { searchReferenceImages } from "./reference-search";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PUBLIC_APP_URL;
});

describe("reference image search", () => {
  it("falls back to the curated catalog when the upstream returns an HTML page", async () => {
    process.env.PUBLIC_APP_URL = "https://backstage.artxsd.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>Unavailable</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await searchReferenceImages("给我找一些参考图，关于科幻题材", 8);

    expect(result.images).toHaveLength(8);
    expect(result.images.every(image => image.source === "ArtX 灵感库")).toBe(true);
    expect(result.images.every(image => image.src.startsWith("https://backstage.artxsd.com/api/images/proxy?url="))).toBe(true);
  });

  it("keeps valid Wikimedia image results when the upstream returns JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        query: {
          pages: {
            "1": {
              title: "File:Future city.jpg",
              imageinfo: [{ thumburl: "https://example.com/future.jpg", width: 1600, height: 900 }],
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(searchReferenceImages("future city", 8)).resolves.toEqual({
      images: [{
        id: "wikimedia-File%3AFuture%20city.jpg",
        title: "Future city.jpg",
        src: "https://example.com/future.jpg",
        width: 1600,
        height: 900,
        source: "Wikimedia Commons",
      }],
    });
  });
});
