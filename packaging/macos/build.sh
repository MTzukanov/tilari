#!/usr/bin/env bash
# Build a macOS .app and zip it. Cross-builds from Linux. No DMG/notarization.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/packaging/macos"
CACHE="$HERE/cache"
BUILD="$HERE/build"
# shellcheck source=../common/stage-app.sh
source "$ROOT/packaging/common/stage-app.sh"
export TILARI_ROOT="$ROOT"

NODE_VERSION="${TILARI_NODE_VERSION:-24.11.1}"

ARCH_IN="${1:-${TILARI_MAC_ARCH:-arm64}}"
case "$ARCH_IN" in
  arm64|aarch64) NODE_ARCH=arm64; LABEL=arm64 ;;
  x64|amd64|x86_64) NODE_ARCH=x64; LABEL=x64 ;;
  *)
    echo "Usage: $0 [arm64|x64]" >&2
    exit 1
    ;;
esac

APP="$BUILD/Tilari-macos-${LABEL}/Tilari.app"
OUT="$BUILD/Tilari-macos-${LABEL}.zip"
NODE_TAR="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"

mkdir -p "$CACHE" "$BUILD"
rm -rf "$BUILD/Tilari-macos-${LABEL}" "$OUT"
mkdir -p \
  "$APP/Contents/MacOS" \
  "$APP/Contents/Resources/node" \
  "$APP/Contents/Resources/app"

echo "==> Node ${NODE_VERSION} (darwin-${NODE_ARCH})"
if [[ ! -f "$CACHE/$NODE_TAR" ]]; then
  echo "    downloading $NODE_URL"
  curl -fL --retry 3 -o "$CACHE/$NODE_TAR" "$NODE_URL"
fi
rm -rf "$BUILD/node-mac-prefix"
mkdir -p "$BUILD/node-mac-prefix" "$APP/Contents/Resources/node/bin"
tar -xzf "$CACHE/$NODE_TAR" -C "$BUILD/node-mac-prefix" --strip-components=1
cp -a "$BUILD/node-mac-prefix/bin/node" "$APP/Contents/Resources/node/bin/node"

stage_tilari_app "$APP/Contents/Resources/app" darwin "$NODE_ARCH"

echo "==> app metadata"
cp "$HERE/Tilari-bin.sh" "$APP/Contents/MacOS/Tilari"
chmod +x "$APP/Contents/MacOS/Tilari"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
"$ROOT/scripts/copy-legal.sh" "$APP/Contents/Resources" "$BUILD/node-mac-prefix"
"$ROOT/scripts/copy-legal.sh" "$BUILD/Tilari-macos-${LABEL}"
cp "$HERE/README.txt" "$BUILD/Tilari-macos-${LABEL}/README.txt"
cp "$ROOT/frontend/public/favicon.svg" "$APP/Contents/Resources/tilari.svg"

echo "==> zip"
(
  cd "$BUILD"
  zip -qr "$OUT" "Tilari-macos-${LABEL}"
)

echo "Built $OUT"
echo "On a Mac: unzip, then open Tilari.app (right-click → Open if Gatekeeper blocks)"
