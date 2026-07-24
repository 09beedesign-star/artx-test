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
  try {
    return { images: await searchDuckDuckGoImages(normalizedQuery, clampedLimit) };
  } catch (webError) {
    try {
      return { images: await searchWikimediaImages(normalizedQuery, clampedLimit) };
    } catch (fallbackError) {
      const webMessage = webError instanceof Error ? webError.message : "web search failed";
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Wikimedia search failed";
      throw new Error(`Reference web search failed: ${webMessage}; fallback failed: ${fallbackMessage}`);
    }
  }
}
