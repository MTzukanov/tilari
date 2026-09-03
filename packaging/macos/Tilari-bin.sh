#!/bin/sh
# Tilari.app entry (Contents/MacOS/Tilari).
set -e
CONTENTS="$(cd "$(dirname "$0")/.." && pwd)"
export TILARI_STATIC="$CONTENTS/Resources/app/www"
cd "$CONTENTS/Resources/app/server"
exec "$CONTENTS/Resources/node/bin/node" --import tsx src/launcher.ts "$@"
