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
- **Amended 2026-11-23 (ADR-034, step 4e):** `info` is also read for `[hki:vastike:...]` keys, the rows
  of the vastike invoice paid on a line (below, ADR-034). Same terms: posted vouchers only, read-only,
  written by the importer, never by Tilari.

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
- **The statement can be the company's invoice (2026-11-14).** An extra charge often comes as a
  plain invoice from the housing company, paid with the vastike's reference, that says "water"
  only in its file. The statement picker offers, besides Liitetieto documents, the object's
  vouchers with expense lines and files (bank statements left out). A linked voucher's expense
  lines on the object are that settlement's company lines, whatever their text or sign, and never
  a tenant's. The best guesses are starred: a voucher that matches the difference to the cent;
  else payments to the housing company that are not its vastike (a partner the object pays
  repeating amounts on one account), first those with the reference the vastike uses, then an
  amount never repeated. A booking a later correction moved away does not count (the correction
  pairing of the month figures). Guesses only order the list: nothing is linked or suggested
  without the owner: vastike changes and one-off charges make too many of them to remind of.
  Picked, an invoice fills the fields the owner left empty: the amount and its direction from its
  lines, and a period estimated from its date (the year after the previous settlement, else the
  year up to the month before), marked as an estimate.
- Why not book the shares: the settlement is already in the ledger as cash. The split between
  tenants is a calculation over the leases, and storing it would go stale when a lease changes.
- **A parking space or garage has no water and no parking extra** (amended 2026-11-14, owner).
  On an object of kind `parking` or `garage` the whole payment is rent: lease suggestions put
  every line in the rent, the lease and exception forms offer neither water nor the "autopaikka"
  extra, and no water settlement is suggested or asked for. A lease stored with such amounts
  keeps showing them, so the owner can see and clear them; stored settlements stay in sight.

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
  owner gives the day with the small Muokkaa under the Vuokrasuhteet title (`rent_from`; the edit page
  until 2026-11-15), and it stands for all of these. The box
  there shows the default day; only another day is stored as `rent_from`. Before, the
  count started on the purchase day and the owner had to enter an exception at 0 for the rest of
  that month on every object bought with a tenant.
- **The owner's last day of rent** (2026-10-27, owner's choice): after a sale, the end of the month
  of the sale - the seller usually keeps that month's rent. Before, the count ended on the sale day
  and the month's rent, paid in full, showed as paid ahead. A held object runs on to the as-of
  date. When the sale agreed otherwise, the owner gives the day in the same place (`rent_until`);
  as with `rent_from`, the box shows the default day (empty while held) and only another is stored.
