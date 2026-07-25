const DEFAULT_ALLOWED_ORIGINS = [
  "https://09beedesign-star.github.io",
  "https://admin.artxsd.com",
  "https://artxsd.com",
  "https://www.artxsd.com",
  "https://backstage.artxsd.com",
  "https://gray.artxsd.com",
];

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function configuredOrigins() {
  const raw = [
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.PUBLIC_APP_URL,
    process.env.APP_PUBLIC_URL,
    process.env.SITE_URL,
    process.env.VITE_TEST_FRONTEND_URL,
  ].filter((value): value is string => Boolean(value));

  return raw
    .flatMap((value) => value.split(","))
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function getAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) return "";
  const normalized = normalizeOrigin(origin);
  const allowed = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configuredOrigins(),
  ]);
  return allowed.has(normalized) ? normalized : "";
}
