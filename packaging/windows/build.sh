#!/usr/bin/env bash
# Build a portable Windows zip: bundled Node + Tilari.exe (+ Tilari.cmd fallback).
# Cross-builds from Linux/macOS. Does not run the Windows binary here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/packaging/windows"
CACHE="$HERE/cache"
BUILD="$HERE/build"
# shellcheck source=../common/stage-app.sh
source "$ROOT/packaging/common/stage-app.sh"
export TILARI_ROOT="$ROOT"

NODE_VERSION="${TILARI_NODE_VERSION:-24.11.1}"
GO_VERSION="${TILARI_GO_VERSION:-1.24.2}"

ARCH_IN="${1:-${TILARI_WIN_ARCH:-x64}}"
case "$ARCH_IN" in
  x64|amd64|x86_64) NODE_ARCH=x64; GOARCH=amd64; LABEL=x64 ;;
  arm64|aarch64) NODE_ARCH=arm64; GOARCH=arm64; LABEL=arm64 ;;
  *)
    echo "Usage: $0 [x64|arm64]" >&2
    exit 1
    ;;
esac

STAGE="$BUILD/Tilari-win-${LABEL}"
OUT="$BUILD/Tilari-win-${LABEL}.zip"
NODE_ZIP="node-v${NODE_VERSION}-win-${NODE_ARCH}.zip"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}"

mkdir -p "$CACHE" "$BUILD"
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/node" "$STAGE/app"

echo "==> Node ${NODE_VERSION} (win-${NODE_ARCH})"
if [[ ! -f "$CACHE/$NODE_ZIP" ]]; then
  echo "    downloading $NODE_URL"
  curl -fL --retry 3 -o "$CACHE/$NODE_ZIP" "$NODE_URL"
fi
rm -rf "$BUILD/node-win-extract"
mkdir -p "$BUILD/node-win-extract"
unzip -q "$CACHE/$NODE_ZIP" -d "$BUILD/node-win-extract"
NODE_PREFIX="$(find "$BUILD/node-win-extract" -maxdepth 1 -type d -name 'node-v*' | head -1)"
cp -a "$NODE_PREFIX/node.exe" "$STAGE/node/node.exe"

stage_tilari_app "$STAGE/app" win32 "$NODE_ARCH"

echo "==> Windows launcher"
cp "$HERE/Tilari.cmd" "$STAGE/Tilari.cmd"
cp "$HERE/README.txt" "$STAGE/README.txt"
"$ROOT/scripts/copy-legal.sh" "$STAGE" "$NODE_PREFIX"

ensure_go() {
  if command -v go >/dev/null 2>&1; then
    command -v go
    return
  fi
  local goarch host
  host="$(uname -m)"
  case "$host" in
    x86_64|amd64) goarch=amd64 ;;
    aarch64|arm64) goarch=arm64 ;;
    *)
      echo "No Go and unsupported host arch $host for bootstrap" >&2
      return 1
      ;;
  esac
  local osname=linux
  case "$(uname -s)" in
    Darwin) osname=darwin ;;
    Linux) osname=linux ;;
    *)
      echo "No Go and unsupported host OS $(uname -s)" >&2
      return 1
      ;;
  esac
  local tar="go${GO_VERSION}.${osname}-${goarch}.tar.gz"
  local url="https://go.dev/dl/${tar}"
  if [[ ! -f "$CACHE/$tar" ]]; then
    echo "    downloading Go ${GO_VERSION}" >&2
    curl -fL --retry 3 -o "$CACHE/$tar" "$url"
  fi
  rm -rf "$CACHE/go-sdk"
  mkdir -p "$CACHE/go-sdk"
  tar -xzf "$CACHE/$tar" -C "$CACHE/go-sdk"
  local gobin="$CACHE/go-sdk/go/bin/go"
  if [[ ! -x "$gobin" ]]; then
    echo "Go bootstrap failed: missing $gobin" >&2
    return 1
  fi
  echo "$gobin"
}

GO_BIN="$(ensure_go)"
export GOTOOLCHAIN=local
export GOCACHE="$CACHE/go-build"
export GOMODCACHE="$CACHE/go-mod"
mkdir -p "$GOCACHE" "$GOMODCACHE"
(cd "$HERE" && GOOS=windows GOARCH="$GOARCH" CGO_ENABLED=0 \
  "$GO_BIN" build -ldflags="-s -w" -o "$STAGE/Tilari.exe" tilari-launcher.go)

echo "==> zip"
(
  cd "$BUILD"
  zip -qr "$OUT" "Tilari-win-${LABEL}"
)

echo "Built $OUT"
echo "On Windows: unzip and run Tilari.exe (or Tilari.cmd)"
