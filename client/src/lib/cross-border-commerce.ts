import type {
  CrossBorderCategoryId,
  CrossBorderComposeInput,
  CrossBorderGenerationContext,
  CrossBorderMarket,
  CrossBorderMarketId,
  CrossBorderPlacementId,
  CrossBorderPlatform,
  CrossBorderPlatformId,
  CrossBorderRiskAction,
  CrossBorderRiskResult,
  CrossBorderTemplate,
  CrossBorderTemplateId,
} from "../../../shared/cross-border-commerce-agent";
import { isCrossBorderTemplateCompatible } from "../../../shared/cross-border-commerce-agent";
import {
  ART_X_TEST_API_BASE_URL,
  defaultApiBaseUrlForCurrentHost,
  normalizeApiBaseUrl,
} from "./api-base-url";

export type CommerceMarketsResponse = {
  version: string;
  markets: CrossBorderMarket[];
  categories: Array<{ id: CrossBorderCategoryId; label: string }>;
  templates: CrossBorderTemplate[];
  governance: { reviewCadence: string; disclaimer: string };
};

export type CommerceSelection = {
  platformId: CrossBorderPlatformId;
  marketId: CrossBorderMarketId;
  categoryId: CrossBorderCategoryId;
  placementId: CrossBorderPlacementId;
  templateId: CrossBorderTemplateId;
};

export type CommerceComposeResponse = {
  context: CrossBorderGenerationContext;
  auditRecordId: string;
};

const AUTH_STORAGE_KEY = "artx-auth-session";
const PLATFORM_ORDER: CrossBorderPlatformId[] = [
  "amazon",
  "shopee",
  "tiktok_shop",
  "lazada",
  "douyin",
  "xiaohongshu",
  "taobao_tmall",
  "jd",
];

function getCommerceApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL || ""
  );
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    )
      return "";
    return defaultApiBaseUrlForCurrentHost(ART_X_TEST_API_BASE_URL);
  }
  return ART_X_TEST_API_BASE_URL;
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch {
    return {};
  }
}

async function requestCommerceJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getCommerceApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok)
    throw new Error(body.error || `电商配置请求失败 (${response.status})`);
  return body;
}

export function fetchCommerceMarkets(signal?: AbortSignal) {
  return requestCommerceJson<CommerceMarketsResponse>(
    "/api/cross-border-commerce/markets",
    { signal }
  );
}

export function checkCommerceRisk(
  input: CrossBorderComposeInput,
  signal?: AbortSignal
) {
  return requestCommerceJson<CrossBorderRiskResult>(
    "/api/cross-border-commerce/risk-check",
    { method: "POST", body: JSON.stringify(input), signal }
  );
}

