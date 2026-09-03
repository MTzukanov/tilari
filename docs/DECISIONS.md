# Architecture Decision Records

Append-only. Do not rewrite history; add a new ADR if a decision changes.
Agents: read this before changing storage, money, posting, or scope.

## ADR-000 License and branding (2026-08-21)

**Status:** accepted

This project is licensed under **GNU GPL-3.0-or-later**, matching upstream
Kitsas ([kitupiikki](https://github.com/artoh/kitupiikki)).

We port SQL and posting rules from the open-source Qt routes, so GPL-3 is the
safe license. Kitsas extra conditions also apply in spirit:

- This software is a **separate product**, not a Kitsas Oy release.
- UI and README must state that **Kitsas Oy does not support** this software.
- Do **not** use the Kitsas Oy name as if this were their product.

Repository and display name: **Tilari**, with subtitle
“yhteensopiva Kitsas `.kitsas`-tiedostojen kanssa · ei Kitsas Oy:n tuote”.

See [LICENSE](../LICENSE) and bundled-library notices in [THIRD_PARTY.md](../THIRD_PARTY.md).

## ADR-001 `.kitsas` schema compatibility

**Status:** accepted

v1 reads and writes **unmodified Kitsas schema 24** (`Asetus.KpVersio`).
JSON blobs (`Tili.json`, `Tosite.json`, `Kohdennus.json`, report templates in
`Asetus`) stay opaque except fields we document in [DATA_MODEL.md](DATA_MODEL.md).

Goal: desktop Kitsas and other schema-24 tools can still open the same file.

Forbidden without a new ADR: renaming tables, changing cent columns to decimals,
normalizing JSON into extra tables, bumping `KpVersio`.

## ADR-002 Money is integer cents

**Status:** accepted

Kitsas stores `Vienti.debetsnt` / `kreditsnt` as **BIGINT cents**.
Domain code and HTTP JSON use integer cents (`*_snt` field names).
The UI converts to EUR only for display (`fi-FI` currency format).

Never use IEEE floats for posting or running saldo. Use `int` throughout;
`decimal.Decimal` only if a future VAT XML exporter needs it.

Helper: `frontend/src/shared/money.ts` (UI). Legal/print HTML uses `formatFiCents` in
`frontend/src/book/yearEndBook.ts` (fixed Finnish formatting).

## ADR-003 Posting invariants

**Status:** accepted

Ported from Kitsas `tosite.cpp` / `tositeroute.cpp`:

1. Posted = `Tosite.tila >= 100`; draft = `50`; deleted = `0`.
2. Per voucher (except type `9010` tilinavaus): `sum(debetsnt) == sum(kreditsnt)`.
3. Schema CHECK: one of `debetsnt` / `kreditsnt` is zero (the other may be null/0).
4. No mutation of vouchers with `pvm <= Asetus.TilitPaatetty`.
5. Every write appends `Tositeloki`.
6. Reports (`/saldot`, `/viennit`, allocation P&L, balance-sheet items, VAT totals) use
   posted rows only (`tila >= 100`). GET by id still returns drafts.

Writable voucher types in v1: `0` Muu, `100` Meno, `200` Tulo, `300` Siirto,
`400` Tiliote, `800` Liitetieto, `9100` Alv-laskelma, plus **edit** of
`9910` / `9920` / `9930` year-end vouchers. Type `210` myyntilasku is read-only
until Billing ships.

## ADR-004 Storage portability (BookRepository)

**Status:** superseded by ADR-016

Historical: all SQL went through a Python `BookRepository`
(`backend/app/repository.py`). That layer is gone. TypeScript `Ledger` over
sql.js is the one posting/report implementation. Do not reintroduce a second
SQL access layer.

## ADR-005 Attachments stay in `Liite.data` for v1

**Status:** superseded by ADR-015

v1 kept BLOBs in `Liite.data` (Kitsas-compatible). Access only via
`BlobStore` (`get_liite` / `put_liite`) so Postgres can move bytes to
filesystem/S3 later. See [STORAGE.md](STORAGE.md).

## ADR-015 Web-native split attachment store (2026-08-24)

**Status:** accepted

Supersedes ADR-005 for the product (browser + locker) path.

Working format is **two artifacts**:

1. **Lean `.kitsas`** — schema-24 SQLite with `Liite` metadata and `sha`;
   `Liite.data` is always `NULL`.
2. **Attachment pack** — content-addressed blobs keyed by hex SHA-256
   (`TILARIAT` pack on the wire; locker `{id}.attachments/{sha}` on disk;
   browser OPFS `tilari/blobs/{sha}`, shared across sessions).

Open downloads the lean DB first so the ledger UI is usable immediately;
attachments sync in the background (top-bar progress). Locker save uploads
the lean DB alone when attachments are unchanged; attachment packs use a
separate ETag (`attachments_sha256`).

A classic single-file `.kitsas` with BLOBs in `Liite.data` is produced only
via **local save / download copy** (export for desktop Kitsas). Opening a
classic file unpacks BLOBs into the attachment store once.

Python `SqliteBlobStore` remains the golden-test oracle for in-DB BLOBs.
See [STORAGE.md](STORAGE.md) and [COMPATIBILITY.md](COMPATIBILITY.md).

## ADR-006 Auth

**Status:** accepted

v1 is localhost single-user, no login. Session auth + multi-book self-host
are out of scope until a later ADR. Do not build SaaS multi-tenant yet.

## ADR-007 Deferred modules: Billing and approval workflow

**Status:** accepted

Billing (`Tuote`, `Rivi`, types 210/214/216, e-invoices) and approval workflow get
stub HTTP routes (`501`) and UI nav placeholders. Core ledger must not be
reshaped to fit them. Details: [SCOPE.md](SCOPE.md).

## ADR-008 Importer stays a separate CLI

**Status:** accepted

Separate importer CLIs that write `.kitsas` files stay out of this repo.
This web app does not absorb them in v1. After import, open the file here.

## ADR-009 Localization

**Status:** accepted

UI language is a first-class feature. Finnish is the source language.

- Catalog: nested JSON under `frontend/src/i18n/locales/{fi,sv,en,de}.json`.
- Engine: tiny custom `t(key, vars)` with `{name}` interpolation, Finnish
  fallback, no i18next.
- Finnish is the source catalog. `sv` / `en` / `de` are filled; missing keys
  still fall back to Finnish. Number and date formats stay independent
  (see ADR-011).
- First visit with no `tilari.locale` shows a language picker. The choice is
  stored in `localStorage`. Clearing all Tilari browser data asks again.
- Human glossary for accounting terms (four languages): [VOCABULARY.md](VOCABULARY.md).
- API stays language-neutral (codes, Finnish `tyyppi_nimi` from the book).
  The UI maps codes (`Tosite.tyyppi`, `Tili.tyyppi`, kohdennus tyyppi) through
  `t()`. Do not localize SQL or schema identifiers.

No default UI language until the user picks one. Persist in `localStorage`
key `tilari.locale`. Supported ids: `fi` | `sv` | `en` | `de`.

## ADR-011 Language and formats are independent (2026-08-21)

**Status:** accepted

UI language (`tilari.locale`) does not change number or date formats.
Formats use a separate setting (`tilari.formats`), default **Finnish**
(`fi-FI`: `1 105,00 €`, `2.1.2026`). Changing language leaves formats on
Finnish unless the user picks another format locale. `getBcp47()` reads the
format setting, not the UI language. `document.documentElement.lang` follows
the UI language.

## ADR-010 Product name Tilari (2026-08-21)

**Status:** accepted

Display name is **Tilari**. A horse is the brand mark.
Do not imply this is a Kitsas Oy product.

## ADR-012 No auto-open book (2026-08-21)

**Status:** accepted

The API process starts with no book. `KITSAS_DB_PATH` is not opened on boot.
Each process has a `session_id`. The UI binds a book only after the user
picks a file or reopens a recent path (`tilari.recentBooks`). If `session_id`
or `db_path` no longer match, drop the ledger and ask again — do not keep
showing a book the backend is no longer serving.

## ADR-013 Desktop AppImage (2026-08-22)

**Status:** accepted (updated 2026-08-25: Node instead of CPython;
cross-platform portable packs)

v1 local pack is a **Linux AppImage**, plus Windows portable zip (`Tilari.exe`)
and macOS `.app` zip (unsigned), and `scripts/run-desktop.sh` for developers.
All use the same payload (`packaging/common/stage-app.sh`): official Node
binary for the target OS/CPU, server + shared book sources, `frontend/dist`.
The launcher waits for `/api/health`, prints `TILARI_URL=`, and opens a browser
unless `--no-browser`.

Not a VPS distribution. Auth and bind-all remain out of scope (ADR-006).
NSIS installers and Apple notarization are later polish, not required for the
portable packs.

## ADR-014 Browser is the ledger engine (2026-08-24)

**Status:** superseded in part by ADR-016 (dual engine); browser remains default

All Kitsas posting rules, reports, and SQLite access for the default `wasm`
engine run **in the browser**. The `.kitsas` file is opened as a SQLite WASM
database (sql.js). A working copy lives in the Origin Private File System so a
refresh does not drop unsaved edits. Persistence adapters:

- **Local (default, privacy):** file picker, File System Access where the
  browser allows overwrite, otherwise download. Bytes never uploaded.
- **Locker (optional):** opaque `.kitsas` blobs (`GET/PUT /api/books/{id}` with
  ETag). The browser downloads, edits, and uploads. Processing still happens
  in the tab for `wasm`.

There is **one** TypeScript port of the domain. Do not keep a second posting
language on the HTTP path.

## ADR-016 Shared TypeScript ledger core + optional Node shell (2026-08-24)

**Status:** accepted (updated 2026-08-25: locker also on Node; Python removed)

There is **one** posting/report implementation: TypeScript `Ledger`
(`frontend/src/book/ledger.ts`) over sql.js. Adaptations:

- **Browser (`wasm`):** `WasmBookService extends Ledger` adds OPFS / file picker /
  locker I/O and implements `BookService`.
- **Node (`http`):** `server/` uses stdlib `node:http` over the same
  `Ledger`. `HttpBookService` is the remote `BookService` client.

The **opaque locker** lives in `server/src/locker/` (no Ledger imports) on the
same process as ledger HTTP and static UI. Prefer keeping that separation.

The user chooses the engine **when opening a book** (FilePick). Preference is
stored in `localStorage` key `tilari.engine`. Changing engine closes the open book.

Vite dev proxy: all `/api` → unified Node `:8000`.

Forbidden without a new ADR: a second independent posting language in production,
or mid-edit engine switches without closing the book.

## ADR-017 Thin kernel + compile-time feature modules (2026-08-30)

**Status:** accepted

The ledger is a **thin kernel** plus **typed vertical modules**. The kernel
knows the database domain (vouchers, accounts, fiscal-period rows, posting
invariants, generic reports). Feature workflows (VAT return, period-end
closing, later salaries/billing) live in `frontend/src/book/modules/<id>/`.

- **Kernel (`LedgerKernel` / `KernelContext`):** `saveVoucher`, balances,
  browse, session, `mutate`. Modules must not open their own SQLite.
- **Module:** a compile-time slice with a typed service (`VatService`),
  optional posting hooks, and explicit HTTP routes. Money movements go
  through `kernel.saveVoucher` / `kernel.mutate`.
- **Composition:** `compose.ts` wires services from the `BOOK_MODULES` record
  onto a kernel session. `BookModules` is inferred from that record.
  `Ledger` exposes `modules` only — no per-feature methods on the façade.
- **HTTP:** each book module may supply `handleRoutes` and `createHttp`.
  The server and HTTP engine loop `BOOK_MODULES`; they do not name features.
- **UI:** each feature also has `frontend/src/modules/<id>/` (api + views).
  `UI_MODULES` is the compile-time screen list; `BookViews` and `SideNav`
  loop it. Host/guest composition uses props and hash routing (fiscalPeriods
  hosts the period-end wizard). No shared React context between modules.

Forbidden without a new ADR: runtime third-party plugin loading, a generic
stringly-typed command bus (`invoke(plugin, command)` / `POST /api/command`),
or posting implemented inside a module instead of the kernel.

## ADR-018 BYO Supabase locker is wasm-only (2026-09-01)

**Status:** accepted

A user-owned Supabase project can replace the Node locker (`/api/books*`) as
the opaque shelf. The browser talks to Storage with the **project URL and anon
(public) key** the user pastes (never `service_role`). Ledger math stays in
the tab (`tilari.engine=wasm`).

**On the server / `tilari.engine=http` is not available on this path.** Mode 4
needs our Node process (`POST /api/open-locker`, live `Ledger` over `/api/*`).
Supabase Storage stores files only. Mixing the HTTP engine with a Supabase
locker is forbidden; the engine picker hides On the server while this backend
is active.

Locker backends live in `frontend/src/book/persist/locker/` (`LockerBackend`).
They are not `BOOK_MODULES`. The Node locker remains for desktop / VPS mode 3.

Threat model: URL+anon opens the bucket. Keep URL, bucket, anon JWT, and the
encryption secret in `sessionStorage` (tab lifetime). Use a **private** bucket,
RLS limited to prefix `tilari/`, and Storage CORS for the Tilari origin. See
[WORKING_MODES.md](WORKING_MODES.md) mode 3b, [STORAGE.md](STORAGE.md), and
ADR-019.

## ADR-019 Client-side AES-GCM for the Supabase locker (2026-09-01)

**Status:** proposed (try in development; merge only if the extra surface is worth it)

Every object under `tilari/{id}/` is encrypted in the tab before Storage upload
(`frontend/src/book/persist/locker/vaultCrypto.ts`). `tilari/vault.json` holds
PBKDF2 salt, iteration count, and a verifier blob — not the secret.

- AES-256-GCM, 12-byte IV, envelope magic `TILARIE1`
- KDF: PBKDF2-SHA-256, 210 000 iterations, one locker-wide key
- Secret is asked on the same connect form as URL / anon / bucket and stored
  in `sessionStorage` with them
- Generate-once fills a 32-byte hex secret (user must copy it elsewhere)
- Node HTTP locker and OPFS working copies stay plaintext
- No plaintext fallback, no secret rotation without rewriting all objects

This does **not** protect a compromised tab (XSS still reads `sessionStorage`).
It does hide ledger bytes from the Supabase project, dashboard, backups, and a
stolen anon key used without the secret.

## ADR-020 Legal files in published artifacts (2026-09-03)

**Status:** accepted

Public source and every shipped build include:

- [LICENSE](../LICENSE) — full GNU GPL-3 text plus section 7 extra terms
- [THIRD_PARTY.md](../THIRD_PARTY.md) — MIT (and related) notices for libraries
  that are copied into the UI bundle or desktop/Docker runtime

Vite copies both next to `frontend/dist` and `dist-single`. Desktop pack scripts
also copy Node’s official `LICENSE` as `NODE_LICENSE`. GitHub Pages publishes
the same two files beside the user guide.

## ADR-021 New book is schema 24 + yritys chart, wasm first (2026-09-03)

**Status:** accepted

Tilari can create a new `.kitsas` in the browser. Creation runs `luo.sql` and
seeds the vendored Kitsas **yritys** chart (`frontend/src/book/newBook/vendor/`),
then overlays company name, optional Y-tunnus, first fiscal year, VAT flags,
and practice. `KpVersio` stays **24**. Notes template `tppohja/fi` is Tilari's
Oy text; report templates `tase/*` / `tulos/*` come from the chart.

The new book is an unsaved OPFS working copy (`local:{id}/…`), same as opening
a file without a disk link. Save / Save as / locker Save as are unchanged.
Creation is **wasm only**; do not open a Node HTTP ledger session for a new
empty book.

Forbidden without a new ADR: yhdistys/asoy charts, `.kitsaskartta` import,
prior-year 9010 opening voucher, HTTP-engine create, or a second posting
language to build the file.


