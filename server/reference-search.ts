import { getInspirationReferences } from "./inspiration-references";

type WikimediaImageInfo = {
  title: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    width?: number;
    height?: number;
  }>;
};

export type ReferenceImageResult = {
  id: string;
  title: string;
  src: string;
  originalSrc?: string;
  width: number;
  height: number;
  source: string;
};

type DuckDuckGoImageResult = {
  image?: string;
  thumbnail?: string;
  title?: string;
  width?: number;
  height?: number;
  source?: string;
  url?: string;
};

/**
 * 360 图片搜索的单条结果。
 *
 * 字段坑（实测得出，勿凭字面猜）：
 * - `https` **不是**完整 URL，只有域名（如 "p0.ssl.qhimgs1.com"），直接 fetch 会抛
 *   `Failed to parse URL`。只能用 `img`（完整 http(s) 地址），`thumb` 作兜底。
 * - `width` / `height` 是字符串，要 Number() 转换后再用。
 */
type So360ImageResult = {
  img?: string;
  thumb?: string;
  title?: string;
  litetitle?: string;
  width?: string | number;
  height?: string | number;
  site?: string;
  link?: string;
};

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function clampLimit(limit: number) {
  return Math.max(8, Math.min(limit, 10));
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function getDuckDuckGoVqd(html: string) {
  return html.match(/vqd=["']?([^"'&]+)["']?/i)?.[1] || "";
}

function getReferenceImageFetchHeaders(src: string) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 ArtXReferenceSearch/1.0",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.6",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
  try {
    const parsed = new URL(src);
    headers.Referer = `${parsed.protocol}//${parsed.host}/`;
  } catch {
    // URL validity is checked before this helper is used.
  }
  return headers;
}

async function isLoadableReferenceImage(image: ReferenceImageResult) {
  const src = image.originalSrc || image.src;
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    const response = await fetch(src, {
      method: "GET",
      redirect: "follow",
      headers: getReferenceImageFetchHeaders(src),
      signal: AbortSignal.timeout(5000),
    });
    response.body?.cancel().catch(() => undefined);
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") || "";
    return /^image\//i.test(contentType);
  } catch {
    return false;
  }
}

async function filterLoadableReferenceImages(images: ReferenceImageResult[], limit: number) {
  const loadable: ReferenceImageResult[] = [];
  for (const image of images) {
    if (await isLoadableReferenceImage(image)) {
      loadable.push(image);
      if (loadable.length >= limit) break;
    }
  }
  return loadable;
}

function buildReferenceImageProxyUrl(src: string) {
  return `/api/images/proxy?url=${encodeURIComponent(src)}`;
}