- **Received:** the object's income lines (without VAT, as booked; a VAT lease adds each line's own
  VAT row, ADR-033), each given to one lease: the
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
  object page; the agreement is attached on the lease's card. None is offered where an exception
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
- **Offered and suggested:** the lease card offers item roots and loose lines on liability
  accounts whose account name or text (else the voucher's title) names a deposit
  (vakuus in any form but not vakuutus - insurance, `takuu`, `pantti`, `deposit`, `säkerhet`,
  `kaution`), the object's own first: its
  cost centre on a line, a rent payer or tenant of it, or its name in the text. ★ marks one that
  fits the lease: received from its tenant, or within 60 days of its start. A suggested lease
  takes the tenant's own receipt nearest its start, else the one receipt near it; with two near
  it and neither the tenant's, the book leaves it to the owner.
- Why not a stored amount: the ledger already has the receipt and the return, and the
  balance follows them when a return is booked later; a typed amount would drift.


## ADR-030 Lease reminders are computed warnings (2026-10-27)

**Status:** accepted. Builds on ADR-025, ADR-026 and ADR-029; nothing new is stored.

- **What reminds:** each is a warning on the object, read from the stored leases and water
  settlements on the as-of date, with thresholds as constants in `domain/reminders.ts`:
  - `vacant` / `vacant_until`: an object still held with stored leases, none running - since the
    last one ended, or until the next one starts. Without stored leases the book's suggestions show
    instead, so no reminder.
  - `lease_ending`: the running lease ends within 90 days and no later lease is stored.
  - `increase_due`: the increase clause is set (not `none`); its anniversary (the first of the
    clause's month, else the start month) is within 60 days or in the current month; the lease
    still runs then; the rent last changed (a step, or the start) at least 11 months before it.
    An entered step for the anniversary ends it. Tilari still never raises the rent itself.
  - `water_settlement_missing` / `water_settlement_none`: the running lease pays a water advance,
    and no stored settlement period ended in the last 15 months - with none at all, counted from
    the owner's first advance (not before the rent start, ADR-026).
  - `water_letter_missing`, then `water_tenant_owes` / `water_refund_due`: a tenant share of a
    stored settlement not settled to the cent has no letter 30 days after the company settled
    (its first booked line, else its statement, else the period's end), or is still open after
    60 days. The amount left is exact: + the tenant still owes, - still to refund (also when
    the tenant paid too much). Lines after the as-of date do not count.
- **What the book has and the owner has not defined** (owner, 2026-10-27: suggestions should
  remind, not wait): `lease_suggestions` - suggested leases no stored lease shares a day with (one
  a stored lease covers is answered, though its payer differs, e.g. a care company);
  `water_suggestions` - settlements the booked water lines suggest; `deposits_unlinked` - deposit
  items still held, booked on the object, linked to no lease.
- **Missing documents** (owner, 2026-10-27): every place the stored data has for a document but
  no voucher in - a lease's contract (`lease_contract_missing`), an increase step's notice
  (`increase_notice_missing`), an agreed exception's agreement (`exception_agreement_missing`)
  and a water settlement's statement (`water_statement_missing`). The water letter stays
  `water_letter_missing`, only while the share is open.
- **A sold object** keeps only its open water shares and unlinked deposits still held; the other
  reminders are about objects still held. Cost centres not set up as objects remind of nothing.
- **Where they show:** the object page's warnings; on the portfolio, a ⚠ before the name (with the
  count when more than one; hovering lists them, one bullet each) and a list of every object's
  warnings after the figures (foldable, remembered per browser); in the header, a ⚠ with the
  count that opens that list (`#/properties/alerts`, `GET /api/properties/alerts`). The header
  counts 0.8 s after the last change, so a run of saves counts once; a book without stored objects
  pays nothing. Notes count nowhere: how a sale shared with another object was counted
  (`sale_carried`, `sale_line_split`); nor do cost centres not set up yet, which the setup banner
  asks about. Sale costs not set are none (0 % and 0 €), set only to override; there is no note
  about them (owner, 2026-11-15; `sale_costs_unset` is gone).
- **No dismissing:** a reminder ends when the data answers it - the next lease, the increase
  step, the settlement, the letter, the payment, or the owner's own share amount (ADR-025) for a
  difference they will not claim. Storing dismissals would be a second truth to keep in step.
- **Except a missing document** (owner, 2026-10-27): an increase notice, an exception agreement
  or a water statement may not exist (an increase agreed by email, a statement never sent). The
  owner says so with "Ohita" on the reminder or "Ei asiakirjaa" on the lease or water card, stored as
  `no_document: true` on that step, exception or settlement - an input on the item, not a list of
  dismissals - and taken back by unticking it. Never stored beside a document. The lease's
  contract cannot be skipped: every lease needs one.


## ADR-031 Company documents and deadlines link to vouchers, in their own module (2026-10-31)

**Status:** accepted. Builds on ADR-023; first increment of the company page (`#/company`).

- **Own sidebar item, Tilikaudet untouched** (owner, 2026-10-31). A module `company` with its own
  routes. The closing wizard and the fiscal-period list do not change.
- **A document stays a voucher.** New ones are posted type-800 vouchers. Existing ones stay where
  they are, on any posted voucher: AGM minutes can sit on the voucher that books the dividend, and
  one voucher can hold several documents. So a link names a voucher and, when a
  voucher has several files, one file (`attachment_id`). Kitsas needs nothing from Tilari to show
  them; a link is only ever an id in `TilariData`, key `company` (`docs/DATA_MODEL.md`).
- **A period is its end date** (`Tilikausi.loppuu`), as for Kitsas's `TP_{loppuu}`. Links whose
  period's dates later change stay visible under "Tilikautta ei löydy", so nothing is lost silently.
- **What belongs to a period is stored, not read from a date.** Most documents of a period are dated
  after it ended, in a later period's open year. An old document cannot carry its real date on a new
  voucher (`assertUnlocked`), so the voucher takes the book's day and the link keeps `doc_date`.
- **Kinds are code constants** (`domain/types.ts`). Four are the owner's choice (balance sheet
  specifications, annual report, audit report, PRH extract), all off by default: ticked means listed for
  every period and required, unticked means not listed (owner, 2026-11-01). A row that already holds a
  document stays, because unticking must not hide what was attached. A required slot can be marked not
  needed for one period. A table of kinds would be configuration nobody asked for.
- **Balance sheet specifications need no file here.** The law requires them to be prepared and kept for
  10 years, and says they are not filed for registration (KPL 3:13, 2:10). KILA 2068/2024 calls them an
  internal document, not part of the statements. Kitsas's archive contains them (`arkistoija.cpp`,
  `arkistoiRaportit`), so showing "Puuttuu" would be wrong. Tilari cannot check that an archive exists:
  Kitsas keeps its date in the desktop's settings, not in the book.
