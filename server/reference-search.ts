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
  width: number;
  height: number;
  source: string;
};

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

const QUERY_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /科幻|sci[ -]?fi|science fiction/i, terms: ["科幻", "未来", "赛博", "科技", "宇宙", "太空", "机器人", "霓虹"] },
  { pattern: /科技|未来|tech|future/i, terms: ["科技", "未来", "赛博", "AI", "虚拟", "机器人"] },
  { pattern: /时尚|服装|fashion/i, terms: ["时尚", "服装", "穿搭", "造型"] },
  { pattern: /产品|商品|product/i, terms: ["产品", "电商", "广告", "商业"] },
];

function getReferenceProxyBaseUrl() {
  return (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || "https://backstage.artxsd.com").replace(/\/+$/, "");
}

function getFallbackSearchTerms(query: string) {
  const terms = [query.toLowerCase()];
  for (const expansion of QUERY_EXPANSIONS) {
    if (expansion.pattern.test(query)) terms.push(...expansion.terms.map(term => term.toLowerCase()));
  }
  return terms.filter(Boolean);
}

function searchCuratedFallback(query: string, limit: number): ReferenceImageResult[] {
  const terms = getFallbackSearchTerms(query);
  const references = getInspirationReferences({ limit: 900, verifiedPromptOnly: true }).references;
  const ranked = references
    .map((reference, index) => {
      const searchable = [reference.title, reference.prompt, reference.group, reference.subcategory, reference.stylePromptEn]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { reference, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);

  return ranked.map(({ reference }) => ({
    id: `curated-${reference.id}`,
    title: reference.title,
    src: `${getReferenceProxyBaseUrl()}${reference.proxyImageUrl}`,
    width: 1200,
    height: 1200,
    source: "ArtX 灵感库",
  }));
}

function parseWikimediaImages(body: string, limit: number): ReferenceImageResult[] {
  if (!body.trim().startsWith("{")) return [];
  try {
    const data = JSON.parse(body) as { query?: { pages?: Record<string, WikimediaImageInfo> } };
    return Object.values(data.query?.pages || {})
      .map((page) => {
        const info = page.imageinfo?.[0];
        const src = info?.thumburl || info?.url;
        if (!src) return null;
        return {
          id: `wikimedia-${encodeURIComponent(page.title)}`,
          title: page.title.replace(/^File:/i, ""),
          src,
          width: info?.width || 1200,
          height: info?.height || 1200,
          source: "Wikimedia Commons",
        } satisfies ReferenceImageResult;
      })
      .filter((item): item is ReferenceImageResult => Boolean(item))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function searchReferenceImages(query: string, limit = 10): Promise<{ images: ReferenceImageResult[] }> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    throw new Error("Missing query");
  }
  const normalizedLimit = Math.max(8, Math.min(limit, 10));

  const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("generator", "search");
  searchUrl.searchParams.set("gsrsearch", normalizedQuery);
  searchUrl.searchParams.set("gsrnamespace", "6");
  searchUrl.searchParams.set("gsrlimit", String(normalizedLimit * 2));
  searchUrl.searchParams.set("prop", "imageinfo");
  searchUrl.searchParams.set("iiprop", "url|size");
  searchUrl.searchParams.set("iiurlwidth", "1200");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  try {
    const response = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "artx-reference-search/1.0",
      },
    });
    const images = response.ok ? parseWikimediaImages(await response.text(), normalizedLimit) : [];
    if (images.length > 0) return { images };
  } catch {
    // The external search source is optional. A curated fallback keeps Auto usable.
  }

  return { images: searchCuratedFallback(normalizedQuery, normalizedLimit) };
}
