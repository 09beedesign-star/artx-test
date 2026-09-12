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

/**
 * 让 360（现在的首选源）失败，从而把控制权交给后面的境外源。
 *
 * 【为什么需要这个】2026-09-11 起 360 被提到了降级链首位，
 * 下面那些针对 DuckDuckGo / Wikimedia 的用例如果不先让 360 失败，
 * 就会在 mock 里撞上 "Unexpected request"。
 */
function so360Unavailable(url: string) {
  return url.startsWith("https://image.so.com/j");
}

describe("360 image search (primary source for mainland network)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses 360 first and never touches the overseas sources when it succeeds", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (so360Unavailable(url)) {
        return jsonResponse({
          list: [
            {
              img: "https://p0.so.qhimg.com/shoe.jpg",
              title: "运动鞋参考",
              width: "2048",
              height: "1536",
              site: "so.com",
            },
          ],
        });
      }
      if (url === "https://p0.so.qhimg.com/shoe.jpg") {
        return imageResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("鞋子 参考图", 10);

    expect(result.images[0]).toMatchObject({
      title: "运动鞋参考",
      originalSrc: "https://p0.so.qhimg.com/shoe.jpg",
      // 尺寸在原始数据里是字符串，必须转成数字，否则前端布局会算错
      width: 2048,
      height: 1536,
    });
    // 首选源成功时不应再打境外接口 —— 那两个在国内本来就连不通，白等超时
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("duckduckgo.com"))
    ).toBe(false);
  });

  it("ignores the bare-domain `https` field and falls back to `img`", async () => {
    // 360 的 `https` 字段存的是裸域名（"p0.ssl.qhimgs1.com"）而不是完整 URL，
    // 直接拿去 fetch 会抛 `Failed to parse URL`。这条把该行为钉死。
    const fetchMock = vi.fn(async (url: string) => {
      if (so360Unavailable(url)) {
        return jsonResponse({
          list: [
            {
              https: "p0.ssl.qhimgs1.com",
              img: "https://p0.so.qhimg.com/real.jpg",
              title: "鞋",
            },
          ],
        });
      }
      if (url === "https://p0.so.qhimg.com/real.jpg") {
        return imageResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchReferenceImages("鞋", 10);
    expect(result.images[0].originalSrc).toBe("https://p0.so.qhimg.com/real.jpg");
  });

  it("reports a human-readable message when every source fails", async () => {
    // 用户看到的原文案是 `Reference web search failed: fetch failed; fallback failed: fetch failed`，
    // 完全无法判断该怎么办。现在必须给出可操作的建议。
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchReferenceImages("鞋子", 10)).rejects.toThrow(
      /联网搜索参考图失败/
    );
    await expect(searchReferenceImages("鞋子", 10)).rejects.toThrow(
      /站内灵感库|上传参考图/
    );
  });
});

describe("reference image web search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches the open web for reference images before public fallback sources", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (so360Unavailable(url)) {
        throw new Error("fetch failed");
      }
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
    // 首次调用是 360（已失败），之后才轮到 DuckDuckGo 的两步
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0][0])).toContain("image.so.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("duckduckgo.com");
    expect(String(fetchMock.mock.calls[2][0])).toContain("duckduckgo.com/i.js");
  });

  it("filters out image search results that cannot be loaded", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (so360Unavailable(url)) {
        throw new Error("fetch failed");
      }
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
      if (so360Unavailable(url)) {
        throw new Error("fetch failed");
      }
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
    // 360 失败 1 次 + DuckDuckGo 两步 + Wikimedia 查询 + 图片可加载性校验
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
