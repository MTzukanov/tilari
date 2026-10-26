# Data model

Authoritative schema: [kitupiikki `luo.sql`](https://github.com/artoh/kitupiikki)
(`KpVersio` **24**). This file records **how we use it**, not a second schema.

Money is **integer cents**. See [DECISIONS.md](DECISIONS.md) ADR-002.

## Tables we read and write

| Table | Role | Notes |
|-------|------|-------|
| `Asetus` | Key/value | `Nimi`, `Ytunnus`, `KpVersio`, `TilitPaatetty`, `Harjoitus` (ON/EI), ALV keys, report JSON |
| `Tili` | Chart of accounts | Name in `json_extract(json, '$.nimi.fi')` |
| `Tilikausi` | Fiscal years | First year may start mid-month; closing state in `json` |
| `Tosite` | Voucher header | `tila`, `tyyppi`, `tunniste`, `sarja`, `json` |
| `Vienti` | Journal lines | `debetsnt` / `kreditsnt`, `alvkoodi`, `eraid`, `kohdennus`, `tyyppi`, `jaksoalkaa` / `jaksoloppuu` |
| `Kohdennus` | Cost centres / projects | id `0` = general (unallocated); `tyyppi` 0–3 |
| `Kumppani` | Counterparties | Header + per-line FK |
| `Liite` | Attachments | `sha` hex SHA-256; working copy keeps `data` null (ADR-015); classic export fills `data` |
| `Tositeloki` | Audit | Append on every write |

`Asetus.Harjoitus` is the Kitsas practice-accounting flag (`ON` / `EI`, or any
truthy value except empty / `0` / `EI`). The simulated “today” used in practice
mode is **session-only** and is never written to the file.

## Tilari's own table

`TilariData` (ADR-023) - created on the first write, absent in a fresh Kitsas book.

| Column | Meaning |
|--------|---------|
| `key` | `property/{kohdennusId}` (one rental object) or `portfolio` (defaults) |
| `value` | JSON document, keys sorted |
| `updated` | ISO timestamp of the last write |

`property/{id}` - a rental object is a cost centre (`Kohdennus` tyyppi 1) and its projects.
Money in integer cents (`*_snt`), percentages in basis points (`*_bp`, 100 = 1 %):

| Key | Meaning |
|-----|---------|
| `v`, `rev`, `updated_at` | Format version (1), save counter, last save |
| `excluded` | The cost centre is not a rental object |
| `kind` | `apartment` / `parking` / `garage` / `commercial` / `storage` / `other` |
| `eras[]` | `{ eraid, account }` - balance-sheet items holding the acquisition cost (root `Vienti.id`) |
| `manual_capital[]` | `{ date, amount_snt, note? }` - capital not on a linked item |
| `sale_voucher_ids[]` | Vouchers whose lines on the object belong to a sale. No UI yet: stored, checked and counted, but no screen sets it (MEMORY 2026-10-10) |
| `doc_voucher_ids[]` | Document vouchers (usually type 800 Liitetieto) |
| `created_voucher_ids[]` | Document vouchers created from this object's forms (an uploaded contract or notice, a written increase notice): the form can delete them again. Ids whose voucher is gone are dropped on save |
| `financing` | `{ loan_accounts[], interest_accounts[] }` - interest on vouchers touching the loan; a loan account belongs to one object (`loan_linked` on save, `loan_shared` warning for older files) |
| `valuations[]` | `{ date, price_snt, debt_free_price_snt?, source? }` - owner's price estimate |
| `sale_costs` | `{ pct_bp, fixed_snt }` - overrides `portfolio.sale_costs` |
| `target_return_bp`, `note` | Target annual return; free text |
| `leases[]` | Rental relationships, oldest start first (below) |
| `water_settlements[]` | The housing company's water settlements, oldest period first (below) |

`leases[]` - one per tenancy; unknown keys of a lease are kept like the document's own:

| Key | Meaning |
|-----|---------|
| `key` | Stable within the document (`l1`, `l2`...); given on save when missing |
| `tenant_partner_id` / `tenant_name` | The tenant as a Kitsas partner (`Kumppani.id`), or a name when they are not one yet |
| `starts`, `ends?` | Start; a fixed term's end or the move-out |
| `due_day?` | Rent due day (the form starts at 5) |
| `rents[]` | `{ from, rent_snt, water_snt?, parking_snt?, voucher_id? }`: what the tenant pays a month from `from` on. The first is the starting rent (from `starts`); each later one is an increase (korotus) with its increase notice voucher |
| `exceptions[]?` | `{ from, to, rent_snt, water_snt?, parking_snt?, note?, voucher_id? }`: an agreed exception (poikkeava vuokra) - a discount, a rent-free stretch, a temporary rent. On its days its amounts stand for the steps'; the steps stay. Within the lease, never overlapping; `note` is the owner's reason, `voucher_id` the agreement (ADR-027) |
| `increase?` | The contract's increase clause `{ kind: none / percent / amount / index, pct_bp?, amount_snt?, month? }`: prefills the next increase and drives reminders; Tilari never changes rent by itself |
| `doc_voucher_id?` | The contract (a type-800 voucher) |
| `water?` | `flat` when water is a flat fee that is never settled; missing means an advance settled against use (ADR-025) |

Saving checks that the partner exists and the vouchers are posted, and adds the lease's vouchers
to `doc_voucher_ids`. The documents stay Kitsas vouchers, found in Kitsas by title and partner. An
increase notice written in Tilari is a posted type-800 voucher titled after the object, with the
tenant as partner and the letter as a PDF attachment (`modules/properties/ui/increaseNotice.ts`).

`water_settlements[]` - one per housing-company settlement period (ADR-025); unknown keys are kept:

| Key | Meaning |
|-----|---------|
| `key` | Stable within the document (`w1`, `w2`...); given on save when missing |
| `from`, `to` | The period on the company's statement |
| `difference_snt` | The company's result: + the owner pays more, - a refund |
| `usage_snt?` | The apartment's actual water cost for the period, when the statement gives it |
| `voucher_id?` | The company's statement (a type-800 voucher) |
| `shares[]?` | `{ lease_key, balance_snt?, voucher_id? }`: a tenant's own amount (+ the tenant pays, - refunded) instead of the computed one, and the letter sent. Only shares that carry something are stored |

Each lease in the period whose water is an advance has a share: the use by its days less its
advances, or without the use the difference by days. Saving checks that `lease_key` names a lease
and the vouchers are posted, and adds the statement and letters to `doc_voucher_ids`. A letter
written in Tilari is a posted type-800 voucher titled after the object and the period, with the
tenant as partner and the letter as a PDF (`modules/properties/ui/waterLetter.ts`).

`portfolio`: `v`, `rev`, `sale_costs`, `target_return_bp`, `dismissed[]` (setup suggestions
the owner rejected: `era:{eraid}`, `doc:{voucherId}`).

## Tables we leave alone (v1)

`Budjetti`, `Tuote`, `Rivi`, `Vakioviite`, `Ryhma`, `KumppaniRyhmassa`,
`Merkkaus` (read if present; no editor), `KumppaniIban` (read).

## Documented JSON fields

### `Tosite.json`

- Bank statement: `{ "tiliote": { "alkupvm", "loppupvm", "tili" } }` (start date, end date, account)
- Split from a bank statement: `{ "tilioterivi": <int> }`
- VAT declaration: `{ "alv": { ... } }` (we store our summary; unknown keys preserved)

### `Tili.json` / `Kohdennus.json`

- `nimi.fi` (and optionally `sv` / `en`)
- Kohdennus: `alkaa`, `paattyy` (ISO dates)
- Depreciable accounts: `menojaannospoisto` (percent), `poistotili`

### `Vienti.json`

- `jaksotustili` — the account a year-end accrual belongs to
- `tasaerapoisto` — straight-line depreciation months for the era

### `Tilikausi.json`

- `henkilosto` — average headcount, shown in the notes
- `tilinpaatos` — timestamp of the last notes save
- `vahvistettu` — confirmation date
- `verolaskelma` — Tilari's stored tax calculation in cents ([STATEMENT.md](STATEMENT.md))

Everything else is round-tripped as-is.

## Voucher types we care about

| Code | Name | v1 |
|------|------|----|
| 0 | Other | write |
| 90 | Import | read |
| 100 | Expense | write |
| 200 | Income | write |
| 210 | Sales invoice | **read-only** (Billing) |
| 300 | Transfer | write |
| 400 | Bank statement | write |
| 500 | Payroll | read |
| 800 | Notes voucher | write (no lines) |
| 9010 | Opening balances | read; balance rule waived |
| 9100 | VAT return | write (generated) |
| 9910 / 9920 / 9930 | Depreciation / accrual / income tax | write (generated by the closing wizard) |

## `Tosite.tila` (voucher status)

| Value | Meaning |
|-------|---------|
| 0 | Deleted |
| < 50 | Template |
| 50–99 | Draft |
| >= 100 | Posted |

## VAT codes in scope

From Kitsas `AlvKoodi` as used in a typical Finnish cash-basis book:

| Code | Meaning |
|------|---------|
| 0 | No VAT |
| 11 / 111 | Domestic sales net + tax posting |
| 21 / 221 | Domestic purchase net + deduction |
| 18 / 118 / 418 | Cash-basis sales + tax + parked |
| 28 / 228 / 428 | Cash-basis purchase + deduction + parked |
| 12 / 112 | Gross sales (rare) |
| 19 | Zero-rated sales |
| 25 / 125 / 225 | Intra-community purchase of services |
| 29 / 129 / 229 | Service purchase outside the EU |
| 901 | VAT settlement (declaration lines) |

Rates in the editor percent box (Kitsas `alvProssa`): 25.5%, 24%, 14%, 13.5%, 10%. Other EU special cases are out until asked.
Behaviour (periods, boxes, cash-basis, HTML attachment): [VAT.md](VAT.md).

## Invariants (enforced on write)

See ADR-003. Reports filter `Tosite.tila >= 100`. P&L vs balance sheet:
`CAST(tili AS text) < '3'` vs `>= '3'`. Asset sign: tyyppi starts with `A`
or number starts with `1` → debit − credit; else credit − debit.
