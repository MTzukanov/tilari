# Frontend

React + Vite UI for the local-first Kitsas-compatible ledger (EUR display, cents API).

- Humans: [README.md](../README.md)
- Agents: [AGENTS.md](../AGENTS.md)
- Versions: [docs/VERSIONS.md](../docs/VERSIONS.md)
- Server: [server/README.md](../server/README.md)

## Toolchain (verified)

| Tool | Version |
|------|---------|
| Node.js | v24.11.1 |
| npm | 11.6.2 |
| react / react-dom | 19.2.8 (resolved) |
| vite | 8.2.1 (resolved) |
| typescript | 6.0.3 (resolved) |

## Scripts

```bash
# From repo root (API + this UI together):
npm run dev

# Frontend alone (API must already be on :8000):
npm install
npm run dev      # http://127.0.0.1:5173
npm run build
npm run build:singlefile   # one HTML in dist-single/ (open in a browser)
npx tsc -b --noEmit
npm test                 # vitest
npm run test:e2e         # Playwright (golden book, ports 18000/15173)
npm run test:desktop     # production UI via launcher on :18080
npx playwright install --with-deps chromium firefox webkit   # first time only
```

`/api` is proxied to `http://127.0.0.1:8000` in `vite.config.ts`.

## Source map

| File | Role |
|------|------|
| `src/app/BookShell.tsx` | Company header, period picker, hash routing |
| `src/modules/reports/ui/AccountLedger.tsx` | Per-account ledger (month/year, running balance) |
| `src/modules/allocations/` | Cost-centre list and P&L |
| `src/modules/vouchers/ui/VoucherEditor.tsx` | Voucher editor (opened from browse, ledger, …) |
| `src/shared/voucherTypes.ts` | Voucher type / status labels |
| `src/api.ts` | `fetch` helpers for `/api/*` |
| `src/shared/accountTypes.ts` | Account type codes |
| `src/shared/TypeTag.tsx` | Type badge UI |
| `src/app/routing.ts` | Hash route parser |
| `src/shared/periodNav.ts` | Month / fiscal year / all-time helpers |
| `src/book/modules/periodEnd/domain/statement.ts` | Financial statements (notes + print) |

Write all sources as **UTF-8** (no Windows-1252 `0x97` dashes).
