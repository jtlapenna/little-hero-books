#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker is required for isolated Linux tests.' >&2; exit 1; }
cache_dir="$(npm config get cache)/_cacache"
[ -d "$cache_dir" ] || { echo 'Offline npm cache is unavailable.' >&2; exit 1; }
checkout_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/lhl-checkout-linux.XXXXXXXX")"
trap 'rm -rf "$checkout_test_dir"' EXIT HUP INT TERM
mkdir -p "$checkout_test_dir/work/scripts/fixtures" "$checkout_test_dir/cache"
cp package.json package-lock.json tsconfig.json "$checkout_test_dir/work/"
cp -R src "$checkout_test_dir/work/"
cp scripts/test-checkout-preparation-route.ts "$checkout_test_dir/work/scripts/"
cp scripts/fixtures/checkout-route-before-extraction.ts "$checkout_test_dir/work/scripts/fixtures/"
cp -R "$cache_dir" "$checkout_test_dir/cache/_cacache"
# No host sockets or project environment files are mounted. The image must be cached.
docker run --pull never --rm --network none --read-only --tmpfs /tmp \
  --user "$(id -u):$(id -g)" --mount "type=bind,src=$checkout_test_dir/work,dst=/work" \
  --mount "type=bind,src=$checkout_test_dir/cache,dst=/cache" -w /work \
  node:22-bookworm /bin/sh -ec 'env -i PATH="$PATH" HOME=/tmp npm ci --offline --ignore-scripts --no-audit --no-fund --cache /cache && env -i PATH="$PATH" node --import tsx scripts/test-checkout-preparation-route.ts'
