#!/usr/bin/env bash
set -euo pipefail

TEST_REMOTE="${TEST_REMOTE:-test}"
TEST_BRANCH="${TEST_BRANCH:-feature/interaction-framework}"
TEST_FRONTEND_URL="${TEST_FRONTEND_URL:-https://09beedesign-star.github.io/artx-test/}"
TEST_BACKEND_URL="${TEST_BACKEND_URL:-https://artx-test.onrender.com}"

remote_ref="${TEST_REMOTE}/${TEST_BRANCH}"
expected_sha="$(git rev-parse "${remote_ref}")"
expected_short="${expected_sha:0:7}"

echo "Test frontend: ${TEST_FRONTEND_URL}"
echo "Test backend:  ${TEST_BACKEND_URL}"
echo "Expected ref:  ${remote_ref}"
echo "Expected SHA:  ${expected_sha}"
echo

echo "Checking backend health..."
curl --fail --silent --show-error "${TEST_BACKEND_URL%/}/api/health" >/tmp/artx-test-health.json
cat /tmp/artx-test-health.json
echo
echo

echo "Checking deployed metadata..."
metadata_url="${TEST_FRONTEND_URL%/}/deployment.json?ts=$(date +%s)"
metadata="$(curl --fail --silent --show-error "${metadata_url}")"
echo "${metadata}"
echo

deployed_sha="$(printf '%s' "${metadata}" | node -e 'let input="";process.stdin.on("data",d=>input+=d);process.stdin.on("end",()=>{const data=JSON.parse(input);process.stdout.write(data.commitSha || "")})')"
deployed_backend="$(printf '%s' "${metadata}" | node -e 'let input="";process.stdin.on("data",d=>input+=d);process.stdin.on("end",()=>{const data=JSON.parse(input);process.stdout.write(data.backendUrl || "")})')"

if [[ "${deployed_sha}" != "${expected_sha}" ]]; then
  echo "ERROR: deployed SHA ${deployed_sha:-<empty>} does not match ${expected_sha} (${remote_ref})." >&2
  echo "GitHub Pages may still be deploying, failed, or built from a different ref." >&2
  exit 1
fi

if [[ "${deployed_backend%/}" != "${TEST_BACKEND_URL%/}" ]]; then
  echo "ERROR: deployed backend ${deployed_backend:-<empty>} does not match ${TEST_BACKEND_URL}." >&2
  exit 1
fi

echo "OK: GitHub Pages is serving ${expected_short} and points at ${TEST_BACKEND_URL}."
