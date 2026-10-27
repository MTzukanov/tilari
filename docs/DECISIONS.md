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
- OPFS working copies stay plaintext; encrypted shelf disables **On the server**
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

## ADR-022 One Node shelf layout (object-store) (2026-09-07)

**Status:** accepted

Tilari-server / desktop Node uses a **single** on-disk shelf under
`{booksDir}/tilari/` (same keys as Supabase BYO):

- `{id}/book.kitsas`, `{id}/meta.json`, `blobs/{sha}`, optional `vault.json`

`/api/objects` is the thin CRUD API for wasm BYO. `/api/books*` is a façade
over the same keys (TILARIAT packs on the wire). `POST /api/open-locker`
loads `tilari/{id}/book.kitsas` for **On the server**.

Client encryption (ADR-019) wraps the same paths; it does not change the
layout. Encrypted shelves are wasm-only. No migration of the retired pack
layout (`{id}.kitsas` at booksDir root).

Desktop and remote Tilari-server are the same Node binary; only the URL differs.

## ADR-023 Tilari-owned data table `TilariData` (2026-10-08)

**Status:** accepted. Amends ADR-001 ("normalizing JSON into extra tables" stays forbidden;
this adds one Tilari-owned table and touches no Kitsas table).

Rental objects (vuokrakohteet) need data the ledger does not hold: which balance-sheet item
(tase-erä) holds an object's acquisition cost, which notes vouchers are its documents, the
owner's price estimate and sale-cost assumptions, and later leases and the housing-company
loan share. It lives in one table Tilari owns:

```sql
CREATE TABLE IF NOT EXISTS TilariData (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated TEXT)
```

- Created on the first write; a book without it reads as empty. Values are versioned JSON
  documents (`v`, `rev`); unknown keys are kept on save; a newer `v` is read-only. Keys:
  `property/{kohdennusId}`, `portfolio`. Schema in [DATA_MODEL.md](DATA_MODEL.md).
- Only links and inputs are stored. Every figure is computed from the ledger on read.
- Links use Kitsas ids (`Kohdennus.id`, era root `Vienti.id`, `Tosite.id`). No foreign keys
  or triggers: Kitsas enforces none and may delete referenced rows; orphans show as missing.
- Code: `frontend/src/book/kernel/tilariData.ts`; the rental-object module is
  `frontend/src/book/modules/properties/`.

Why not elsewhere (checked in kitupiikki `b081bfa3`):

- `Kohdennus.json`: the cost-centre dialog builds a new object on OK
  (`maaritys/kohdennusdialog.cpp` `tallenna`), so any edit (e.g. an end date after a sale)
  drops unknown keys. `Kumppani.json`, `Vakioviite.json` and `Vienti.json` are rebuilt the
  same way by their dialogs and voucher helpers. `Tosite.info` is the visible "Lisätietoja".
- `Asetus`: survives, but the developer-tool chart export (`tools/devtool.cpp` `vieKartta`)
  copies every key into a `.kitsaskartta` file, and a new book made from that chart inherits
  them.
- An extra table survives desktop Kitsas: it checks only `Asetus.KpVersio` on open, never
  scans the schema or vacuums, and backs up by copying the file. Kitsas cloud upload ("Siirrä
  pilveen") drops it; that path is out of scope.

Forbidden without a new ADR: Tilari data in Kitsas JSON columns, `Tosite.info` or `Asetus`;
a second Tilari table; foreign keys or triggers on Kitsas tables; storing computed figures.

## ADR-024 Lines left uncorrected on purpose, read from voucher notes (2026-10-10)

**Status:** accepted. Adds one read-only use of `Tosite.json.info` to ADR-001's opaque JSON.

A closed year can only be fixed by a correction voucher in the open year. An owner may decide
not to correct a closed year's misclassification between income and cost accounts, because the
correction would change the open year's income statement lines. The rental-object figures
(income and costs per month) would then stay wrong for that line.

- A correction tool lists each such line in a posted voucher's notes (Lisätiedot,
  `Tosite.json.info`) as `[hki:omit:<Vienti.id>:tili=<account>]` - the format of the owner's
  importer (tilari-bank-import), which writes it into its locked-period correction voucher.
- Tilari reads these keys read-only (`loadRecountedLines` in the rental-object module) and counts
  the line on that account: monthly bars, income and costs, the year table. The net amount is the
  same, so the Kitsas result column stays as booked. The month panel tags the line.
- Only posted vouchers count, and only P&L target accounts that exist in the chart.
- Why not `TilariData`: the decision belongs with the books (the correction voucher, also in the
  Kitsas archive), and the importer regenerates it from its rules, so there is no second copy to
  keep in sync. Tilari never writes these keys.

