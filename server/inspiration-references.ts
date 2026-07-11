import { RAW_INSPIRATION_REFERENCES } from "./inspiration-reference-data";

export type RawInspirationReference = {
  id: string;
  group: string;
  subcategory: string;
  sourceSite: string;
  sourceUrl: string;
  imageUrl: string;
  title: string;
  prompt: string;
  stylePromptEn: string;
  licenseNote: string;
};

export type InspirationReference = RawInspirationReference & {
  proxyImageUrl: string;
};

export type InspirationReferenceResult = {
  references: InspirationReference[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

const ALLOWED_SOURCE_HOSTS = new Set([
  "promptbase.com",
  "www.promptbase.com",
]);

const ALLOWED_IMAGE_HOSTS = new Set([
  "assets.promptbase.com",
]);

function isAllowedHttpsUrl(value: string, allowedHosts: Set<string>) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function buildInspirationReferenceProxyUrl(imageUrl: string) {
  return `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function getInspirationReferences(input: {
  group?: string;
  subcategory?: string;
  sourceSite?: string;
  limit?: number;
  offset?: number;
} = {}): InspirationReferenceResult {
  const limit = Math.max(1, Math.min(Math.floor(input.limit || 900), 900));
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const normalizedGroup = input.group?.trim();
  const normalizedSubcategory = input.subcategory?.trim();
  const normalizedSourceSite = input.sourceSite?.trim().toLowerCase();

  const filteredReferences = RAW_INSPIRATION_REFERENCES
    .filter(reference => isAllowedHttpsUrl(reference.sourceUrl, ALLOWED_SOURCE_HOSTS))
    .filter(reference => isAllowedHttpsUrl(reference.imageUrl, ALLOWED_IMAGE_HOSTS))
    .filter(reference => !normalizedGroup || reference.group === normalizedGroup)
    .filter(reference => !normalizedSubcategory || reference.subcategory === normalizedSubcategory)
    .filter(reference => !normalizedSourceSite || reference.sourceSite.toLowerCase() === normalizedSourceSite);

  const references = filteredReferences
    .slice(offset, offset + limit)
    .map(reference => ({
      ...reference,
      proxyImageUrl: buildInspirationReferenceProxyUrl(reference.imageUrl),
    }));

  return {
    references,
    total: filteredReferences.length,
    limit,
    offset,
    hasMore: offset + references.length < filteredReferences.length,
  };
}
