#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/artx-gray-backend/current}"
DATA_DIR="${ARTX_DATA_DIR:-/var/lib/artx-gray}"
UPLOADS_DIR="${ARTX_UPLOADS_DIR:-${DATA_DIR}/uploads}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
PUBLIC_URL="${PUBLIC_URL:-https://backstage.artxsd.com}"

echo "ArtX Tencent Cloud backend audit"
echo "App dir:     ${APP_DIR}"
echo "Data dir:    ${DATA_DIR}"
echo "Uploads dir: ${UPLOADS_DIR}"
echo "Backend URL: ${BACKEND_URL}"
echo "Public URL:  ${PUBLIC_URL}"
echo

echo "Disk usage:"
df -h
echo

echo "ArtX directory sizes:"
du -sh "${APP_DIR}" "${DATA_DIR}" "${UPLOADS_DIR}" 2>/dev/null || true
echo

echo "Runtime checks:"
command -v node >/dev/null && node --version || echo "node: missing"
command -v pnpm >/dev/null && pnpm --version || echo "pnpm: missing"
command -v pm2 >/dev/null && pm2 --version || echo "pm2: missing"
command -v nginx >/dev/null && nginx -v || echo "nginx: missing"
echo

echo "Backend health:"
curl --fail --silent --show-error "${BACKEND_URL%/}/api/health" || true
echo
echo

echo "Public health:"
curl --fail --silent --show-error "${PUBLIC_URL%/}/api/health" || true
echo
echo

echo "PM2 processes:"
if command -v pm2 >/dev/null; then
  pm2 status || true
fi
echo

echo "Nginx config test:"
if command -v nginx >/dev/null; then
  nginx -t || true
fi
