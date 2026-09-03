# Tilari

[![Test](https://github.com/MTzukanov/tilari/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/MTzukanov/tilari/actions/workflows/test.yml)

Tilari is a local-first bookkeeping app for Kitsas `.kitsas` files (schema
**KpVersio 24**). As of this version those files are **fully interchangeable**:
save in Tilari and open in desktop Kitsas, or the other way around. That is a
current promise, not a forever one — a later Tilari might grow its own format
or a schema bump; until then there is no Tilari-only file.

The book stays in a file or a locker you control, not in a Tilari cloud
account. Close desktop Kitsas before Tilari writes the same path (WAL lock).
Details: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

This is **not** a Kitsas Oy product and is **not supported by Kitsas Oy**.

## Why

Desktop Kitsas ([kitupiikki](https://github.com/artoh/kitupiikki)) is a large
Qt/C++ application. Extending it is slow: a browser UI, new save modes, or a
locker that is not the official cloud all mean working in that desktop codebase,
and a mistake there breaks people who still need the Qt app.

Tilari is a separate GPL-3 implementation of the same schema and posting rules.
Compatibility is the floor; what Tilari adds on top of Kitsas, and what is still
missing, is listed below.

Finnish-first UI, with Swedish, English, and German catalogs filled. Number
and date formats are independent of UI language and default to Finnish.
On first visit the app asks which language to use and stores the choice in
`localStorage`. Glossary: [docs/VOCABULARY.md](docs/VOCABULARY.md).

User guide: [site/index.html](site/index.html) (Finnish), [site/en/](site/en/)
(English). Do **not** commit live company books; tests use `testdb/`.

---

## Quick start

```bash
# First time: install root + workspaces
npm install && npm run install:all

# Dev: API (:8000) + Vite UI (:5173) with HMR for both
npm run dev
# open http://127.0.0.1:5173  (proxies /api -> :8000)
```

API only: `cd server && ./run.sh`

One process (production UI, no Vite):

```bash
./scripts/run-desktop.sh
# http://127.0.0.1:8000  (prints TILARI_URL=; add --no-browser to skip the tab)
```

Desktop packs (AppImage / Windows / macOS): [docs/PACKAGING.md](docs/PACKAGING.md).

### Environment

| Variable | Meaning | Default |
|----------|---------|---------|
| `KITSAS_BOOKS_DIR` / `TILARI_BOOKS_DIR` | Locker storage directory | temp `tilari-books` |
| `TILARI_STATIC` / `KITSAS_STATIC_DIR` | Vite `frontend/dist` (desktop pack) | `frontend/dist` if present |
| `TILARI_PORT` | Unified server listen port | `8000` |

### Choosing a book

The API starts **with no book open**. A reload (`tsx watch`, tests, agents)
clears the in-memory ledger session and must not silently point the UI at a
leftover path or another file.

1. UI bookkeeping-file dropdown: **Choose a new file** uploads via
   `POST /api/open`, recent files reopen via `POST /api/open-path`
   (`localStorage` `tilari.recentBooks`).
2. If the process `session_id` changed, the UI drops the live book and asks
   again instead of showing a stale ledger.

Close Kitsas desktop before sharing the same file if you need a consistent snapshot (desktop uses WAL + exclusive lock).

---

## Tested on

The author built Tilari for **his own books**: a Finnish
<abbr title="osakeyhtiö">limited company</abbr> with relatively few vouchers
(typical for freelancers). Large ledgers, associations, housing companies,
sole traders, and other VAT setups are **not tested**. Files should still
open; do not assume they behave.

## What Tilari adds (on top of Kitsas)

Desktop Kitsas remains the reference for features Tilari has not copied yet
(other entity types, chart editor, archive). Tilari can create a new Finnish
business-chart book in the browser. Tilari adds:

- Browser app: one HTML file, a local server, or a self-hosted locker
- Time navigation (<abbr title="Kuukausi">Month</abbr> /
  <abbr title="Tilikausi">financial year</abbr> /
  <abbr title="Kaikki">all</abbr>, prev/next) on
  reports and ledgers
- Click-through reports (balance sheet → account → voucher) and monthly overview charts
- Running balance on the account ledger
- Practice mode and an in-session change log
- OPFS working copy; Chromium can save in place
- Optional locker (Node HTTP, or your own Supabase bucket, encrypted in the tab)
- When a Tilari Node backend is connected: process the book **in the browser**
  or **on the server** (see below)
- Linux / Windows / macOS packs without Qt

### Client-side vs server-side processing

The UI always runs in the browser. If a Tilari **Node** process is connected,
opening a book asks **In this browser** vs **On the server**.
Same posting rules either way (one TypeScript `Ledger`). Without Node (single
HTML, Pages, Supabase locker) only the client engine exists.

| | **In this browser** (default) | **On the server** |
|--|-------------------------------|------------------|
| Where math runs | This tab (sql.js wasm) | Node process |
| Book on the server | Optional opaque locker; server need not understand vouchers | Server holds a live ledger in RAM |
| Several people / tabs | Each tab is its own session; locker save uses ETags | **One** open book per process; a second open replaces the first |
| Weak phone, heavy book | Can be slow | Offloads SQLite to the host |
| Node restart | Working copy stays in the tab (OPFS) | In-memory session is gone; pick the book again |
| Network | Needed to load/save a remote locker | Needed for every operation |
| Supabase locker | Yes | No |

Daily work and shared lockers: keep **In this browser**. On the server is for
one operator, a private host, and a book that is too heavy for the device.
Full write-up: [docs/WORKING_MODES.md](docs/WORKING_MODES.md#two-processing-engines-when-a-backend-is-connected).

## Limitations and next

There is no published schedule. Ask for a missing Kitsas feature or a new
Tilari idea in
[GitHub Discussions](https://github.com/MTzukanov/tilari/discussions).

| Area | Status | Notes |
|------|--------|-------|
| Open an existing `.kitsas` | In | |
| Create a **new** empty book | In | Business chart only; associations / housing companies still start in desktop Kitsas |
| Expense / income / transfer / other | In | |
| Bank statement | Partial | Edit and split a line; no bank-file import |
| Attachments | Partial | Upload and preview. No OCR / parse, no auto-shrink |
| Chart of accounts | Not yet | Chart of accounts is read-only |
| Archive | Not yet | |
| VAT | Partial | HTML declaration; no OmaVero submit |
| Financial statements | In | No annual report / consolidation |
| Billing / workflow / payroll | Not yet | |
| UI languages | In | Finnish, Swedish, English, German. First visit asks and stores `tilari.locale`. |

Full table: [docs/SCOPE.md](docs/SCOPE.md). Working modes:
[docs/WORKING_MODES.md](docs/WORKING_MODES.md).

---

## Docs

| Doc | Contents |
|-----|----------|
| [site/index.html](site/index.html) | User guide, Finnish (GitHub Pages) |
| [site/en/](site/en/) | User guide, English (GitHub Pages) |
| `tilari.html` | Single-file app on Pages (built in CI, not in git) |
| [docs/PAGES.md](docs/PAGES.md) | Pages publish + custom domain |
| [docs/DECISIONS.md](docs/DECISIONS.md) | ADRs (license, cents, posting, storage) |
| [docs/SCOPE.md](docs/SCOPE.md) | In / partial / not yet, plus what Tilari adds |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Schema usage notes |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased delivery |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Interchange with desktop Kitsas (current; may change) |
| [docs/STORAGE.md](docs/STORAGE.md) | SQLite now, Postgres later |
| [docs/TESTING.md](docs/TESTING.md) | Test pyramid |
| [docs/WORKING_MODES.md](docs/WORKING_MODES.md) | Single HTML, static site, locker, VPN, Node processing, in-place save |
| [docs/PACKAGING.md](docs/PACKAGING.md) | Local launcher, AppImage, Windows/macOS zips |
| [docs/DEPLOY.md](docs/DEPLOY.md) | VPS: Actions + official Node/cloudflared images |
| [AGENTS.md](AGENTS.md) | Commands and invariants for agents |
| [docs/VERSIONS.md](docs/VERSIONS.md) | Toolchain snapshot |
| [LICENSE](LICENSE) | GPL-3 + Kitsas extra conditions (full text) |
| [THIRD_PARTY.md](THIRD_PARTY.md) | Notices for React, sql.js, tsx, esbuild, Node |

Schema and posting rules are ported from the open-source Kitsas desktop app.
This repo is a separate product.

---

## Requirements (this machine / verified)

| Tool | Version used when documented |
|------|------------------------------|
| Node.js | **v24.11.1** |
| npm | **11.6.2** |
| OS | Linux |

Frontend (declared vs resolved from `package-lock.json`):

| Package | Declared | Resolved |
|---------|----------|----------|
| react / react-dom | ^19.2.8 | 19.2.8 |
| vite | ^8.2.0 | 8.2.1 |
| typescript | ~6.0.2 | 6.0.3 |
| @vitejs/plugin-react | ^6.0.4 | 6.0.5 |
| oxlint | ^1.75.0 | (see lockfile) |

Ledger math runs in TypeScript (browser sql.js by default; optional Node HTTP
engine). A Node process also hosts the optional opaque file locker. Server:
`sql.js` + Node 24 (`node:sqlite` for locker lean-split). See
[`docs/VERSIONS.md`](docs/VERSIONS.md).

---

## Project layout

```
tilari/
|-- README.md                 # humans
|-- AGENTS.md                 # AI / next agent
|-- docs/VERSIONS.md          # toolchain snapshot
|-- .gitignore
|-- testdb/                   # golden .kitsas (committed)
|-- docs/TESTING.md           # test plan + how to run
|-- docs/WORKING_MODES.md     # single HTML, locker, VPN, browsers
|-- docs/PAGES.md             # GitHub Pages user HTML
|-- docs/PACKAGING.md         # local launcher + desktop packs
|-- site/                     # user guide HTML (fi + en) for Pages
|-- scripts/run-desktop.sh    # one process: API + production UI
|-- packaging/common/         # shared App payload staging
|-- packaging/appimage/       # Linux AppImage
|-- packaging/windows/        # portable zip + Tilari.exe
|-- packaging/macos/          # .app zip (unsigned)
|-- server/
|   |-- README.md
|   |-- package.json
|   |-- run.sh
|   `-- src/
|       |-- app.ts            # locker + ledger + static + stubs
|       |-- locker/           # opaque store (separate from Ledger)
|       |-- launcher.ts
|       `-- session.ts
`-- frontend/
    |-- package.json
    |-- vite.config.ts        # /api proxy -> :8000
    `-- src/
        |-- App.tsx
        |-- book/ledger.ts    # shared domain
        |-- api.ts
        `-- main.tsx
```

Tests: [docs/TESTING.md](docs/TESTING.md). Golden book: [`testdb/`](testdb/).

```bash
cd server && npm test
cd frontend && npm test
```

## HTTP API

Base: `http://127.0.0.1:8000` (or via Vite proxy `/api/...`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | `{ ok, locker, opened, ... }` |
| GET | `/api/books` | List stored books (lean size + attachment hashes) |
| GET/PUT | `/api/books/{id}` | Lean `.kitsas` (`ETag` = ledger sha256) |
| GET/PUT | `/api/books/{id}/attachments` | TILARIAT attachment pack (`ETag` = attachments sha256) |
| GET | `/api/books/{id}/attachments/{sha}` | Single attachment blob |
| GET | `/api/meta` | Company, periods, `kp_versio`, `source_name` (409 if no book) |
| POST | `/api/open` | multipart field `file` (`.kitsas`) -> meta |
| POST | `/api/open-path` | `{ path }` on disk -> meta |
| POST | `/api/open-locker/{id}` | open locker book on server -> meta (http engine) |
| GET | `/api/accounts` | Chart: number, type, name, IBAN |
| GET | `/api/balances?date=YYYY-MM-DD` | All balances + `lines[]` with `section` |
| GET | `/api/entries?account=&start_date=&end_date=` | Ledger + opening, per-row running balance, closing |
| GET | `/api/vouchers/{id}` | Full voucher: header, all lines, attachment metadata |
| GET | `/api/attachments/{id}` | Attachment bytes (`Content-Disposition: inline`) |
| GET | `/api/allocations` | Cost centres / projects (`Kohdennus`) |
| GET | `/api/allocations-summary?start_date=&end_date=&include_projects=` | Per cost-centre P&L totals for a period |
| GET | `/api/allocations/{id}` | One allocation metadata |
| GET | `/api/allocations/{id}/balances?start_date=&end_date=&include_projects=` | P&L by account + income/expense/profit |
| GET | `/api/allocations/{id}/entries?start_date=&end_date=&include_projects=&pnl_only=` | Lines for one cost centre |

### Balance-sheet line `section`

| Value | Meaning |
|-------|---------|
| `vastaavaa` | Assets (account number string starts with `1`) |
| `vastattavaa` | Liabilities / equity (`2...`, including `BE` / `T`) |
| `tulos` | P&L (`>= '3'` as text) |

Balances are **computed** from journal lines (`Vienti`, cents → EUR), not stored.
Posted only: `Tosite.tila >= 100` (voucher status).

### Ledger running balance

- **Opening balance**: activity strictly before the period start (P&L limited to current fiscal year start)
- **Per row**: assets (`tyyppi` starts with `A`, or number `1...`): +debit −credit; else +credit −debit
- **Closing balance**: same as the main report `/saldot` for that account as of the period end (includes special `BE` / `T` when applicable)

---

## Kitsas data model (short)

Authoritative schema: [kitupiikki `luo.sql`](https://github.com/artoh/kitupiikki) (version **24** via `Asetus.KpVersio`).

| Table | Role |
|-------|------|
| `Asetus` | Key/value settings |
| `Tili` | Accounts; name in JSON `$.nimi.fi` |
| `Tilikausi` | Fiscal periods |
| `Tosite` | Vouchers (`tila` status, `tunniste` number, `sarja` series) |
| `Vienti` | Lines: `debetsnt` / `kreditsnt` |
| `Kumppani` | Partners |
| `Liite` | Attachments |

Reference C++ routes (in kitupiikki):

- `kitsas/sqlite/routes/saldotroute.cpp`
- `kitsas/sqlite/routes/viennitroute.cpp`
- Browse UI: `kitsas/selaus/selauswg.cpp`
- Journal running balance: `kitsas/raportti/laatijat/laatijanpaakirja.cpp`

---

## Security notes (not implemented)

Intended later for VPS: Tailscale and/or Caddy + Authelia, localhost-bound API, short-lived encrypted uploads.
**Not** wired in this repo yet.

Current defaults: API on `127.0.0.1:8000`, CORS for Vite only. Uploads land in temp -- fine for local use only.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| UI loads, API fails | Server running on :8000? Proxy in `vite.config.ts`? |
| Empty / wrong book | Choose `.kitsas` again; use **Open recent** if offered |
| File locked / stale | Close Kitsas desktop; re-upload |
| Finnish text broken | Sources must be UTF-8; avoid Windows-1252 dash bytes (`0x97`) |
| Port 8000 in use | `ss -tlnp | grep 8000` then kill that PID |
| Month shows opening balance 0 | Early months may have no prior activity; <abbr title="Kuukausi">Month</abbr> from a full year opens the **end** month |

---

## License / provenance

Tilari is **GPL-3.0-or-later** with extra conditions in [LICENSE](LICENSE), matching
upstream Kitsas ([kitupiikki](https://github.com/artoh/kitupiikki)). Schema and
posting rules are ported from that open-source Qt code. This repo is a separate
product; Kitsas Oy does not support it.

Bundled libraries (React, sql.js, and in desktop/Docker packs tsx, esbuild, and
Node.js) keep their own MIT notices in [THIRD_PARTY.md](THIRD_PARTY.md). Desktop
zips also include `NODE_LICENSE` from the official Node distribution.

