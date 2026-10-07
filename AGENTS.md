# AGENTS.md - Tilari

Context for AI coding agents working in this repository. Prefer this file over rediscovering behaviour from chat history.

## What this is

Local-first **Node** + React (Vite) **read-write** ledger for Kitsas `.kitsas` SQLite books (schema 24). As of this version the saved file is fully interchangeable with desktop Kitsas; that can change later ([COMPATIBILITY.md](docs/COMPATIBILITY.md)). Built and tested on a Finnish limited company with a modest voucher count; other entity types are untested. **Not a Kitsas Oy product**; do not use the Kitsas Oy name as if this were theirs. License: GPL-3 with extra conditions in [LICENSE](LICENSE). Bundled libraries: [THIRD_PARTY.md](THIRD_PARTY.md).

Human docs: [README.md](README.md). User HTML (fi/en/sv/de, GitHub Pages): [site/](site/). How Pages is published: [docs/PAGES.md](docs/PAGES.md). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md). Scope: [docs/SCOPE.md](docs/SCOPE.md). Testing: [docs/TESTING.md](docs/TESTING.md). Working modes: [docs/WORKING_MODES.md](docs/WORKING_MODES.md). Packaging: [docs/PACKAGING.md](docs/PACKAGING.md). Tilari server: [docs/DEPLOY.md](docs/DEPLOY.md).

Known open defects and dated decisions: [MEMORY.md](MEMORY.md).

## Toolchain (verified)

- **Node 24.x**, **npm 11.x** (server uses `node:sqlite` + sql.js)
- Frontend: React 19, Vite 8, TypeScript 6
- No Python in the project

Ledger math lives in TypeScript (`frontend/src/book/`). The browser runs it via
sql.js (default). Optional Node HTTP engine reuses the same `Ledger` when the
user picks server processing at file open (ADR-016). The same Node process also
hosts the opaque locker (`/api/books`) — keep locker code in `server/src/locker/`
separate from Ledger. Browser locker I/O goes through `LockerBackend`
(`frontend/src/book/persist/locker/`): Node HTTP or BYO Supabase Storage.
Supabase locker is wasm-only (ADR-018); do not offer On the server on that path.
Objects in Supabase Storage are AES-GCM encrypted in the tab (ADR-019); the
secret stays in `sessionStorage` with URL/anon/bucket.
New books: `frontend/src/book/newBook/` + `WasmBookService.createNewBook`
(schema 24 + yritys chart, OPFS). Do not create via the HTTP engine.

## Commands

```bash
# Dev (API :8000 + Vite :5173, HMR both) — preferred
npm install && npm run install:all   # first time
npm run dev

# API only
cd server && ./run.sh

# Desktop (production UI from Node)
./scripts/run-desktop.sh --no-browser
# AppImage: ./packaging/appimage/build.sh
# Windows zip: ./packaging/windows/build.sh
# macOS .app zip: ./packaging/macos/build.sh

# UI alone
cd frontend && npm run dev   # :5173, proxies /api -> :8000
cd frontend && npx tsc -b --noEmit
cd frontend && npm test
cd frontend && npm run test:e2e
cd frontend && npm run test:desktop

# server tests
cd server && npm test
```

Env: `KITSAS_BOOKS_DIR` / `TILARI_BOOKS_DIR` for locker storage; `TILARI_STATIC` for production UI; `TILARI_PORT` (default 8000).
Browser access (`server/src/requestGuard.ts`): same origin always; cross-origin only from `TILARI_ALLOWED_ORIGINS` (default the Pages origin); `TILARI_ALLOWED_HOSTS`; `TILARI_MAX_BODY_MB`. Locker book ids are folder names (`^[A-Za-z0-9_-]+$`); server writes go through `writeFileAtomic`.

## Architecture

```
BookService (interface)
  ├─ WasmBookService  extends Ledger   // browser: OPFS / file / locker
  └─ HttpBookService                   // remote client → Node
Ledger                                 // shared domain session (SqliteDb + posting/reports)
frontend/src/book/persist/locker/      // LockerBackend: HTTP /api/books or BYO Supabase
Node server/                           // stdlib node:http
  ├─ locker/                           // opaque /api/books* (no Ledger)
  └─ Ledger HTTP + static UI + stubs
```

Option 1 (chosen). See [docs/ENGINE_OPTIONS.md](docs/ENGINE_OPTIONS.md).

The ledger is **tab-local**. Opening a file never uploads it unless the user
connects their own BYO storage (Tilari server or Supabase) and saves there. OPFS keeps the working copy across
refresh. First mutate snapshots the original bytes in OPFS. Desktop Kitsas
WAL: close the desktop app before sharing the same file (COMPATIBILITY.md).
Locker open fetches the lean DB first; attachments sync in the background
unless the SHA-256 blobs are already in OPFS (`tilari/blobs/{sha}`).

