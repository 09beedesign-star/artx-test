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

export type InspirationReference = Omit<RawInspirationReference, "sourceSite" | "sourceUrl" | "licenseNote"> & {
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
  "civitai.com",
  "lexica.art",
  "github.com",
]);

const ALLOWED_IMAGE_HOSTS = new Set([
  "image.civitai.com",
  "image.lexica.art",
  "raw.githubusercontent.com",
  "pbs.twimg.com",
  "github.com",
  "cms-assets.youmind.com",
]);

const VERIFIED_SOURCE_SITES = new Set([
  "civitai",
  "lexica",
  "awesome gpt image 2 gallery",
  "weshop gpt image 2",
  "picotrex nano banana",
  "youmind gpt image 2",
  "youmind nano banana pro",
  "zerolu nano banana pro",
  "dongyubin ai images prompts",
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

function isVerifiedPromptMatchedReference(reference: RawInspirationReference) {
  const sourceSite = reference.sourceSite.trim().toLowerCase();
  const prompt = reference.prompt.trim();
  const title = reference.title.trim();
  if (!VERIFIED_SOURCE_SITES.has(sourceSite)) return false;
  if (!prompt || prompt === title || prompt.length < 24) return false;
  if (!isAllowedHttpsUrl(reference.sourceUrl, ALLOWED_SOURCE_HOSTS)) return false;
  if (!isAllowedHttpsUrl(reference.imageUrl, ALLOWED_IMAGE_HOSTS)) return false;
  return true;
}

export function getInspirationReferences(input: {
  group?: string;
  subcategory?: string;
  sourceSite?: string;
  limit?: number;
  offset?: number;
  verifiedPromptOnly?: boolean;
} = {}): InspirationReferenceResult {
  const limit = Math.max(1, Math.min(Math.floor(input.limit || 900), 900));
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const normalizedGroup = input.group?.trim();
  const normalizedSubcategory = input.subcategory?.trim();
  const normalizedSourceSite = input.sourceSite?.trim().toLowerCase();

  const filteredReferences = RAW_INSPIRATION_REFERENCES
    .filter(reference => isAllowedHttpsUrl(reference.sourceUrl, ALLOWED_SOURCE_HOSTS))
    .filter(reference => isAllowedHttpsUrl(reference.imageUrl, ALLOWED_IMAGE_HOSTS))
    .filter(reference => reference.prompt.trim() && reference.prompt.trim() !== reference.title.trim())
    .filter(reference => !input.verifiedPromptOnly || isVerifiedPromptMatchedReference(reference))
    .filter(reference => !normalizedGroup || reference.group === normalizedGroup)
    .filter(reference => !normalizedSubcategory || reference.subcategory === normalizedSubcategory)
    .filter(reference => !normalizedSourceSite || reference.sourceSite.toLowerCase() === normalizedSourceSite);

  const references = filteredReferences
    .slice(offset, offset + limit)
    .map(reference => ({
      id: reference.id,
      group: reference.group,
      subcategory: reference.subcategory,
      imageUrl: reference.imageUrl,
      title: reference.title,
      prompt: reference.prompt,
      stylePromptEn: reference.stylePromptEn,
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
