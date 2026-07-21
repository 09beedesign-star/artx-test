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
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("科幻题材 参考图", 10);

    expect(result.images).toEqual([
      {
        id: expect.stringMatching(/^web-/),
        title: "Sci-fi city reference",
        src: "https://cdn.example.com/sci-fi-city.jpg",
        width: 1600,
        height: 900,
        source: "Example Images",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("duckduckgo.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("duckduckgo.com/i.js");
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
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("moon base references", 10);

    expect(result.images[0]).toMatchObject({
      title: "Moon base.jpg",
      src: "https://upload.wikimedia.org/moon-base.jpg",
      source: "Wikimedia Commons",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
