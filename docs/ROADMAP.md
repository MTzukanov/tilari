# Roadmap

User-facing **in / partial / not yet** (and what Tilari adds on top of Kitsas):
[SCOPE.md](SCOPE.md). Request features in
[GitHub Discussions](https://github.com/MTzukanov/tilari/discussions).

The phases below are the conversion plan. Check off in git history, not by
deleting text.

## Phase 0 — Docs and foundations

- [x] ADRs, SCOPE, DATA_MODEL, COMPATIBILITY, STORAGE
- [x] `BookRepository` over sqlite3
- [x] Integer cents in domain + HTTP (`*_snt`)
- [x] Backup-on-write, WAL, close-desktop-Kitsas warning

## Phase 1 — Browse

- [x] Browse (voucher list)
- [x] Journal

## Phase 2 — Core booking

- [x] POST/PUT expense, income, transfer, other
- [x] Notes voucher + attachment upload
- [x] Posting invariants, `TilitPaatetty`, `Tositeloki`
- [x] Partner create-on-the-fly

## Phase 3 — Bank statement

- [x] Type 400 editor compatible with importer drafts
- [x] Split line to own voucher (`json.tilioterivi`)
- [x] Bank-centric table (white + green rows, balance strip)
- [ ] Kirjaa/Muokkaa dialog (invoice matching, multi-line splits)
- [ ] Bank-file import (PDF/CSV/TITO) — separate work

## Phase 4 — VAT

- [x] Period summary for codes in DATA_MODEL
- [x] Create type 9100 declaration voucher
- [x] Do not auto-rewrite existing VAT lines on other vouchers

## Phase 5 — Balance-sheet items, year-end, settings

- [x] Keep and serve balance-sheet itemization in cents
- [x] Edit existing 9910/9920/9930
- [x] Settings: company, fiscal years, accounts, allocations, lock date

## Phase 6 — Postgres (superseded by ADR-014)

A live Postgres ledger would be a **second posting engine**. Do not build it
alongside the browser SQLite engine. The Node locker stores whole `.kitsas` files
(the locker), not SQL. If a hosted SQL ledger is needed later, that is a
new product and a new ADR — not a second path through this UI.

Historical notes: dialect / blobstore ideas for schema mapping.

## Explicitly later

Billing, approval workflow, payroll, budget, cloud API, auth — [SCOPE.md](SCOPE.md).

## Phase 7 — Local desktop pack

- [x] Node serves `frontend/dist` (`TILARI_STATIC` / `KITSAS_STATIC_DIR`)
- [x] `server` launcher and `scripts/run-desktop.sh`
- [x] AppImage build script (`packaging/appimage/build.sh`)
- [x] Windows portable zip + `Tilari.exe` (`packaging/windows/build.sh`)
- [x] macOS `.app` zip (`packaging/macos/build.sh`; unsigned / no DMG)

## Phase 8 — In-browser ledger (ADR-014)

- [x] sql.js SQLite WASM processes the book in the tab
- [x] OPFS working copy + download / File System Access save
- [x] Optional locker `GET/PUT /api/books` (ETag); Node locker separate from Ledger

## Phase 9 — Fiscal years and statements

- [x] Fiscal year dashboard with balance sheet / turnover / result and closing status
- [x] Auto-calculate and book 9910 depreciation and 9920 accruals (+ opening voucher)
- [x] Income tax 9930 with the calculation stored in `Tilikausi.json.verolaskelma`
- [x] Notes from a template, edited in-browser, no new dependencies
- [x] Print-ready HTML; PDF via the browser print dialog — [STATEMENT.md](STATEMENT.md)
