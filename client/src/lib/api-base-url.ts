export const ART_X_TEST_API_BASE_URL = "https://backstage.artxsd.com";

const LEGACY_RENDER_API_HOSTS = new Set([
  "artx-test.onrender.com",
]);

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (LEGACY_RENDER_API_HOSTS.has(parsed.hostname)) {
      return ART_X_TEST_API_BASE_URL;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function defaultApiBaseUrlForCurrentHost(fallback = "") {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return ART_X_TEST_API_BASE_URL;
  }
  return fallback;
}