- **PRH's extract is not expected either.** The first design's "receipt" is not a standard document: PRH
  sends a trade register extract once statements are registered, and the free extract in Virre lists them.
  The filing itself is still a duty with a late fee, so its deadline stays when the row is not listed. Tilari
  cannot see the register, so after the date the tile says to check with PRH instead of calling it late,
  and it stays out of the header. It reminds before the date, and the tile can be marked handled.
- **One page, with cards that open in place** (the owner's review of the first demo, 2026-11-01). A
  separate page per period hid the state of the others. The address holds what is open
  (`#/company/period/{ends}`, `#/company/own`), so a voucher returns to it; with nothing asked for, the
  newest ended period is open. The look is in `docs/UI_PATTERNS.md`.
- **Kitsas's own statement PDF** (`Liite`, `tosite = 0`, role `TP_{loppuu}`) shows read-only on the
  statements slot. It counts for "prepared" but does not fill the signed slot.
  `Tilikausi.json.vahvistettu` is the day someone pressed confirm, so it is shown as that and never
  stands in for the AGM.
- **Suggestions, never silent links.** `domain/suggest.ts` reads file names, and the title for a
  voucher's only file or a generated file name; only types 0, 300 and 800, so an invoice about a
  statement is not one. Words are matched after folding, on word starts, because `veroilmoitus` is
  also inside VAT and transfer-tax returns and `6b` inside hex names. Minutes go by date, because
  they name the meeting's year; statements by the year they name. Nothing is stored until accepted.
- **Deadlines are computed** (`domain/deadlines.ts`), on the as-of date, indicative, and answered by
  a slot's document or by the owner's word ("Ei tarvita" on the row, or on the tile when the row is not
  listed), which shows as "Hoidettu". Rules and sources are in that file.
  Only the 6B and the dividends' annual report move past days off (laki 150/1930, 5 §), holidays included: the
  act covers deadlines at an authority, and PRH's text names no such rule, so its date stays the earlier, safer one. The header counts those due within 30 days
  or overdue by at most a year: older gaps show on their period's row, or old years would keep it
  lit. Like ADR-030 they cannot be dismissed, only answered.
- **The dividends' annual report is a row of the period whose profit was distributed** (owner, 2026-11-02),
  listed only when the book shows a dividend from that period: a posted credit on Osingonjako after the
  period's end. It is the row the dividend's "reported" step will read. Its date comes from the payment, the
  first debit after that credit, and its name gives that year.
- **A dividend is read from the ledger, nothing is stored** (`domain/dividends.ts`, 2026-11-02). A posted
  credit on Osingonjako (2261) is a decision, and debits on it pay the oldest open decision first. Each
  payment voucher's credit on Ennakonpidätysvelka (2921) is withheld, and debits on that account remit the
  oldest withholding first, whatever it came from, by the 12th of the next month moved past days off. A
  payment that credits another liability left the dividend as a debt, so its voucher should hold the contract.
  The card's five steps (decided, booked, paid, withholding paid, reported) compare these figures to the cent.
  The account numbers are the chart's; a book on others shows no dividend until they become a setting.
- **Income tax bookings are shown, not linked.** The period's type 9930 vouchers lead its documents as a row
  with nothing to upload, since the book already says where they are.
- **Shareholders are inputs, recipients are computed, vouchers are drafts** (owner, 2026-11-03). The owner keeps
  the shareholders and their dated share counts in `company.shareholders[]` (names in `Kumppani`, no personal
  IDs). A dividend's recipients are split from the holdings on its decision day, largest remainder to the cent,
  and never stored. Withholding follows Vero's guide on dividends (in force from 1.1.2023): 7.5 % of the whole
  dividend to a person or a domestic estate up to 150 000 euros a recipient (counted over the payment's calendar
  year), 28 % above, none to a company; a non-resident waits for a typed rate. Tilari writes the decision
  (D 2251 / C 2261, type 300) and "Osingon maksu" (D 2261; per recipient C 2921 and C 2943 or a bank account,
  each line naming the recipient, type 0) as drafts with the ordinary voucher save, the way the book has
  always booked them; the owner posts them. Drafts on 2261 show in the section, so a second one is not made
  by mistake. The withholding remittance stays with the bank import.
- **One meeting, one file** (owner, 2026-11-03: "it is the same attachment for both"). The meeting's minutes
  are the decision voucher's attachment, and the meeting's row links that file, as the book has always done.
  The decision form uploads them onto the draft and links it, or books the decision on the type-800 voucher
  the minutes were stored on. So a link may name a draft: it shows "Luonnos" in amber, does not fill its row
  until posted, and is not counted as a problem. A deleted voucher is still refused.
- **An extraordinary meeting has its own row** (`extra_agm_minutes`, owner 2026-11-03): an extra dividend's
  minutes belong with the period it distributes. Listed once there is a document, a file named so, or a second
  dividend, which makes it required; such files were suggested under "Muut" before. A card's meeting is the
  row whose minutes sit on its voucher or carry its date, else the first dividend is the AGM's.
- **Income tax after the tax decision is read from the book** (owner 2026-11-03): "Tuloveron maksu" follows
  "Verotuspäätös", with what the period's lines put on Tuloverosiirtovelat (Kitsas's setting, 2968) or
  Tuloverosiirtosaamiset (1813) and the later lines that settled it, oldest first. Nothing to upload or link.
  The whole process is in `docs/DIVIDENDS.md`.
