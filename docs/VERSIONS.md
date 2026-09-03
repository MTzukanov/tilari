# Locked-ish dependency snapshot

Recorded **2026-08-25**. Install uses ranges in `frontend/package.json` and
`server/package.json`. Re-check with the commands at the bottom after upgrading.

## Host / runtime

| Tool | Version |
|------|---------|
| OS | Linux |
| Node.js | **v24.11.1** |
| npm | **11.6.2** |
| SQLite | sql.js (ledger) + Node `node:sqlite` (locker lean-split) |

No Python runtime.

## Server (`server/package.json`)

| Package | Role |
|---------|------|
| sql.js | Shared Ledger SQLite in Node |
| tsx | Run TypeScript sources |
| typescript / @types/node | Dev |

## Frontend

See `frontend/package-lock.json` for resolved React / Vite / TypeScript versions.

## Refresh

```bash
node --version
npm --version
cd frontend && npm ls --depth=0
cd ../server && npm ls --depth=0
```
