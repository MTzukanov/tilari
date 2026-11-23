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
| `key` | `property/{kohdennusId}` (one rental object), `portfolio` (defaults) or `company` (company documents) |
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
| `leases[]` | Rental relationships, oldest start first, never sharing a day (below) |
| `rent_from` | The owner's first day of rent when the sale agreed otherwise; missing: the first whole month after the purchase (ADR-026) |
| `rent_until` | The owner's last day of rent when the sale agreed otherwise; missing: the end of the month of the sale, or none while held (ADR-026) |
| `water_settlements[]` | The housing company's water settlements, oldest period first, never sharing a day (below) |
| `housing_loans[]` | The object's share of the housing company's loans, oldest start first (below, ADR-034) |
| `housing_doc_voucher_ids[]` | The housing company's documents on the Taloyhtiö tab (certificates, meeting minutes, notices); also in `doc_voucher_ids` |

`leases[]` - one per tenancy; unknown keys of a lease are kept like the document's own:

| Key | Meaning |
|-----|---------|
| `key` | Stable within the document (`l1`, `l2`...); given on save when missing |
| `tenant_partner_id` / `tenant_name` | The tenant as a Kitsas partner (`Kumppani.id`), or a name when they are not one yet |
| `starts`, `ends?` | Start; a fixed term's end or the move-out |
| `due_day?` | Rent due day (the form starts at 5) |
| `rents[]` | `{ from, rent_snt, water_snt?, parking_snt?, voucher_id?, no_document? }`: what the tenant pays a month from `from` on. The first is the starting rent (from `starts`); each later one is an increase (korotus) with its increase notice voucher, or `no_document: true` when the owner says there is none (ADR-030) |
| `exceptions[]?` | `{ from, to, rent_snt, water_snt?, parking_snt?, note?, voucher_id?, no_document? }`: an agreed exception (poikkeava vuokra) - a discount, a rent-free stretch, a temporary rent. On its days its amounts stand for the steps'; the steps stay. Within the lease, never overlapping; `note` is the owner's reason, `voucher_id` the agreement (ADR-027), `no_document: true` the owner's word that there is none (ADR-030) |
| `increase?` | The contract's increase clause `{ kind: none / percent / amount / index, pct_bp?, amount_snt?, month? }`: prefills the next increase and drives reminders; Tilari never changes rent by itself |
| `doc_voucher_id?` | The contract (a type-800 voucher) |
| `water?` | `flat` when water is a flat fee that is never settled; missing means an advance settled against use (ADR-025) |
| `deposit?` | `{ eraids?, line_ids? }`: the rent deposit (vuokravakuus) as booked on a liability account - its items (tase-erät, by root line id) and lines booked without an item (ADR-029) |

Saving checks that the partner exists, the vouchers are posted and no two leases share a day
(`overlap`), and adds the lease's vouchers to `doc_voucher_ids`. A deposit must be an item root or
a line without an item, posted, on a liability account, and belong to one lease only across every
object (`deposit_linked`). The documents stay Kitsas vouchers, found in Kitsas by title and partner. An
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
| `no_document?` | `true`: the owner says there is no statement, so none is asked for (ADR-030); never stored beside `voucher_id` |
| `shares[]?` | `{ lease_key, balance_snt?, voucher_id? }`: a tenant's own amount (+ the tenant pays, - refunded) instead of the computed one, and the letter sent. Only shares that carry something are stored |

Each lease in the period whose water is an advance has a share: the use by its days less its
advances, or without the use the difference by days. Saving checks that `lease_key` names a lease,
the vouchers are posted and no two periods share a day (`overlap`), and adds the statement and letters to `doc_voucher_ids`. A letter
written in Tilari is a posted type-800 voucher titled after the object and the period, with the
tenant as partner and the letter as a PDF (`modules/properties/ui/waterLetter.ts`).

`housing_loans[]` - one per housing-company loan the object has a share of (yhtiölaina, ADR-034), entered by
hand; unknown keys are kept. Rates are in 1/1000 % (`*_pcm`, 1000 = 1 %): Euribor has three decimals and can be
negative.