- **Why not the dossier as designed elsewhere:** the first design assumed a Kitsas HTTP API, its own
  SQL tables, a dossier inside Tilikaudet, documents only on type 800, and a payment voucher that
  pays from the bank. Tilari has the ledger in-process and one table, and a payment can turn the dividend into
  a debt to the shareholder, which later bank lines repay. Dividends come later, on those steps.

## ADR-032 Annual tax return: one calculation, two outputs (2026-11-01)

**Status:** accepted. Details in [TAX_RETURN.md](TAX_RETURN.md).

- **Both routes** (owner, 2026-11-01). The owner has filed by hand in OmaVero because the figures were worked out
  by hand. An Ilmoitin file should be quicker, but full control needs the numbers for OmaVero as well. Both render
  `computeTaxReturn`, so they cannot disagree.
- **Read-only for the ledger.** A button on the period's card, in a module of its own (`taxReturn`). Only the owner's
  inputs and account choices are written, to `TilariData` (ADR-023), never computed figures.
- **The personal ID is never stored.** The file needs it, so it is typed at download and the file is built in the
  browser, also on the Node engine. A self-hosted server does not see it.
- **The chart decides where past filings differ.** Filed returns placed some accounts differently from year to year.
  Defaults follow the statutory chart, and the owner overrides per account. An account outside the standard chart
  is a guess from its heading, so it stays listed until confirmed.
- **No tolerance.** Each reconciliation shows its difference to the cent ([MEMORY.md](../MEMORY.md), exact figures).
- **Every question answered, every year** (owner, 2026-11-02). OmaVero's questions take an explicit yes or no, so a
  question considered can be told from one missed. Answers do not carry over: a carried no would look considered.
  The form still saves with questions open, since refusing would lose typed work; the check and the stopped file say
  what is left.
- **Forms start from the ledger, and are tied to it to the cent** (2026-11-02). 8A follows tase-eriä, 71B sale vouchers
  and 62 asset movements; what the ledger cannot know is typed. Nothing is guessed from a voucher's partner, who on a
  purchase is usually the seller: back-tested on a real book, it named the filed company in no case. A row or field
  left empty says so rather than holding a plausible wrong value.
- **Form 73 says which dividends are taxable** (2026-11-02). The ledger has one dividend figure and cannot know the
  payer's country or listing, so the classes are typed and must add up to the book's figure. Once they have amounts,
  their taxable share goes to the 6B, as Vero's guide says.
- **Rows from a broker come as pasted text** (2026-11-02). Tilari reads no broker's files (SCOPE.md: bank and CSV
  importers stay outside). 8A takes rows pasted or read from a file in the form's own columns, which any spreadsheet
  can make; tilari-bank-import writes them for Nordnet. A Finnish business ID typed once is kept by name.
- **...or as attachments on a voucher of the period** (owner, 2026-11-03). Running a separate command and picking its
  file was an extra step. tilari-bank-import's Nordnet year end now attaches `8a-YYYY.csv` and `73-YYYY.csv` to the
  voucher it drafts anyway, and the dialog reads them from the period's vouchers by name. The book carries the rows
  behind its 8A and 73, and Kitsas shows them as tables. Domain code only finds the files: in a lean book their bytes
  are in the attachment store, so the dialog fetches them.
- **The calculation is kept with the 6B, not as it** (2026-11-02). The owner wants the result kept for later
  reference. It is a PDF on a Liitetieto voucher, like the rental letters, linked to the period's 6B row with the flag
  `calculation`, so the row and the deadline wait for the filed return. The figures stay in the voucher's file, not in
  `TilariData` (ADR-023). A new save replaces the kept one's file in place rather than adding a voucher (owner, 2026-11-03).
- **A check says where it is fixed** (owner, 2026-11-02). The list's heading is text, not a pill, and each item links
  to its tab and section.
- **OmaVero's wording in the UI.** Vero's file codes appear only in code and the file: OmaVero does not show them.
- **A file is only called ready when complete.** Forms in the same file must exist, since a corrected return replaces
  the earlier one. It can still be format-checked at every step.

