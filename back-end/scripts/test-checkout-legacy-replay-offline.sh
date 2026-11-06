#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ] || ! command -v sandbox-exec >/dev/null; then
  echo 'Requires macOS sandbox-exec; run only with proven outbound network denial.' >&2
  exit 1
fi
node_path="$(command -v node)"
exec env -i PATH="$PATH" /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)' "$node_path" --import tsx scripts/test-checkout-legacy-replay-hold.ts
