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

export async function searchReferenceImages(query: string, limit = 10): Promise<{ images: ReferenceImageResult[] }> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    throw new Error("Missing query");
  }

  const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("generator", "search");
  searchUrl.searchParams.set("gsrsearch", normalizedQuery);
  searchUrl.searchParams.set("gsrnamespace", "6");
  searchUrl.searchParams.set("gsrlimit", String(Math.max(8, Math.min(limit, 10)) * 2));
  searchUrl.searchParams.set("prop", "imageinfo");
  searchUrl.searchParams.set("iiprop", "url|size");
  searchUrl.searchParams.set("iiurlwidth", "1200");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      "User-Agent": "artx-reference-search/1.0",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) as { query?: { pages?: Record<string, WikimediaImageInfo> } } : {};
  if (!response.ok) {
    throw new Error(`Reference search failed with ${response.status}`);
  }

  const pages = Object.values(data.query?.pages || {});
  const images = pages
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
    .slice(0, Math.max(8, Math.min(limit, 10)));

  if (images.length === 0) {
    throw new Error("No reference images found");
  }

  return { images };
}
