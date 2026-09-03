#!/usr/bin/env bash
# Stage the Tilari desktop payload (production UI + server + shared book).
#
# Usage:
#   stage_tilari_app DEST_DIR NPM_OS NPM_CPU
#
# DEST_DIR receives:
#   server/   frontend/   www/
#
# NPM_OS / NPM_CPU select optional native deps (e.g. esbuild via tsx):
#   linux / x64 | arm64
#   win32 / x64 | arm64
#   darwin / x64 | arm64
#
# shellcheck shell=bash

stage_tilari_app() {
  local dest="${1:?dest}"
  local npm_os="${2:?npm os}"
  local npm_cpu="${3:?npm cpu}"
  local root="${TILARI_ROOT:?TILARI_ROOT}"

  mkdir -p "$dest/server" "$dest/frontend/src" "$dest/www"

  echo "==> frontend production build"
  (cd "$root/frontend" && npm run build)
  cp -a "$root/frontend/dist/." "$dest/www/"
  "$root/scripts/copy-legal.sh" "$dest"

  echo "==> server + shared book sources ($npm_os-$npm_cpu)"
  cp -a "$root/server/package.json" "$dest/server/"
  cp -a "$root/server/src" "$dest/server/src"
  cp -a "$root/frontend/src/book" "$dest/frontend/src/book"
  cp -a "$root/frontend/src/api.ts" "$dest/frontend/src/api.ts"

  (
    cd "$dest/server"
    npm install --omit=dev --os="$npm_os" --cpu="$npm_cpu"
    # tsx runs TypeScript without a separate emit step
    npm install "tsx@^4.20.5" --no-save --os="$npm_os" --cpu="$npm_cpu"
  )

  # Book sources import sql.js; Node resolves from frontend/, not server/.
  # Copy (not symlink) so zip extracts work on Windows without developer mode.
  mkdir -p "$dest/frontend/node_modules"
  rm -rf "$dest/frontend/node_modules/sql.js"
  cp -a "$dest/server/node_modules/sql.js" "$dest/frontend/node_modules/sql.js"
}
