#!/bin/sh
set -eu

APP=/app/server
HASH_FILE=/data/.package.sha256
mkdir -p /data/tmp /data/books /app/server/node_modules

export TILARI_STATIC="${TILARI_STATIC:-/app/frontend/dist}"
export TMPDIR="${TMPDIR:-/data/tmp}"
export TILARI_HOST="${TILARI_HOST:-0.0.0.0}"
export TILARI_PORT="${TILARI_PORT:-8000}"

cd "$APP"
NEW=$(sha256sum package.json package-lock.json 2>/dev/null | sha256sum | awk '{print $1}')
OLD=""
if [ -f "$HASH_FILE" ]; then
  OLD=$(cat "$HASH_FILE")
fi

if [ ! -d node_modules/sql.js ] || [ ! -d node_modules/tsx ] || [ "$NEW" != "$OLD" ]; then
  # server/ is mounted read-only; do not write package-lock there
  npm install --omit=dev --no-package-lock
  npm install tsx@^4.20.5 --no-save --no-package-lock
  echo "$NEW" > "$HASH_FILE"
fi

exec ./node_modules/.bin/tsx src/index.ts
