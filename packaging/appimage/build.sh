#!/usr/bin/env bash
# Build a Linux AppImage that starts Tilari (API + production UI) on localhost.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/packaging/appimage"
CACHE="$HERE/cache"
BUILD="$HERE/build"
APPDIR="$BUILD/Tilari.AppDir"
# shellcheck source=../common/stage-app.sh
source "$ROOT/packaging/common/stage-app.sh"
export TILARI_ROOT="$ROOT"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH=x86_64; NODE_ARCH=x64 ;;
  aarch64|arm64) ARCH=aarch64; NODE_ARCH=arm64 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

OUT="$BUILD/Tilari-${ARCH}.AppImage"
NODE_VERSION="${TILARI_NODE_VERSION:-24.11.1}"
NODE_TAR="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"

mkdir -p "$CACHE" "$BUILD"
rm -rf "$APPDIR"
mkdir -p \
  "$APPDIR/usr/bin" \
  "$APPDIR/usr/share/tilari" \
  "$APPDIR/usr/share/doc/tilari"

echo "==> Node ${NODE_VERSION}"
if [[ ! -f "$CACHE/$NODE_TAR" ]]; then
  echo "    downloading $NODE_URL"
  curl -fL --retry 3 -o "$CACHE/$NODE_TAR" "$NODE_URL"
fi
rm -rf "$BUILD/node-prefix"
mkdir -p "$BUILD/node-prefix"
tar -xJf "$CACHE/$NODE_TAR" -C "$BUILD/node-prefix" --strip-components=1
cp -a "$BUILD/node-prefix/bin/node" "$APPDIR/usr/bin/node"
if [[ -d "$BUILD/node-prefix/lib" ]]; then
  mkdir -p "$APPDIR/usr/lib"
  cp -a "$BUILD/node-prefix/lib/." "$APPDIR/usr/lib/" 2>/dev/null || true
fi

stage_tilari_app "$APPDIR/usr/share/tilari" linux "$NODE_ARCH"

echo "==> desktop metadata"
cp "$HERE/AppRun" "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"
cp "$HERE/tilari.desktop" "$APPDIR/tilari.desktop"
cp "$ROOT/frontend/public/favicon.svg" "$APPDIR/tilari.svg"
"$ROOT/scripts/copy-legal.sh" "$APPDIR/usr/share/doc/tilari" "$BUILD/node-prefix"
cat > "$APPDIR/usr/bin/tilari" <<'EOF'
#!/bin/sh
set -e
HERE=$(dirname "$(readlink -f "$0")")
exec "$HERE/../../AppRun" "$@"
EOF
chmod +x "$APPDIR/usr/bin/tilari"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 256 -h 256 "$APPDIR/tilari.svg" -o "$APPDIR/tilari.png"
elif command -v convert >/dev/null 2>&1; then
  convert -background none -resize 256x256 "$APPDIR/tilari.svg" "$APPDIR/tilari.png"
fi

echo "==> appimagetool"
TOOL="$CACHE/appimagetool-${ARCH}.AppImage"
TOOL_URL="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
if [[ ! -f "$TOOL" ]]; then
  echo "    downloading $TOOL_URL"
  curl -fL --retry 3 -o "$TOOL" "$TOOL_URL"
  chmod +x "$TOOL"
fi

export ARCH
if "$TOOL" --appimage-extract-and-run "$APPDIR" "$OUT"; then
  :
else
  echo "appimagetool extract-and-run failed; trying direct exec" >&2
  "$TOOL" "$APPDIR" "$OUT"
fi

chmod +x "$OUT"
echo "Built $OUT"
echo "Try: APPIMAGE_EXTRACT_AND_RUN=1 $OUT --no-browser --port 18080"
