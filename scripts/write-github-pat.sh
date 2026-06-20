#!/usr/bin/env bash
set -euo pipefail

echo "This will replace the saved GitHub HTTPS credential for github.com."
printf "Paste GitHub PAT, then press Enter: "
stty -echo
IFS= read -r GITHUB_PAT
stty echo
printf "\n"

GITHUB_PAT="$(printf "%s" "$GITHUB_PAT" | tr -d '[:space:]')"
if [[ -z "$GITHUB_PAT" ]]; then
  echo "PAT is empty."
  exit 1
fi

git config --global credential.helper osxkeychain
printf "protocol=https\nhost=github.com\n\n" | git credential reject || true
printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n" "$GITHUB_PAT" | git credential approve
unset GITHUB_PAT

echo "Verifying 09beedesign-star/artx-test..."
git ls-remote https://github.com/09beedesign-star/artx-test.git HEAD >/dev/null
echo "OK: artx-test is accessible."

echo "Verifying 09beedesign-star/09beedesign-star.github.io..."
git ls-remote https://github.com/09beedesign-star/09beedesign-star.github.io.git HEAD >/dev/null
echo "OK: github.io repo is accessible."

echo "GitHub credential is ready."
