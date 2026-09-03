#!/usr/bin/env bash
# API only (:8000). For UI + API with HMR, use `npm run dev` from the repo root.
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  npm install
fi
exec npm run dev
