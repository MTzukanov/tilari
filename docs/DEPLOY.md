# VPS deploy (Tilari)

Deployment shape is usually **browser wasm + locker** (mode 3 in
[WORKING_MODES.md](WORKING_MODES.md)). Desktop AppImage remains
[PACKAGING.md](PACKAGING.md). User-facing HTML (fi/en): [`../site/`](../site/).

**Private network instead of a public hostname:** install the same stack on a
VPN (Tailscale / WireGuard / company VPN) and bind `--lan` or publish
`:8000` only on that overlay. Details: [WORKING_MODES.md — VPN](WORKING_MODES.md#vpn).
Tilari has no app login; VPN membership is the gate.

Public **docs + single-file app** can live on GitHub Pages ([PAGES.md](PAGES.md)),
including a custom domain. Do not point the same hostname at both Pages and
this tunnel (`tilari.fi` here is the VPS).

**Stack:** GitHub Actions runs the shared [Test](TESTING.md#ci) workflow
(including Playwright), then builds `frontend/dist` and rsyncs it with the Node
`server/` (plus `frontend/src` for shared `Ledger` imports). The VPS runs official
`node:24-bookworm-slim` (npm into a Docker volume) and, when configured, official
`cloudflare/cloudflared`. No host Node install required beyond Docker. The app
listens only on the Compose network (`:8000`, no published ports).

## GitHub

Secrets:

- `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, optional `VPS_SSH_PORT`
- `TUNNEL_TOKEN` — Cloudflare Tunnel token (Zero Trust → Networks → Tunnels)

Optional variable: `VPS_PROJECT_PATH` (default `~/tilari`).

Each deploy writes `TUNNEL_TOKEN` into `~/tilari/.env` on the VPS (`chmod 600`) and starts the `tunnel` Compose profile. Leave `.env` off git. If the secret is empty, only the `tilari` container starts.

Push to `main` or run the workflow manually.

## VPS, first time

Books and uploads: `~/tilari/data` (container `/data`, locker files in `/data/books`). With the browser wasm engine the API only stores opaque `.kitsas` blobs; with the http engine the same process also runs Ledger.

## Cloudflare

1. Zero Trust → Networks → Tunnels → create a tunnel. Put the token in the GitHub secret `TUNNEL_TOKEN` (not only on the VPS).
2. Public hostname `tilari.fi` → service **`http://tilari:8000`** (Compose service name, not `127.0.0.1`).
3. Access application on `tilari.fi`: allowlisted emails, MFA.
4. DNS for `tilari.fi` is the tunnel CNAME Cloudflare creates. Do not point `tilari.fi` at the VPS A record.

## Local check of Compose (no tunnel)

```bash
cd frontend && npm ci && npm run build
cd ..
docker compose up -d tilari
# API is not on the host. Exec:
docker compose exec tilari node -e "fetch('http://127.0.0.1:8000/api/health').then(r=>r.text()).then(console.log)"
```