function normalizeReferenceImageResult(
  input: {
    id: string;
    title?: string;
    src?: string;
    width?: number;
    height?: number;
    source?: string;
  }
): ReferenceImageResult | null {
  const src = input.src?.trim();
  if (!src || !/^https?:\/\//i.test(src)) return null;
  return {
    id: input.id,
    title: input.title?.trim() || "参考图",
    src: buildReferenceImageProxyUrl(src),
    originalSrc: src,
    width: input.width || 1200,
    height: input.height || 1200,
    source: input.source?.trim() || getHostname(src) || "Web",
  } satisfies ReferenceImageResult;
}

function dedupeReferenceImages(images: ReferenceImageResult[], limit: number) {
  const seen = new Set<string>();
  const deduped: ReferenceImageResult[] = [];
  for (const image of images) {
    const key = (image.originalSrc || image.src).replace(/([?&])(width|height|w|h|size|format|quality)=[^&]+/gi, "$1").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(image);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

async function searchDuckDuckGoImages(query: string, limit: number) {
  const homeUrl = new URL("https://duckduckgo.com/");
  homeUrl.searchParams.set("q", query);
  homeUrl.searchParams.set("iax", "images");
  homeUrl.searchParams.set("ia", "images");

  const commonHeaders = {
    "User-Agent": "Mozilla/5.0 ArtXReferenceSearch/1.0",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };

  const homeResponse = await fetch(homeUrl.toString(), { headers: commonHeaders });
  const homeText = await homeResponse.text();
  if (!homeResponse.ok) {
    throw new Error(`DuckDuckGo image search page failed with ${homeResponse.status}`);
  }
  const vqd = getDuckDuckGoVqd(homeText);
  if (!vqd) {
    throw new Error("DuckDuckGo image search token missing");
  }

  const apiUrl = new URL("https://duckduckgo.com/i.js");
  apiUrl.searchParams.set("l", "wt-wt");
  apiUrl.searchParams.set("o", "json");
  apiUrl.searchParams.set("q", query);
  apiUrl.searchParams.set("vqd", vqd);
  apiUrl.searchParams.set("f", ",,,");
  apiUrl.searchParams.set("p", "1");

  const apiResponse = await fetch(apiUrl.toString(), {
    headers: {
      ...commonHeaders,
      "Accept": "application/json,*/*;q=0.8",
      "Referer": homeUrl.toString(),
    },
  });
  const apiText = await apiResponse.text();
  if (!apiResponse.ok) {
    throw new Error(`DuckDuckGo image search failed with ${apiResponse.status}`);
  }
  const contentType = apiResponse.headers.get("content-type") || "";
  if (!contentType.includes("json") && apiText.trim().startsWith("<")) {
    throw new Error("DuckDuckGo image search returned HTML");
  }
  const data = JSON.parse(apiText) as { results?: DuckDuckGoImageResult[] };
  const images = (data.results || [])
    .map((item, index) =>
      normalizeReferenceImageResult({
        id: `web-${index}-${encodeURIComponent(item.image || item.thumbnail || item.title || query)}`,
        title: item.title,
        src: item.image || item.thumbnail,
        width: item.width,
        height: item.height,
        source: item.source || getHostname(item.url || item.image || ""),
      })
    )
    .filter((item): item is ReferenceImageResult => Boolean(item));

  const deduped = await filterLoadableReferenceImages(dedupeReferenceImages(images, limit * 2), limit);
  if (deduped.length === 0) {
    throw new Error("No web reference images found");
  }
  return deduped;
}

/**
 * 360 图片搜索（国内可直连）。
 *
 * 【为什么加这个源】
 * 原有的 DuckDuckGo 与 Wikimedia 在国内网络下**都连不通**（curl 实测 12s 超时、
 * HTTP 000），于是「帮我找鞋子参考图」必然报
 * `Reference web search failed: fetch failed; fallback failed: fetch failed`。
 * 同一时刻 baidu / token.bkeel.com / backstage.artxsd.com 全部 200，
 * 确认是境外域名可达性问题，不是代码缺陷。
 *
 * 360 接口实测：单次返回 50 条，标题与真实尺寸齐全，
 * 抽样 8 条图片 URL **8/8 可加载**，分辨率多在 2K 以上，适合做参考图。
 */
async function search360Images(query: string, limit: number) {
  const clampedLimit = clampLimit(limit);
  const apiUrl = new URL("https://image.so.com/j");
  apiUrl.searchParams.set("q", query);
  // 多取一些，后面还要过可加载性与去重两道关，取太少会不够填。
  apiUrl.searchParams.set("pn", String(Math.max(clampedLimit * 4, 40)));
  apiUrl.searchParams.set("sn", "0");

  const response = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://image.so.com/",
    },
    signal: AbortSignal.timeout(10000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`360 image search failed with ${response.status}`);
  }
  if (text.trim().startsWith("<")) {
    throw new Error("360 image search returned HTML");
  }

  const data = JSON.parse(text) as { list?: So360ImageResult[] };
  const images = (data.list || [])
    .map((item, index) => {
      // 只认完整 URL：`https` 字段是裸域名，混进来会在 fetch 阶段直接抛错。
      const src = [item.img, item.thumb].find(
        (value) => typeof value === "string" && /^https?:\/\//i.test(value)
      );
      return normalizeReferenceImageResult({
        id: `so360-${index}-${encodeURIComponent(src || item.title || query)}`,
        title: item.title || item.litetitle,
        src,
        width: Number(item.width) || undefined,
        height: Number(item.height) || undefined,
        source: item.site || getHostname(item.link || src || ""),
      });
    })
    .filter((item): item is ReferenceImageResult => Boolean(item));

  const deduped = await filterLoadableReferenceImages(
    dedupeReferenceImages(images, clampedLimit * 3),
    clampedLimit
  );
  if (deduped.length === 0) {
    throw new Error("No 360 reference images found");
  }
  return deduped;
}

async function searchWikimediaImages(query: string, limit: number) {
  const clampedLimit = clampLimit(limit);
  const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("generator", "search");
  searchUrl.searchParams.set("gsrsearch", query);
  searchUrl.searchParams.set("gsrnamespace", "6");
  searchUrl.searchParams.set("gsrlimit", String(clampedLimit * 2));
  searchUrl.searchParams.set("prop", "imageinfo");
  searchUrl.searchParams.set("iiprop", "url|size");
  searchUrl.searchParams.set("iiurlwidth", "1200");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      "User-Agent": "artx-reference-search/1.0",
      "Accept": "application/json,*/*;q=0.8",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Wikimedia reference search failed with ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json") && text.trim().startsWith("<")) {
    throw new Error("Wikimedia reference search returned HTML");
  }
  const data = text ? JSON.parse(text) as { query?: { pages?: Record<string, WikimediaImageInfo> } } : {};
  const pages = Object.values(data.query?.pages || {});
  const images = pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      return normalizeReferenceImageResult({
        id: `wikimedia-${encodeURIComponent(page.title)}`,
        title: page.title.replace(/^File:/i, ""),
        src: info?.thumburl || info?.url,
        width: info?.width,
        height: info?.height,
        source: "Wikimedia Commons",
      });
    })
    .filter((item): item is ReferenceImageResult => Boolean(item));

  const deduped = await filterLoadableReferenceImages(dedupeReferenceImages(images, clampedLimit * 2), clampedLimit);
  if (deduped.length === 0) {
    throw new Error("No Wikimedia reference images found");
  }
  return deduped;
}

