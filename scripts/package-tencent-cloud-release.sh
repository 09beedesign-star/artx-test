#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

RELEASE_DIR="${RELEASE_DIR:-output/tencent-cloud}"
RELEASE_NAME="${RELEASE_NAME:-artx-backstage-$(date +%Y%m%d-%H%M%S)}"
RELEASE_ROOT="${RELEASE_DIR}/${RELEASE_NAME}"
TARBALL="${RELEASE_ROOT}.tar.gz"
GRAY_PUBLIC_URL="${GRAY_PUBLIC_URL:-https://backstage.artxsd.com}"
GRAY_ADMIN_HOST="${VITE_ADMIN_HOST:-}"
GRAY_ADMIN_HOST="${GRAY_ADMIN_HOST%%/*}"

mkdir -p "${RELEASE_DIR}"
rm -rf "${RELEASE_ROOT}" "${TARBALL}"

echo "Building ArtX release..."
VITE_API_BASE_URL="${VITE_API_BASE_URL:-${GRAY_PUBLIC_URL}}" \
VITE_AUTH_API_BASE_URL="${VITE_AUTH_API_BASE_URL:-${GRAY_PUBLIC_URL}}" \
VITE_AI_API_BASE_URL="${VITE_AI_API_BASE_URL:-${GRAY_PUBLIC_URL}}" \
VITE_TEST_BACKEND_URL="${VITE_TEST_BACKEND_URL:-${GRAY_PUBLIC_URL}}" \
VITE_TEST_FRONTEND_URL="${VITE_TEST_FRONTEND_URL:-${GRAY_PUBLIC_URL}}" \
VITE_ADMIN_HOST="${GRAY_ADMIN_HOST}" \
pnpm run build

mkdir -p "${RELEASE_ROOT}"
cp -R dist "${RELEASE_ROOT}/dist"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "${RELEASE_ROOT}/"

if [[ -d patches ]]; then
  cp -R patches "${RELEASE_ROOT}/patches"
fi

mkdir -p "${RELEASE_ROOT}/deploy/tencent-cloud"
cp deploy/tencent-cloud/ecosystem.config.cjs "${RELEASE_ROOT}/deploy/tencent-cloud/"
cp deploy/tencent-cloud/artx-server.env.example "${RELEASE_ROOT}/deploy/tencent-cloud/"
cp deploy/tencent-cloud/artx-gray.nginx.conf "${RELEASE_ROOT}/deploy/tencent-cloud/"

mkdir -p "${RELEASE_ROOT}/scripts"
cp scripts/audit-tencent-cloud-backend.sh "${RELEASE_ROOT}/scripts/"
cp scripts/verify-tencent-cloud-gray.mjs "${RELEASE_ROOT}/scripts/"

tar -czf "${TARBALL}" -C "${RELEASE_DIR}" "${RELEASE_NAME}"

echo
echo "Release tarball: ${TARBALL}"
echo
du -sh "${RELEASE_ROOT}" "${TARBALL}" dist dist/index.js dist/public
echo
echo "Server install outline:"
echo "  mkdir -p /opt/artx-gray-backend/releases /var/lib/artx-gray/uploads /var/log/artx"
echo "  tar -xzf ${TARBALL##*/} -C /opt/artx-gray-backend/releases"
echo "  ln -sfn /opt/artx-gray-backend/releases/${RELEASE_NAME} /opt/artx-gray-backend/current"
echo "  cd /opt/artx-gray-backend/current && pnpm install --prod --frozen-lockfile"
echo "  systemctl restart artx-gray-backend.service"
