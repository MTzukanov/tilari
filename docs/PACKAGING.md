# Desktop packaging

Local-only pack of Tilari: one Node process serves the API and the Vite
production UI on `127.0.0.1`. Not for a VPS. Working modes overview:
[WORKING_MODES.md](WORKING_MODES.md). Server deploy: [DEPLOY.md](DEPLOY.md).

All desktop packs share the same payload helper
(`packaging/common/stage-app.sh`): production UI, Node server + shared
`frontend/src/book`, and a standalone Node binary for that OS/CPU.

## Fast path (this machine)

```bash
./scripts/run-desktop.sh
# http://127.0.0.1:8000  (or the next free port; URL is printed)

./scripts/run-desktop.sh --lan
# binds 0.0.0.0; prints TILARI_URL= (localhost) and TILARI_LAN_URL= (phone/other devices)
```

`--no-browser`, `--port 18080`, and `--host 127.0.0.1` are useful for tests.
`--lan` and `--host` are mutually exclusive.

Builds `frontend/dist` on first run, then `server` launcher (`npm run launcher`).

## Tests you can see

```bash
cd server && npm test
cd frontend && npm run test:desktop
```

`test:desktop` builds the UI, starts the launcher on `:18080`, and opens
the golden book in Chromium.

## AppImage (Linux)

```bash
./packaging/appimage/build.sh
APPIMAGE_EXTRACT_AND_RUN=1 ./packaging/appimage/build/Tilari-x86_64.AppImage
```

`APPIMAGE_EXTRACT_AND_RUN=1` is required when FUSE is unavailable.

## Windows (portable zip)

Cross-builds from Linux/macOS (does not need a Windows machine):

```bash
./packaging/windows/build.sh          # → packaging/windows/build/Tilari-win-x64.zip
./packaging/windows/build.sh arm64    # optional
```

On Windows: unzip and run `Tilari.exe` (or `Tilari.cmd`). SmartScreen may warn
on unsigned builds.

## macOS (.app in a zip)

Cross-builds from Linux (no DMG, no notarization):

```bash
./packaging/macos/build.sh            # → packaging/macos/build/Tilari-macos-arm64.zip
./packaging/macos/build.sh x64        # Intel
```

On a Mac: unzip and open `Tilari.app`. Unsigned: right-click → Open the first
time. Signing/notarization is out of scope for this pack.

## Notes

Each pack is a desktop launcher (opens a browser). Do not run it as a server
on a VPS. The UI uses the OS system font stack (no webfonts). Packs include
`LICENSE`, `THIRD_PARTY.md`, and `NODE_LICENSE` (from the official Node
distribution).

## Single HTML (offline trial)

```bash
cd frontend && npm run build:singlefile
# → frontend/dist-single/index.html  (~1.4MB, JS/CSS/WASM inlined)
```

Double-click or open via `file://`. Expected limits vs a normal static host:
no OPFS persistence (secure context), weaker crypto where SubtleCrypto is
blocked, and no locker/`http` engine. Wasm ledger + file picker still work.

Operator comparison (why a local pack beats this file):
[WORKING_MODES.md — Local Node vs single HTML](WORKING_MODES.md#local-node-vs-single-html).
User HTML: [`../site/index.html`](../site/index.html). CI publishes the same
build as `tilari.html` on GitHub Pages ([PAGES.md](PAGES.md)).