export async function searchReferenceImages(query: string, limit = 10): Promise<{ images: ReferenceImageResult[] }> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    throw new Error("Missing query");
  }

  const clampedLimit = clampLimit(limit);

  /**
   * 【2026-09-11 调整数据源顺序】360 提到首位。
   *
   * 原顺序是 DuckDuckGo → Wikimedia，两者在国内网络下都不可达，
   * 于是这个功能在国内**必然失败**。360 实测可直连且出图质量够用，
   * 因此作为首选；境外两个源保留在后面，海外部署时仍能生效。
   *
   * 改成数组驱动而不是嵌套 try/catch，是为了后续增删源不用再动控制流，
   * 也便于在全部失败时把每个源的具体原因都带出来（原来只能带两条）。
   */
  const providers: Array<{ name: string; run: () => Promise<ReferenceImageResult[]> }> = [
    { name: "360", run: () => search360Images(normalizedQuery, clampedLimit) },
    { name: "DuckDuckGo", run: () => searchDuckDuckGoImages(normalizedQuery, clampedLimit) },
    { name: "Wikimedia", run: () => searchWikimediaImages(normalizedQuery, clampedLimit) },
  ];

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const images = await provider.run();
      if (images.length > 0) {
        return { images };
      }
      failures.push(`${provider.name}: empty result`);
    } catch (error) {
      failures.push(
        `${provider.name}: ${error instanceof Error ? error.message : "search failed"}`
      );
    }
  }

  // 全部源都失败时，抛出一条**人能看懂**的提示。
  // 原来直接把 `fetch failed` 这种底层报错怼到 toast 上，用户完全无从判断该怎么办。
  const detail = failures.join("; ");
  throw new Error(
    `联网搜索参考图失败，可能是网络无法访问图片搜索服务。你可以改用站内灵感库，或直接上传参考图。（${detail}）`
  );
}