## ADR-025 Leases: manual rent steps; water advances settled per period (2026-10-26)

**Status:** accepted. Extends ADR-023's `property/{id}` document with `leases[]` and
`water_settlements[]`; the ledger is not changed.

- **Rent increases are manual steps.** A lease stores what the tenant pays from each date on
  (rent, water, parking) and the increase notice for each step. The contract's increase clause
  (percent, euros or index, and the month) only prefills the next step and drives reminders and
  the forecast. Tilari never changes rent on its own: an increase needs the notice the tenant got.
- **Water is an advance settled against use.** For most apartments the tenant pays a monthly
  water advance (vesimaksuennakko). The housing company settles the apartment's water against
  actual use once a year or more often, and the owner settles each tenant's share in turn. A
  lease's water is an advance unless it is marked flat (`water: 'flat'`, never settled).
- **A settlement stores the company's statement, not the tenants' results.** Each entry of
  `water_settlements[]` holds the period, the company's difference (+ the owner pays more,
  - refunded) and, when known, the actual use. Each tenant's share is computed:
  - with the use: the use split by the lease's days in the period, less the lease's advances;
  - without it: the company's difference split by days (passed on).
  The period's own days count, so vacant days stay the owner's. A share is stored only when the
  owner sets their own amount or links the letter sent to the tenant.
- **Booked lines are found by their texts.** Lines on the object about a settlement
  ("vesitasaus", "vesihyvitys", "puuttuvaa vesimaksua"...) belong to the period their text names,
  else to the latest period that ended before them (within nine months). On a vastike account,
  the company's line has the settlement's sign; the other sign is the refund passed on. A rent
  payment that also pays a settlement counts the euros it names, else what it has on top of the
  rent. A share is settled only when its lines add up to its balance exactly; any difference,
  however small, shows to the cent (less is partial, more is over). Lines no stored period
  takes are suggested as settlements; they make no rent step in the lease suggestions.
- Why not book the shares: the settlement is already in the ledger as cash. The split between
  tenants is a calculation over the leases, and storing it would go stale when a lease changes.

## ADR-026 Rent arrears per lease, exact to the cent (2026-10-26)

**Status:** accepted. Computed from the ledger and the stored leases; nothing is stored.

- **Each stored lease has its own rent account** (owner's choice). A new tenant starts at zero;
  what an ended lease left (owed or paid ahead) stays on that lease and is shown apart from the
  running one. No income line is left out: one that no lease takes is listed on its own.
- **Exact, with no tolerance.** Every difference shows to the cent, also one the owner will not
  claim. Rounding happens only where a part month is prorated: once per step segment.
- **Expected:** the lease's step totals (rent, water advance, parking) for its days; a full month
  is the total exactly, a part month the total by days. Counted from the later of the lease's
  start and the owner's first day of rent, until the first of its end, the owner's last day of
  rent or the as-of date. Each water
  settlement share (ADR-025) is due on the letter's date, else in the month after the period's
  end; a refund is negative.
- **The owner's first day of rent** (changed 2026-10-27, owner's choice): after a purchase in the
  books, the first whole month owned - the seller keeps the rent of the month of the sale, so a
  purchase on the 8th counts from the 1st of the next month, one on the 1st from that day. Rent
  received on the object before the purchase's date (an asset re-booked as a balance item later,
  say) moves the start back to that payment's month: the owner had the object then, and the
  payment would otherwise show as paid ahead for good. Without a purchase in the books, the books'
  first fiscal year. When the sale agreed otherwise (the month of the sale to the buyer, say), the
  owner gives the day on the edit page (`rent_from`), and it stands for all of these. The box
  there shows the default day; only another day is stored as `rent_from`. Before, the
  count started on the purchase day and the owner had to enter an exception at 0 for the rest of
  that month on every object bought with a tenant.
- **The owner's last day of rent** (2026-10-27, owner's choice): after a sale, the end of the month
  of the sale - the seller usually keeps that month's rent. Before, the count ended on the sale day
  and the month's rent, paid in full, showed as paid ahead. A held object runs on to the as-of
  date. When the sale agreed otherwise, the owner gives the day on the edit page (`rent_until`);
  as with `rent_from`, the box shows the default day (empty while held) and only another is stored.
- **Received:** the object's income lines (without VAT, as booked), each given to one lease: the
  lease whose tenant paid it (from 31 days before its start, also after its end); else the lease
  running then; else the last that ended before it. A stored water settlement's lines go to the
  lease its share gives them, and refunds passed on through the vastike account count there too.
- Why per lease and not one running balance per object: an old unresolved difference would
  otherwise follow every later tenant.

## ADR-027 Agreed rent exceptions stand over the steps (2026-10-26)

