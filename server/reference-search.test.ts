import { afterEach, describe, expect, it, vi } from "vitest";
import { searchReferenceImages } from "./reference-search";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

function imageResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("reference image web search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches the open web for reference images before public fallback sources", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://duckduckgo.com/?")) {
        return htmlResponse('<script>var vqd="web-token";</script>');
      }
      if (url.startsWith("https://duckduckgo.com/i.js")) {
        return jsonResponse({
          results: [
            {
              image: "https://cdn.example.com/sci-fi-city.jpg",
              title: "Sci-fi city reference",
              width: 1600,
              height: 900,
              source: "Example Images",
            },
          ],
        });
      }
      if (url === "https://cdn.example.com/sci-fi-city.jpg") {
        return imageResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("科幻题材 参考图", 10);

    expect(result.images).toEqual([
      {
        id: expect.stringMatching(/^web-/),
        title: "Sci-fi city reference",
        src: `/api/images/proxy?url=${encodeURIComponent("https://cdn.example.com/sci-fi-city.jpg")}`,
        originalSrc: "https://cdn.example.com/sci-fi-city.jpg",
        width: 1600,
        height: 900,
        source: "Example Images",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("duckduckgo.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("duckduckgo.com/i.js");
  });

  it("filters out image search results that cannot be loaded", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://duckduckgo.com/?")) {
        return htmlResponse('<script>var vqd="web-token";</script>');
      }
      if (url.startsWith("https://duckduckgo.com/i.js")) {
        return jsonResponse({
          results: [
            {
              image: "https://cdn.example.com/broken.jpg",
              title: "Broken image",
              source: "Example Images",
            },
            {
              image: "https://cdn.example.com/valid.jpg",
              title: "Valid image",
              source: "Example Images",
            },
          ],
        });
      }
      if (url === "https://cdn.example.com/broken.jpg") {
        return htmlResponse("<html>blocked</html>");
      }
      if (url === "https://cdn.example.com/valid.jpg") {
        return imageResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("室内参考图", 10);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      title: "Valid image",
      originalSrc: "https://cdn.example.com/valid.jpg",
    });
  });

  it("falls back only to another public web source when web image search returns HTML", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://duckduckgo.com/?")) {
        return htmlResponse('<script>var vqd="web-token";</script>');
      }
      if (url.startsWith("https://duckduckgo.com/i.js")) {
        return htmlResponse("<html>blocked</html>");
      }
      if (url.startsWith("https://commons.wikimedia.org/w/api.php")) {
        return jsonResponse({
          query: {
            pages: {
              "1": {
                title: "File:Moon base.jpg",
                imageinfo: [
                  {
                    thumburl: "https://upload.wikimedia.org/moon-base.jpg",
                    width: 1200,
                    height: 800,
                  },
                ],
              },
            },
          },
        });
      }
      if (url === "https://upload.wikimedia.org/moon-base.jpg") {
        return imageResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("moon base references", 10);

    expect(result.images[0]).toMatchObject({
      title: "Moon base.jpg",
      src: `/api/images/proxy?url=${encodeURIComponent("https://upload.wikimedia.org/moon-base.jpg")}`,
      originalSrc: "https://upload.wikimedia.org/moon-base.jpg",
      source: "Wikimedia Commons",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
