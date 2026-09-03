#!/usr/bin/env bash
# One-command local run: production UI + unified Node server, then open a browser.
# Flags are passed through to the launcher, e.g.:
#   ./scripts/run-desktop.sh --lan
#   ./scripts/run-desktop.sh --no-browser --port 18080
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend" && npm run build
cd "$ROOT/server" && npm install
export TILARI_STATIC="$ROOT/frontend/dist"
exec npm run launcher -- "$@"