**Status:** accepted. Extends ADR-025's leases with `exceptions[]`; the ledger is not changed.

- **An exception is a stretch of days with its own amounts** (rent, water advance, parking): a
  discount, a rent-free month, a temporary rent the owner agreed. On its days it stands for the
  steps, also across a step; the steps (the rent level and its increases) stay as they are, so
  the next increase and its notice still start from the normal rent.
- A discount is typed as the lower rent, not as a minus amount: the form prefills the amounts in
  force and shows the difference. Exceptions lie within the lease and never overlap, so each day
  has one set of amounts. Likewise an object's leases never share a day (one day in two would
  expect its rent twice), nor do its water settlement periods (2026-10-27): saving refuses them,
  and the form names both with their days. A document saved before that check reads as it is and
  the object warns about it (`lease_overlap`, `water_overlap`).
- The rent account (ADR-026) expects the exception's amounts on its days, part months by days
  and rounded once per stretch; a month with one shows what the steps alone would expect and the
  owner's reason. Water advances in the settlements (ADR-025) follow the exception's water too:
  "as agreed" includes the agreement.
- **Entered where the difference shows.** A month of the rent account whose payments differ
  from what it expects offers "Lisää poikkeus": an exception prefilled for the lease's counted
  days in that month, at the monthly total that makes the month expect what was paid (less any
  water settlement due then), exact to the cent also on a part month. Water and parking stay;
  the difference comes off the rent. The owner checks it, gives the reason and saves it on the
  object page; the agreement is attached on the edit page. None is offered where an exception
  already lies in the month: such a month offers "Muokkaa poikkeusta" instead, the stored
  exception in the same form, saved in its place (found by its first day) with its agreement kept,
  or removed there once confirmed.
- Why not edit the steps: a temporary change entered as two steps (down, then back up) reads as
  two rent changes, loses the reason, and would make the increase clause prefill from the
  discounted rent.

## ADR-028 A purchase re-booked onto its item counts from the purchase (2026-10-26)

**Status:** accepted. Read from the ledger; nothing is stored.

- An object's capital comes from its linked items (tase-erät): each debit is capital in, dated
  as booked, and the first is the acquisition date. A purchase is sometimes booked on the shares
  account without an item and moved onto an item later by a technical voucher, which debits the
  item and credits the same account by the same amount without one. That voucher brings no
  capital in: its item lines are dated at the original booking - the latest earlier debit of
  the same amount on the account without an item - and so are the acquisition date, the holding
  time, the cash flows behind the returns and the rent account's start.
- Matching by account and amount picks the line; when two earlier debits have the same amount,
  the later one is taken. The voucher's own date stays on the line (`EraRow.rebooked`).
- Why not a manual acquisition date: the purchase is in the ledger, and one stored date could
  disagree with the cash flows the returns are computed from. Capital spent before the books
  began is entered as "Muu sijoitettu pääoma" with its date, as before.

## ADR-029 Rent deposits linked per lease, read from the ledger (2026-10-26)

**Status:** accepted. Extends ADR-025's leases with `deposit`; the ledger is not changed.

- **A lease links what was booked:** the deposit's items (tase-erät) on a liability account, and
  lines booked without an item - real books have returns booked without the item they return.
  An item brings every line booked on it, later returns too; a loose line counts alone.
  Saving accepts only posted item roots and loose lines on liability accounts, each on one
  lease across every object.
- **Shown exact on the lease:** received (credits), returned (debits) and the balance on the
  as-of date. A return's **deduction** is what the same payment booked as income or cost - the
  statement row's other lines, matched by voucher, date, partner and text: rent kept, a water
  settlement, a key. A negative deduction is money paid on top. The rent account already counts
  such income lines, so nothing is counted twice.
- **Warnings:** `deposit_open` when a lease ended more than 60 days before the as-of date and
  still holds a deposit; `deposit_over` when more was returned than received (a receipt not
  linked, or booked elsewhere). Exact, no tolerance.
- **Offered and suggested:** the edit page offers item roots and loose lines on liability
  accounts whose account name or text (else the voucher's title) names a deposit
  (vakuus in any form but not vakuutus - insurance, `takuu`, `pantti`, `deposit`, `säkerhet`,
  `kaution`), the object's own first: its
  cost centre on a line, a rent payer or tenant of it, or its name in the text. ★ marks one that
  fits the lease: received from its tenant, or within 60 days of its start. A suggested lease
  takes the tenant's own receipt nearest its start, else the one receipt near it; with two near
  it and neither the tenant's, the book leaves it to the owner.
- Why not a stored amount: the ledger already has the receipt and the return, and the
  balance follows them when a return is booked later; a typed amount would drift.

