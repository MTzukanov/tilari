# Scope

What Tilari does today, what it does not, and what it adds on top of desktop
Kitsas. Feature work follows this file.

Request a missing Kitsas feature or a new Tilari idea in
[GitHub Discussions](https://github.com/MTzukanov/tilari/discussions).

Official [WebKitsas](https://kitsas.fi/docs/) is a limited *cloud* viewer.
Tilari is a **local-first** (then self-hosted) read-write app on the same
`.kitsas` SQLite format.

## Tested on

The author built Tilari for **his own books**: a Finnish limited company with relatively few vouchers (typical for freelancers). Large ledgers, associations, housing companies, sole traders, and other VAT setups have not been a daily test bed. Files should still open; behaviour there is untested.

## What Tilari adds (not in desktop Kitsas)

On start, Tilari can create a new Finnish business-chart book in the browser. Desktop Kitsas remains the reference for what Tilari has not copied yet (other entity types, chart editor, archive). Tilari adds:

- Browser app: one HTML file, a local server, or a self-hosted locker
- Time navigation (Month / financial year / all, prev/next) on reports and ledgers
- Click-through reports: balance sheet → account ledger → voucher, plus an overview with monthly bars (turnover, profit, tax paid)
- Running **balance** on the account ledger
- In-session **change log**
- Fully working in the browser (OPFS working copy; Chromium can save in place)
- Optional locker: **your Supabase** bucket (encrypted in the tab), or a **self-hosted VPS** (Node HTTP store)
- Use it as a normal web app (each action is a request), or work locally in the tab and save when you choose
- Linux / Windows / macOS packs without a Qt toolchain

## Status

| Area | Status | Notes |
|------|--------|-------|
| Open an existing `.kitsas` | In | File picker, last path, locker |
| Create a **new** empty book | In | On start. Business chart (`yritys`) only: name, Y-tunnus, first fiscal year, VAT, practice. Unsaved OPFS copy until Save. Associations / housing companies still start in desktop Kitsas |
| Expense / income / transfer / other | In | Types 100, 200, 300, 0 |
| Notes voucher (type 800) | In | Header + files, no lines |
| Bank statement (type 400) | Partial | Kitsas-style bank-centric table (white own rows + green other-voucher rows), balance strip, split to own voucher. No bank-file import; Kirjaa dialog later |
| Attachments | Partial | Upload and preview (PDF, JPEG, text). No OCR / parse, no auto-shrink |
| Browse / journal | In | Filters, entries table |
| Balance sheet / P&L / general ledger | In | Period navigation, click-through |
| Overview charts | In | Tilari addition |
| Balance-sheet itemization | Partial | `eraid` grouping is there; not a full Kitsas itemization tool |
| VAT | Partial | Periods and cash-basis codes used in the author’s books; HTML declaration. No OmaVero submit. See [VAT.md](VAT.md) |
| Fiscal statement (tilinpäätös) | In | Dashboard and ten-step closing. See [STATEMENT.md](STATEMENT.md) |
| Chart of accounts | Not yet | Accounts are read from the file and used when booking; no editor |
| Archive | Not yet | Kitsas stores the archive path outside the SQLite file |
| Partners | Partial | Create-on-the-fly when booking; no full partner register |
| Allocations | In | List, P&L, lines; add in settings |
| Company settings | Partial | Name, business id, city, VAT period, practice flag. Not a full Kitsas settings dialog |
| Billing | Not yet | Type 210 is read-only |
| Approval workflow | Not yet | Stub only (`#/workflow`, API 501) |
| Payroll / budget | Not yet | |
| UI translations | In | `fi` / `sv` / `en` / `de`. First visit asks; choice in `tilari.locale` |

Must keep working where already implemented: VAT periods (`AlvKausi` 1/3/12),
cash-basis VAT (18/118/418, 28/228/428), property allocations, `eraid`, period
lock, mid-month first fiscal year.

## Out until a later ADR

| Module | Why |
|--------|-----|
| **Billing** | Sales invoices / credit notes / reminders, products, apartments-as-invoicing, e-invoices/Maventa |
| **Approval workflow** | Tasks, approval, invoice portal |
| Payroll | Not in the author’s books |
| Budget / standing reference / groups | Empty in the sample book |
| Official Kitsas cloud API | Different product |
| Authelia / Tailscale / production SaaS | ADR-006 |
| Kitupiikki migration wizard | Desktop already did this |

UI shows Billing as “not in this version” (nav → `#/billing`). Approval workflow has no
nav entry; `#/workflow` and `/api/workflow` remain deferred stubs.

## Room to add later

- Empty routers under `/api/billing` and `/api/workflow` return 501
  with `{ "code": "not_in_version", "see": "docs/SCOPE.md" }`.
- Billing nav stub so IA does not need a redesign when billing ships.
  Approval workflow stays API/`#/workflow` only until needed.
- Billing tables (`Tuote`, `Rivi`) are never dropped from the SQLite file.
