# Tilari Node server

Stdlib `node:http` hosting:

- **Locker** (`src/locker/`) — opaque lean `.kitsas` + TILARIAT packs (`/api/books*`)
- **Ledger** (`session.ts` + shared `frontend/src/book/ledger.ts`) — posting/reports for `http` engine
- **Static UI** + billing/workflow 501 stubs

No Python. No Hono / Express — only `sql.js` (+ tsx for TypeScript).

## Run

```bash
# Preferred: API + Vite HMR from repo root
cd .. && npm install && npm run install:all && npm run dev
# UI: http://127.0.0.1:5173  (proxies /api -> :8000)

# API only
cd server && npm install && ./run.sh   # :8000
```

Desktop (production UI + browser):

```bash
../scripts/run-desktop.sh
../scripts/run-desktop.sh --lan          # listen on all interfaces; print LAN URL
# or: npm run launcher -- --no-browser
```

## Smoke / tests

```bash
cd server && npm run smoke
cd server && npm test
```