## ADR-033 A VAT lease counts its rent with VAT (2026-11-14)

**Status:** accepted. Extends ADR-025/026; the ledger is not changed.

- **One flag on the lease** (owner, 2026-11-14): `vat: true`, a checkbox in "Lisät" beside the parking space.
  The amounts stay without VAT, so rent increases and a change of the general rate (24 % to 25.5 % on
  2024-09-01) need no new steps. The general rate of each day applies (`vatRates.ts`); a lease that starts
  carrying VAT midway is not modelled - its earlier payments show as booked without VAT.
- **The rent account of a VAT lease runs with VAT.** Each month expects VAT on its rent, water advance and
  parking (each part rounded on its own, like invoice rows) and on its water settlement shares; each payment
  counts with its own VAT. Object figures (income, years, yields) stay without VAT: VAT is not income.
- **A line's own VAT row.** Kitsas, Tilari's statement and bank-import book netto VAT (code 11; cash basis 18)
  on a row of its own right after the line: same voucher and date, code + 100 (418 for 18), same rate and
  partner, no cost centre. `pairVatRows` takes the nearest such row after the line, else before; each row goes
  to one line. Brutto lines (12) carry gross - net. A netto line without its row counts no VAT.
- **What does not fit is a warning** (computed, ADR-030): a VAT lease's payment booked without VAT (a new
  tenant's first payment, while bank-import has no VAT history for them), VAT on a lease without it, a rate
  other than the day's general one, a netto line without its VAT row. The month marks the line.
- **Suggestions:** a lease suggested from payments is a VAT lease when most of them carry a sales VAT code.
- **Left out** (owner): letters and invoices with VAT (Holvi invoices), water letters, the 10-year review of
  VAT deducted on property investments (later), VAT in amounts kept from a deposit (a later step).

## ADR-034 Housing-company loans belong to the object, entered by hand (2026-11-17)

**Status:** accepted. Step 4 of the rental objects' Phase 2; the ledger is not changed.

- **A loan is the object's own** (owner, 2026-11-17): `housing_loans[]` on `property/{id}`, with its terms,
  actual reference rates, grace periods, the object's share on each certificate (isännöitsijäntodistus or the
  purchase deed), its rahoitusvastike periods and events. There is no housing-company record. A loan can be
  copied from another object of the same housing company: the copy takes the terms, rates and grace, not the
  share, the charges or the events, and keeps the original's `group`, so a later step can treat the copies as
  one company loan (and build a company record from the groups) without moving data.
- **Same company** is a hint: the copy list puts first the objects that pay one of this object's housing-company
  partners (repeating amounts on one expense account, as `statementSuspects` reads them). A property manager
  billing several companies is one partner too, so the list never hides the others.
- **The Taloyhtiö tab** holds the company's documents (its own links, `housing_doc_voucher_ids`, and every
  voucher a loan links) and the loans as cards edited in place, like leases and water settlements.
- **Rahastoitu / tuloutettu** is a checkbox on each rahoitusvastike period, tuloutettu by default (owner): a
  rahastoitu charge belongs to the shares' acquisition cost in the shareholder's taxation. Later steps warn when
  the ledger books one as a cost.
- **What a loan needs** (owner, 2026-11-17): the form saves a loan only with its name, drawdown and last due date,
  its margin and reset interval (not for a fixed rate, which is all in its rate rows), and at least one share, one
  rahoitusvastike and one rate: what following the share and a forecast need. The company's whole loan is optional
  (nothing is computed from it), but no share may exceed it, nor come before the drawdown. The stored format stays
  lenient, so data written elsewhere still reads. Eased 2026-11-23 (found entering real loans, owner: fix): the
  drawdown is optional (4d), a reference rate row too - a certificate often gives only "Euribor 12 kk + margin", so
  without a row the share is counted on the rate estimate in force (its first before any; a note), and without one on
  the margin alone (to fix); a fixed rate still needs its row. A share may come before the drawdown: the date given was
  a later tranche or refinancing, so the loan counts as drawn by its first share (`drawnOn`).
