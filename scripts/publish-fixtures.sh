#!/usr/bin/env bash
# T12.1: publish every fixtures/*/ package to npm under the endcredits-demo org. Run once, after
# `npm login` and creating the org. Versions already on npm are skipped, so a rerun is safe.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! user="$(npm whoami 2>/dev/null)"; then
  echo "Not logged in to npm. Run 'npm login' first, and create the 'endcredits-demo' org." >&2
  exit 1
fi
echo "npm user: $user"

for dir in fixtures/*/; do
  name="$(node -p "require('./${dir}package.json').name")"
  version="$(node -p "require('./${dir}package.json').version")"
  if [ "$(npm view "${name}@${version}" version 2>/dev/null || true)" = "$version" ]; then
    echo "skip ${name}@${version} (already published)"
    continue
  fi
  echo "publish ${name}@${version}"
  (cd "$dir" && npm publish --access public)
done
