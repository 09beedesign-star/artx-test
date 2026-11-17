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

// 🔒 对外响应不含提示词（prompt / stylePromptEn）：灵感模板提示词全站不展示，接口层也不下发。
// 内部筛选仍按原始数据里的 prompt 做质量过滤，只是不出现在响应里。
export type InspirationReference = Omit<
  RawInspirationReference,
  "sourceSite" | "sourceUrl" | "licenseNote" | "prompt" | "stylePromptEn"
> & {
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

/**
 * ⚠️ 不含 `github.com`：那 18 条是 `github.com/user-attachments/assets/...`，
 * 要跳转到带签名的临时地址，线上图片代理也取不回来 → 点「一键同款」必弹
 * 「同款参考图未能载入」（2026-11-13 实测）。用户拍板：直接从灵感列表剔除。
 */
const ALLOWED_IMAGE_HOSTS = new Set([
  "image.civitai.com",
  "image.lexica.art",
  "pbs.twimg.com",
  "cms-assets.youmind.com",
]);

/**
 * 自托管灵感图（2026-11-17）：原 149 张 raw.githubusercontent.com 图片国内被墙、
 * jsdelivr 又拒绝 >50MB 的仓库 → 下载转 WebP 放进 client/public/inspiration-images/ext/，
 * nginx 直接静态出图（30 天缓存），不再经过 /api/images/proxy、不依赖 GitHub。
 */
const SELF_HOSTED_IMAGE_PREFIX = "/inspiration-images/ext/";

function isSelfHostedImagePath(value: string) {
  return value.startsWith(SELF_HOSTED_IMAGE_PREFIX) && /^[\w/.-]+\.webp$/.test(value);
}

function isAllowedImageUrl(value: string) {
  return isSelfHostedImagePath(value) || isAllowedHttpsUrl(value, ALLOWED_IMAGE_HOSTS);
}

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
  if (isSelfHostedImagePath(imageUrl)) return imageUrl;
  return `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
}

function isVerifiedPromptMatchedReference(reference: RawInspirationReference) {
  const sourceSite = reference.sourceSite.trim().toLowerCase();
  const prompt = reference.prompt.trim();
  const title = reference.title.trim();
  if (!VERIFIED_SOURCE_SITES.has(sourceSite)) return false;
  if (!prompt || prompt === title || prompt.length < 24) return false;
  if (!isAllowedHttpsUrl(reference.sourceUrl, ALLOWED_SOURCE_HOSTS)) return false;
  if (!isAllowedImageUrl(reference.imageUrl)) return false;
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
    .filter(reference => isAllowedImageUrl(reference.imageUrl))
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
