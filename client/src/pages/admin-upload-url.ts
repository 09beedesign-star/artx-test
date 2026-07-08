import { ART_X_TEST_API_BASE_URL, defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "../lib/api-base-url";

export function getAdminUploadBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_TEST_BACKEND_URL ||
      "",
  );
  if (configured) return configured;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  return defaultApiBaseUrlForCurrentHost(currentOrigin) || ART_X_TEST_API_BASE_URL;
}

export function resolveAdminUploadUrl(src: string, baseUrl = getAdminUploadBaseUrl()) {
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("/uploads/")) return trimmed;

  const normalizedBase = normalizeApiBaseUrl(baseUrl) || ART_X_TEST_API_BASE_URL;
  return `${normalizedBase}${trimmed}`;
}