- **The share from the deed** (2026-11-23): the certificate's document pick offers the purchase's vouchers (the
  tase-erät's acquisitions), starred, as the deed sits on the purchase voucher.
- **A sold object's loans** (owner, 2026-11-23: "for past record even if they are sold"): the Taloyhtiö tab is on
  every object, and a sold one's loans are added, copied and edited like a held one's - the one exception to the
  step-1 rule that a sold object's cards are frozen (leases and water settlements stay frozen). Its paths end at the
  sale month, its cards read the rows on the sale day, it has no forecast and no reminders, and from the sale month
  its share is out of the portfolio's total (its own line still shows it).
- **The day a loan is read on** is the later of the page's as-of date and the book's day: the rows are inputs, not
  bookings, so a share or rate dated after the last booked month counts at once.
- **Reminders** (computed, ADR-030), while the object is held: a running loan with no share, a newest share older
  than 12 months, and a certificate or rahoitusvastike without its document (skippable with `no_document`).
- **The share month by month** (`loanPath`, computed every time): the payments to the housing company are the
  expense lines of the payees the object pays repeating amounts on one account (`housingPayments`), counted as whole
  payments - a month's total over the regular amount in force, rounded, so a catch-up counts two and a small extra
  invoice nothing. They count in the months the cash flow has them (2026-11-24): on the payee's account also a line
  without a partner (a year-end accrual moving a payment made early to the month it is for, a correction moving one to
  the object; the account's largest payee takes it) and another partner's line naming the payee's own reference. Each payment pays the rahoitusvastike in force for the month.
  **The share follows the loan's terms, never the payments** (owner, 2026-11-24, replacing "what is left of the
  payment lowers the share" and the interest fitted between certificates): interest is the share at the month's
  start times reference + margin over twelve; the repayment (`termsRepayment`) is none in an interest-only month or
  without a last due date (`loan_ends_missing`), a tasalyhennys the share over the months left to the last due date,
  an annuity the level payment that clears it by then less the interest, all of it in the last due month. The amount
  is worked out from a month's opening share and holds, as a bank's instalment does, until an annuity's rate changes,
  an interest-only period ends, a certificate or an extra repayment moves the share. Extra repayments lower the share
  and a payoff ends it. A certificate gives the share at its month's end. Before the first one the path runs
  backwards on the same terms (to the later of the loan's start, the owner's first month, the books' start and the first
  charge); each later one restarts the path from the certified share, its month keeping the gap (computed less
  certified); after the last one it runs to the as-of month. What was paid (`paid_snt`) stays on each month for the
  cash flow and the check against the terms; a month without a payment still repays. Without any payee found, each
  due month counts as paid, and the card says so.
- **Its reminders:** due months the payments have not covered by the as-of month (counted on, so an early or a
  catch-up payment settles it; the rahoitusvastike is owed, the share still falls), a rate reset date passed with no rate row for it, and - as a note, since the ledger
  books it so - a rahastoitu rahoitusvastike paid as a cost.
- **A rate row on copies:** a rate row new on a loan card can be added to the same loan on other objects (its
  `group`) in the same save, each ticked by default.
- **The share ahead** (`loanForecast`, 2026-11-18, the owner's ask ahead of the rest of the forecast work): a
  checkbox on the loan's chart runs it on dashed to the loan's end and sums those months by year. The rates are the
  rows and then the latest held. The share falls on the same terms as the path (2026-11-24), the amount worked out
  from the path's last share. What is paid - for the cash flow ahead - is the rahoitusvastike in force (or a later row
  of it) until the next rate reset or the end of an interest-only period, then the terms' repayment and interest;
  the last month pays what is left. No forecast without a last due date after the path.
  Two more checkboxes add the interest, and the repayment with it, summed from the path's first month: on the
  share's scale, where a month's own figures would not show. The chart's choices are remembered in the browser.
- **The share in the figures** (2026-11-19, step 4c): `ObjectSummary.housing_share_snt` is the share of all the
  object's loans at the as-of month's end - not known when a loan's path does not reach back to it, none once sold.
  It is a "Velkaosuus" tile on the overview and Talous, with what is still to recover debt-free (unrecovered +
  share), and on the Properties page a total, a column and a chart of the shares by month (the total is empty where
  no share is known, not 0). A debt-free price is the price plus the share: beside the break-even and the target
  price, and on a price estimate without a typed one (the share at the estimate's month end; the path's last after
  it).
- **The portfolio's shares ahead** (owner, 2026-11-23): a checkbox over the Properties page's shares chart runs each
  held object's line and the total on, faded, to the last payoff: each loan's `loanForecast` on the portfolio's
  curves, as its Taloyhtiö tab draws it, summed per object (`housingShareForecast`); a sold object has none. The
  total stops where an object still owing has no estimate (no rate row and no curve, or no last due date), rather
  than leaving that object out. Only a tasalyhennys falls the same at any rate; an annuity's path bends with the rate
  (its end does not move).
- **Sale costs are a percentage of the debt-free price** (owner, 2026-11-19: a broker's fee is): the selling price
  plus the share the buyer takes over. The break-even, the target price, the IRR's sale at the estimate or book value
  and the portfolio's IRRs count it; without loans nothing changes.
- **The rahoitusvastike split** on Talous: per fiscal year the paths' interest and repayment over the months the
  book follows, each month in the year its first day falls in; extra repayments are not rahoitusvastike. Since
  2026-11-24 they are the terms', so they need not add up to the rahoitusvastike paid; the check against the terms
  (±10 % over 12 months, the owner's next step) shows the difference.
- **No "Rahastoitu rahoitusvastike pääomana" view** (2026-11-19): built on the 4c branch and taken out before merging,
  as the owner asked if it added complexity - they have not seen a rahastoitu vastike, and the view needed a second
  pass over the figures with made-up cost rows. The checkbox on a charge and its warning stay.
- **Rate estimates** (2026-11-20, step 4d; the dated rows replaced by one number per Euribor in ADR-035): nothing is fetched (owner: rates by hand; Euribor history could be
  fetched later, a future rate cannot). The Properties defaults hold one curve per reference rate
  (`rate_forecast`). The forecast keeps the latest actual rate until the next reset, then at each reset takes the
  curve's value for that reset (else keeps the latest). "+1 %-yks." adds a point from the next reset on, not to
  the rate already fixed; for an annuity it shows in the payments (shown by year), as the term stays. The forecast
  shows the payoff against the last due date, the interest ahead and the rate it ends at, as tiles; the rule
  behind it is behind an (i). An interest-only period ending within 6 months warns (`loan_grace_ending`).
- **Floors and ceilings** (owner, 2026-11-20): `rate_limits[]` - a floor and/or a ceiling with an optional start
  (the loan's) and a required end. They hold the reference rate (not reference + margin, as korkokatto and
  korkolattia are usually written) in every month they meet, in the path and in the forecast; a fixed rate has
  none. One at a time.
- **The drawdown is optional** (owner, 2026-11-20): without it the loan counts from the purchase. Months before
  the object was the owner's (before the purchase, or the books' first year) count every due month as paid - by
  whoever owned it - and the path shows only the owner's months, so a certificate from before the purchase rolls
  on to it instead of growing with unpaid interest.
- **The owner's months are the rent's** (owner, 2026-11-26: count from the day the income comes): the loans, their
  payments missing and the Talous split run from the month ADR-026's rent start gives - the owner's own
  `rent_from`, else the first of the month after the purchase (the purchase day if it is a first), an earlier first
  rent, or the books' start - to the last month the rent is the owner's (the sale's, or `rent_until`). The purchase
  month's vastike and repayment are the seller's. Found when the terms (above) began to repay every month: an
  object bought late in a month showed one repayment too many in its first year.
- **Vastike invoices** (2026-11-23, step 4e): the book has one vastike line a month (hoito and rahoitus
  together); the invoice attached to the payment splits it. tilari-bank-import reads it and lists its rows in the
  payment voucher's notes, one key per row: `[hki:vastike:<Vienti.id>:<YYYY-MM>:<hoito|rahoitus|vesi>=<snt>:<label>]`
  (the line it was paid on, the invoice's period, the row as the invoice names it), only when the rows add up to
  the invoice and the invoice to the line, to the cent. Tilari reads them (`loadVastikeFacts`, ADR-024 amended)
  and stays the only writer of `TilariData`; nothing is stored from them.
  - **Rows to loans**, invoice by invoice among the loans running in its month: a row named as a loan's
    `invoice_label`; else the only row to the only loan left; else a row to the only loan whose charge in force is
    its amount. An extra charge (ylimääräinen) goes with the loan of its name, or the only loan. A loan takes one
    regular row of an invoice, so a second company loan not entered yet cannot be counted on the first.
  - **What was paid:** in a month with invoices (by the payment's date, as the payments count) a loan pays its rows
    on them; payments beyond the invoices (one without a readable invoice) still pay the charge in force. The month
    table marks such months.
  - **Suggestions:** walking a loan's regular rows by the invoice's month, an amount that is not the charge in force
    starts "Uusi rahoitusvastike X alkaen kk" (`loan_charge_invoiced`), with that invoice as its document; taken on
    the loan's card it fills a charge row and, when the loan has none, the row's name as `invoice_label`.
  - **A row no loan takes** reminds (`loan_invoice_unmatched`), once per name from its first month: a loan not
    entered, or several loans the names and amounts cannot tell apart.
  - Hoito and vesi rows are read but not used yet: they are for the forecast's hoitovastike trend.
- **No fixed-payment type** (owner, 2026-11-24: no housing-company loan pays so): a loan is an annuity or a
  tasalyhennys. A loan stored as `fixed_payment` reads as an annuity marked `retired_type`, warns
  (`loan_type_retired`) and keeps the mark through other saves of the page until its card saves it with the type
  picked; nothing is converted silently.
- **Next steps:** the object-wide forecast (rents, hoitovastike, vacancy, projected IRR) and the interest check
  against the payments; both are in the step-4 plan's "Later".

## ADR-035 The portfolio's months ahead, on one estimate each for the whole period (2026-11-23)

**Status:** accepted. The Properties page's forecast; the ledger is not changed and nothing computed is stored.

- **One number each, no dated rows** (owner, 2026-11-23: "we don't need to overengineer ... an average for the
  whole period"). `PortfolioSettings.forecast` holds four optional inputs: 12 kk and 6 kk Euribor (1/1000 %), a raise
  a year (bp) for rents and hoitovastike, and other costs in hundredths of a month's rent a year. Market rates
  (futures, swaps) were dropped; nothing is fetched.
- **An empty field takes its default, worked out each time** (owner agreed): a Euribor's is the newest rate row typed
  on any loan with that reference (`newestRates`), so it follows the rows as they are entered; the raise is 1 %, other
  costs one month's rent. The form shows each default in its empty field, and the last 12 months' other costs (their
  expenses less the payments to the housing company, against their income) below their field.
- **The loans** take the estimate of their reference at every reset after their latest rate, and a loan with no rate
  row all along (`rateEstimates`); 3 kk Euribor and prime keep their latest rate. A book's dated `rate_forecast`
  rows from step 4d read as their newest row per Euribor and are dropped on the next save.
- **An object's month ahead** (`objectForecast`): what the tenant pays (rent, water, parking) of the lease's step in
  force - the lease running at the month's end, else the last one, re-let at its rent; a later step typed on it from
  its day - raised each year in the lease's increase month, else the month it started; an object with no lease at all
  takes its last 12 months' income a month, raised each January. Out: the hoitovastike - of the latest three months that paid
  the housing company one month's worth, the middle one of each less the loans' rahoitusvastike in it (a one-off
  on top in one month does not count), so water paid there stays in, as
  the tenant's water does - raised each **June** (owner); the rahoitusvastike the loans' estimates pay
  (`vastikeAhead`; a loan still owing with no estimate pays its charge in force to its last due date); other costs, the
  month's income times the months a year over 12. The owner's own bank loans' interest is left out for now (owner:
  later); taxes and sales are not counted.
- **How far:** to the last loan share's payoff, so every chart's months line up with the shares chart's; with no
  share to pay, `FORECAST_YEARS` (10). A sold object has none; its cash flow stays in the total as it ended.
- **The charts:** one checkbox "Ennuste" over all of them runs every line on faded from the as-of month, the combined
  chart's too: the cash flow summed on, still to recover falling by it (its percentage over the capital put in, which
  stays), what came back rising, and the shares (ADR-034). A month's box says "(arvio)". Off by default, remembered.
- **Cash flow against the repayment** (owner, 2026-11-23: "I am gaining if downpaid more than negative cash flow"):
  the rahoitusvastike's repayment part lowers the shares, so it is saved, not spent. The repayment sits on the cash
  flow's months (`MonthPoint.housing_principal_snt` from `repaidMonths`), and every figure sums those months: the cash
  flow by year table's summary rows "Yhtiölainojen lyhennykset" and "Kassavirta + lyhennykset" (a year as on Talous),
  its last 12 months (`Trailing12.principal_snt`, scaled like the cash flow; none for a sold object), a tile
  "Kassavirta + lyhennykset 12 kk", and a chart of the cumulative cash flow, the repayments summed (then the estimates'
  principal) and their sum, forecast included. A sold object's months run on to a bill paid after the sale, so the
  chart's cash flow meets the table's. Above 0 the owner gains before any change in the prices; the owner's own bank
  loans' repayment and a rahastoitu rahoitusvastike booked as capital are not counted.
- **The return a year on the money in** (owner, 2026-11-24): the table's last summary row and the tile give cash flow
  + repayment over the owner's money in the objects (`moneyIn`): each month what had not come back by the month's
  start and the capital put in during it - the earlier months' short cash flow is money put in too, the month's own
  result is not (it is what is measured). Each month weighs a twelfth (`YearCashFlow.money_in_snt`; the last 12 months'
  average in `Trailing12.money_in_snt`), so a year held in part gives a year's rate, the total column the average a
  year, and nothing counts after a sale. Without loans the row is the cash flow's alone. Price changes are not in it.
- **One figure per object** (owner, 2026-11-24): a switch above the table puts the cash flow, the repayment, the two
  together or the return in every object's cells (the return per object from its own `money_in_snt`); the summary rows
  stay, the one shown in bold. A year the as-of date ends inside says how many months it has, so a part year is not
  read as a whole one.
- **Later:** a payback month per object; a raise or other costs per object; the own bank loans; a forecast on the
  object's own page.