export function composeCommerceContext(input: CrossBorderComposeInput) {
  return requestCommerceJson<CommerceComposeResponse>(
    "/api/cross-border-commerce/compose",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function getCommercePlatformOptions(data: CommerceMarketsResponse) {
  const byId = new Map<CrossBorderPlatformId, CrossBorderPlatform>();
  for (const selectedMarket of data.markets) {
    for (const platform of selectedMarket.platforms) {
      if (
        platform.status === "active" &&
        platform.placements.some(placement =>
          data.categories.some(category =>
            getCompatibleCommerceTemplates(
              data,
              selectedMarket.id,
              platform.id,
              placement.id,
              category.id
            ).length > 0
          )
        ) &&
        !byId.has(platform.id)
      )
        byId.set(platform.id, platform);
    }
  }
  return PLATFORM_ORDER.flatMap(id => {
    const platform = byId.get(id);
    return platform ? [platform] : [];
  });
}

export function getMarketsForCommercePlatform(
  data: CommerceMarketsResponse,
  platformId: CrossBorderPlatformId
) {
  return data.markets.filter(selectedMarket =>
    selectedMarket.platforms.some(platform =>
      platform.id === platformId &&
      platform.status === "active" &&
      platform.placements.some(placement =>
        data.categories.some(category =>
          getCompatibleCommerceTemplates(
            data,
            selectedMarket.id,
            platform.id,
            placement.id,
            category.id
          ).length > 0
        )
      )
    )
  );
}

export function getCommercePlatformForSelection(
  data: CommerceMarketsResponse,
  marketId: CrossBorderMarketId,
  platformId: CrossBorderPlatformId
) {
  return data.markets
    .find(item => item.id === marketId)
    ?.platforms.find(
      item => item.id === platformId && item.status === "active"
    );
}

export function getCompatibleCommerceTemplates(
  data: CommerceMarketsResponse,
  marketId: CrossBorderMarketId,
  platformId: CrossBorderPlatformId,
  placementId: CrossBorderPlacementId,
  categoryId: CrossBorderCategoryId
) {
  return data.templates.filter(
    template =>
      isCrossBorderTemplateCompatible(template, {
        marketId,
        platformId,
        placementId,
        categoryId,
      })
  );
}

export function repairCommerceSelection(
  data: CommerceMarketsResponse,
  selection: Partial<CommerceSelection>
): CommerceSelection {
  const platforms = getCommercePlatformOptions(data);
  const selectedPlatform =
    platforms.find(item => item.id === selection.platformId) || platforms[0];
  if (!selectedPlatform) throw new Error("当前没有可用的电商平台");

  const markets = getMarketsForCommercePlatform(data, selectedPlatform.id);
  const selectedMarket =
    markets.find(item => item.id === selection.marketId) || markets[0];
  if (!selectedMarket) throw new Error("当前平台没有可用市场");

  const marketPlatform = getCommercePlatformForSelection(
    data,
    selectedMarket.id,
    selectedPlatform.id
  );
  if (!marketPlatform) throw new Error("平台与市场配置不匹配");
  const category =
    data.categories.find(item => item.id === selection.categoryId) ||
    data.categories[0];
  if (!category) throw new Error("当前没有可用商品品类");

  const placements = marketPlatform.placements.filter(item =>
    getCompatibleCommerceTemplates(
      data,
      selectedMarket.id,
      selectedPlatform.id,
      item.id,
      category.id
    ).length > 0
  );
  const selectedPlacement =
    placements.find(item => item.id === selection.placementId) || placements[0];
  if (!selectedPlacement) throw new Error("当前平台没有可用图片用途");

  const templates = getCompatibleCommerceTemplates(
    data,
    selectedMarket.id,
    selectedPlatform.id,
    selectedPlacement.id,
    category.id
  );
  const selectedTemplate =
    templates.find(item => item.id === selection.templateId) || templates[0];
  if (!selectedTemplate) throw new Error("当前组合没有可用风格模板");

  return {
    platformId: selectedPlatform.id,
    marketId: selectedMarket.id,
    categoryId: category.id,
    placementId: selectedPlacement.id,
    templateId: selectedTemplate.id,
  };
}

export function createDefaultCommerceSelection(data: CommerceMarketsResponse) {
  return repairCommerceSelection(data, {
    platformId: "amazon",
    marketId: "us",
    categoryId: data.categories[0]?.id,
  });
}

const STANDARD_RATIOS = [
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:4", value: 3 / 4 },
  { label: "5:4", value: 5 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
] as const;

export function ratioFromCommerceSize(width: number, height: number) {
  const value = width > 0 && height > 0 ? width / height : 1;
  return STANDARD_RATIOS.reduce((best, candidate) =>
    Math.abs(candidate.value - value) < Math.abs(best.value - value)
      ? candidate
      : best
  ).label;
}

export function scaleCommerceOutputSize(
  width: number,
  height: number,
  resolution: "2k" | "4k"
) {
  const longSide = resolution === "4k" ? 3840 : 2048;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  if (safeWidth >= safeHeight) {
    return {
      width: longSide,
      height: Math.max(1, Math.round(longSide * (safeHeight / safeWidth))),
    };
  }
  return {
    width: Math.max(1, Math.round(longSide * (safeWidth / safeHeight))),
    height: longSide,
  };
}

export function riskActionLabel(action: CrossBorderRiskAction) {
  if (action === "block") return "阻止生成";
  if (action === "rewrite") return "需要改写";
  if (action === "advise") return "提示建议";
  return "检查通过";
}

export type {
  CrossBorderComposeInput,
  CrossBorderGenerationContext,
  CrossBorderMarket,
  CrossBorderPlacementId,
  CrossBorderPlatformId,
  CrossBorderRiskResult,
  CrossBorderTemplate,
};