| Key | Meaning |
|-----|---------|
| `key` | Stable within the document (`h1`, `h2`...); given on save when missing |
| `group?` | Shared by copies of one company loan on objects of the same housing company: a copy takes the original's group, or `o{objectId}-{key}` of the original |
| `name` | What the loan is for ("Putkiremontti 2019") |
| `lender?`, `total_snt?` | The bank, and the company's whole loan, for information |
| `starts?`, `ends?` | Drawn (missing: the loan counts from the object's purchase; a share dated before it means drawn by then); the last due date in the terms |
| `type` | `annuity` (annuiteetti), `equal_principal` (tasalyhennys) or `fixed_payment` (kiinteä tasaerä: the payment stays, the term moves) |
| `reference`, `margin_pcm` | The reference rate (`euribor_12m`, `euribor_6m`, `euribor_3m`, `prime`, `fixed`, `other`) and the margin |
| `reset_months?` | How often the reference rate is reset |
| `rates[]?` | `{ from, reference_pcm, voucher_id? }`: the actual reference rate from `from` on, by hand; no two on one day. None: the share is counted on the portfolio's estimate (`forecast`, ADR-035; a fixed rate needs a row) |
| `grace[]?` | `{ from, to }`: periods with no repayment (lyhennysvapaa), not overlapping |
| `rate_limits[]?` | `{ from?, to, floor_pcm?, ceiling_pcm? }`: a floor (korkolattia) and/or a ceiling (korkokatto) on the reference rate, from `from` (missing: the loan's start) to `to`; at least one of the two, the floor not above the ceiling, not overlapping |
| `certificates[]?` | `{ date, share_snt, voucher_id?, no_document? }`: the object's share (velkaosuus) on `date` from an isännöitsijäntodistus or the purchase deed; no two on one day |
| `charges[]?` | `{ from, amount_snt, rahastoitu?, voucher_id?, no_document? }`: this loan's rahoitusvastike a month from `from` on, with the invoice or notice; `rahastoitu: true` when the company puts it into its equity instead of its income (tuloutettu, the default); no two on one day |
| `events[]?` | `{ date, kind, amount_snt?, voucher_id?, note? }`: `paid_off` (the share paid off), `extra_payment` (with an amount), `terms`, `note` |

Saving checks that every voucher a loan links is posted, and adds them to `doc_voucher_ids`. A certificate
or rahoitusvastike notice uploaded on a loan card is a posted type-800 voucher titled after the object
(`modules/properties/ui/LoanCardEdit.tsx`); so is a document uploaded on the Taloyhtiö tab, which goes to
`housing_doc_voucher_ids`.

`portfolio`: `v`, `rev`, `sale_costs`, `target_return_bp`, `dismissed[]` (setup suggestions
the owner rejected: `era:{eraid}`, `doc:{voucherId}`), `forecast?` (ADR-035: `euribor_12m_pcm?`,
`euribor_6m_pcm?`, `raise_bp?`, `other_costs_months_x100?`, each one number for the whole period, an empty one
taking its default; the loans' forecasts take a Euribor's at each rate reset, and a loan with no rate row is counted
on it). A book from before stores `rate_forecast[]` (`{ reference, from, reference_pcm }`, ADR-034); it reads as its
newest row per Euribor and is dropped on the next save.

`company` (ADR-031): `v`, `rev`, `updated_at`; `settings` (`audited`, `annual_report`, `balance_sheet_specs`, `prh_receipt`, only when on);
`documents[]`, one link each: `key` (stable, `d12`), `kind`, `period_ends` (`Tilikausi.loppuu`, null
for the company's own), `voucher_id`, `attachment_id` (one file of a voucher with several),
`doc_date` (the document's own date when the voucher's differs), `note`, `calculation` (`true` only: a
calculation kept with the slot's document, such as the tax return's, which does not fill the slot); `not_needed[]`
(`period_ends`, `kind`: a slot marked as needing no document); `dismissed[]` (rejected suggestions:
`{voucherId}:{attachmentId}:{kind}`); `shareholders[]`: `key` (`s3`), `partner_id` (`Kumppani.id`; the
name stays there, no personal ID numbers), `kind` (`person`, `estate`, `company`), `resident`, `rate_bp`
(withholding in basis points when Vero's rule does not apply), `holdings[]` (`from`, `shares`; the latest
on or before a day counts). A link may name a draft (a dividend decision with its meeting's minutes, ADR-031).
Writes refuse a deleted or missing voucher, a file of another voucher, and a period that does not exist; a shareholder sent with a new name gets its `Kumppani` row.
Links are read fresh: a voucher deleted later shows as missing. Nothing computed is stored; deadlines come
from the period's end, and a dividend's recipients from the holdings on its decision day.

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