### Important modules

| File | Responsibility |
|------|----------------|
| `frontend/src/book/ledger.ts` | Shared in-process ledger (domain ops) |
| `frontend/src/book/wasmService.ts` | Browser BookService (Ledger + OPFS/locker) |
| `frontend/src/book/httpService.ts` | Remote BookService (fetch → Node) |
| `frontend/src/book/persist/locker/` | Locker backends (Node HTTP, BYO Supabase + client AES-GCM) |
| `server/src/locker/` | Lean `.kitsas` + TILARIAT packs, dual ETags |
| `server/src/app.ts` | HTTP compose: locker + ledger + static + stubs |
| `server/src/launcher.ts` | Desktop start (health wait, browser) |
| `frontend/src/book/attPack.ts` | TILARIAT pack encode/decode (shared with locker) |
| `frontend/src/shared/money.ts` | `formatCents` / `parseEurInput` |

API money fields end in `_snt` (integers). UI formats EUR with `fi-FI`.

## Kitsas semantics (do not reinvent blindly)

Upstream references ([kitupiikki](https://github.com/artoh/kitupiikki)):

- Schema: `kitsas/sqlite/luo.sql` (`KpVersio` 24)
- Balances: `kitsas/sqlite/routes/saldotroute.cpp`
- Entries: `kitsas/sqlite/routes/viennitroute.cpp`
- Save: `kitsas/sqlite/routes/tositeroute.cpp` + `model/tosite.cpp`
- Browse UX: `kitsas/selaus/selauswg.cpp`

Rules already encoded:

1. Money in **integer cents** on `Vienti.debetsnt` / `kreditsnt` and in JSON (`*_snt`).
2. Posted = `Tosite.tila >= 100`; drafts `50`; deleted `0`. Reports use posted only.
3. Per voucher: sum(debit) == sum(credit) except opening balances (9010). One of debit/credit is zero.
4. No mutation of rows with `pvm <= Asetus.TilitPaatetty`.
5. Every write appends `Tositeloki`.
6. BS vs P&L: `CAST(tili AS text) < '3'` vs `>= '3'`.
7. Sign: assets (`tyyppi` starts with `A`, or number `1...`): debit-credit; else credit-debit.
8. Writable types: 0, 100, 200, 300, 400, 800, 9100, and edit 9910/9920/9930. Type 210 is read-only until Billing.
9. JSON blobs stay opaque except documented fields (`tiliote`, `alv`, `tilioterivi`).
10. Fiscal year can start mid-month. Period lookup for month ranges must use **overlap**.
11. **Voucher numbers** (`tunniste`, `posting.ts nextDocNumber`): like Kitsas
    `kitsas/sqlite/routes/tositeroute.cpp` `lisaaTaiPaivita`: drafts (`tila < 100`) have 0 (a
    save back to draft clears the number); a voucher posted now gets `MAX(tunniste)+1` over the
    **fiscal year** (`Tilikausi`) containing its date, same series, `tila >= 100`; a posted
    voucher keeps its number unless an update moves it to another fiscal year or series, which
    renumbers (kitsas `5ae038d1` only removed a client-side reset; the server still renumbers).
    Series of a new voucher (`seriesForNewVoucher`, `kitsas/db/tositetyyppimodel.cpp`):
    `EriSarjaan` off -> NULL (never `''`; Kitsas does not see `''` rows, and tilari counts legacy
    `''` as no series and writes NULL); on -> `Tositesarjat[tyyppi]` (`*` for >= 1000, default
    `JT`, else `X`); `KateisSarjaan` + cash first line (`ARK`) -> `K`. `doc_number` in a save
    payload sets a number by hand (the editor sends it only when changed).
12. **VAT-filed lock** (`kernel/vatLock.ts`, enforced in `posting.ts`): a date is filed when a
    posted `tyyppi 9100` voucher covers it (`json.alv.kausialkaa..kausipaattyy`,
    `kitsas/alv/alvilmoitustenmodel.cpp`). Posting or changing a VAT-coded line (date, account,
    amount, VAT code/rate) dated there, or removing one, is refused unless
    `Asetus.OhitaAlvLukko = ON`; drafts are free until posted; the VAT return itself is exempt.
    Deleting a posted voucher is refused when any line is on/before `TilitPaatetty` or a VAT-coded
    line is in a filed period - no override (`kirjauswg.cpp tositeLadattu`); a VAT return itself
    can be deleted (`alvsivu.cpp poistaIlmoitus`). Attachments of such a
    voucher can be added but not deleted without the override. Every line date (not only the
    voucher date) is checked against `TilitPaatetty`; posted lines must be inside the fiscal years.
13. **Save round-trip** (`posting.ts saveVoucher`, like Kitsas `lisaaTaiPaivita`): lines with an
    `id` of the voucher are updated in place (Vienti ids, `eraid` links and `Merkkaus` survive),
    lines without one are inserted, missing ones deleted. Fields a line omits keep their stored
    value (`arkistotunnus`, `tyyppi`, `pvm`, `eraid`, `json`, `kumppani`, `sarja`/`viite` NULL,
    BLOB `Tosite.json`). An unchanged save writes nothing. The editor keeps these fields on its
    drafts (`modules/vouchers/editorLines.ts`); the assistant/transfer form rebuilds lines only
    after its own fields change, reusing line ids, and vouchers it cannot rebuild exactly open on
    "Viennit" only. Statement rows loaded from the book are saved as stored until edited; loaded
    rows are hidden (and dropped) only by archive id. `postVoucher` posts a draft as it is
    (status + number, Kitsas PATCH). Every `Ledger.mutate` is one SAVEPOINT; never await inside it.
14. **Tositeloki writer signature**: tilari writes `userid 0` + `{"toiminto": ...}`; Kitsas desktop
    writes `userid NULL` + the full voucher JSON. Keep tilari's writes distinguishable.

## UI conventions

- Put user-visible strings in `frontend/src/i18n/locales/{fi,sv,en,de}.json` and call `t('key')`. Finnish is the source catalog; keep the other three in sync. Do not hardcode Finnish in components.
- i18n **keys** and TypeScript identifiers are English. Finnish UI strings stay in `fi.json` values. Kitsas schema names (`Tosite`, `Vienti`, `Asetus.tilinpaatos`, …) stay as stored; comment the English meaning on first use.
- **Always write source files as UTF-8.** Never introduce Windows-1252 bytes (especially `0x97` en-dash). Prefer ASCII `-`.
- No react-router in v1; hashes: `#/browse`, `#/journal`, `#/vat`, `#/settings`, `#/voucher/new/100`, `#/account/{n}`, `#/allocation/{id}`.
  `#/settings` (and `#/settings/storage`) work without an open book for app prefs; book/company fields appear once a book is open.
- Billing nav item (`#/billing`) is a planned stub that explains `docs/SCOPE.md`.
  Approval workflow is deferred (API 501 + `#/workflow` only; no SideNav entry).
- Finnish-first UI with a JSON i18n engine (`frontend/src/i18n/`). Catalogs
  `fi` / `sv` / `en` / `de` are filled; missing keys fall back to Finnish.
  First visit with no `tilari.locale` shows a language picker. Language and
  number/date formats are separate; formats default to Finnish. Accounting
  glossary: [docs/VOCABULARY.md](docs/VOCABULARY.md).
- Brand: **Tilari** + horse mark + disclaimer. Never Kitsas Oy product branding.
- User-facing mode docs are static HTML in `site/` (fi + en + sv + de), not generated from Markdown.
  If you change save, locker, or engine UX, update all four HTML pages and [docs/WORKING_MODES.md](docs/WORKING_MODES.md).
  Pages also publishes `tilari.html` from `npm run build:singlefile` in CI; do not commit `frontend/dist-single/`.

## Out of scope (unless user asks)

- Billing (210/214/216, e-invoices) and approval workflow (501 stubs only)
- SQLAlchemy / live Postgres (dialect + blob extract exist; do not add the ORM yet)
- Absorbing bank/CSV importers into this app
- Authelia / Tailscale / SaaS multi-tenant
- Official kitsas.fi cloud API
- Windows NSIS installer / macOS notarized DMG (portable zips exist; see [docs/PACKAGING.md](docs/PACKAGING.md))

## Samples

- Golden tests: `testdb/tilari-test.kitsas` (committed; figures in `frontend/src/book/expected.ts`)
- Never point CI at production books

## Pitfalls

- Prefer killing the PID from `ss -tlnp | grep 8000` over broad `pkill`.
- Close desktop Kitsas before write; WAL + backup-on-first-write.
- `compute_saldot(endDate)[account]` for `BE`/`T` may not equal last row running balance (those accounts are often synthetic).

## Suggested test sniff

```bash
cd server && npm test
cd frontend && npm test
cd frontend && npx tsc -b --noEmit
cd frontend && npm run test:e2e
cd frontend && npm run test:desktop
curl -s http://127.0.0.1:8000/api/health
```

Full plan: [docs/TESTING.md](docs/TESTING.md).
