#!/usr/bin/env bash
# Copy Tilari LICENSE + THIRD_PARTY.md into DEST.
# Optional second argument: extracted Node.js prefix; copies its LICENSE as NODE_LICENSE.
set -euo pipefail

DEST="${1:?destination directory}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$DEST"
cp "$ROOT/LICENSE" "$DEST/LICENSE"
cp "$ROOT/THIRD_PARTY.md" "$DEST/THIRD_PARTY.md"

if [[ -n "${2:-}" && -f "$2/LICENSE" ]]; then
  cp "$2/LICENSE" "$DEST/NODE_LICENSE"
fi
