# VAT

Source of truth for what Tilari implements for Finnish VAT versus Kitsas.
Cross-links: [SCOPE.md](SCOPE.md), [DATA_MODEL.md](DATA_MODEL.md).

Finnish tax-form wording stays in the generated HTML (that is the filing
document). This page uses English.

## Supported in this version

### Periods and settings

- Tax period from `AlvKausi` (**1** = month, **3** = quarter, **12** = year), **not** the browse/report view period (month / financial year / all).
- Settings UI: `AlvKausi`, `AlvAlkaa`, `MaksuAlvAlkaa`, `MaksuAlvLoppuu`.
- VAT page shows a tax-period stepper (‹ ›, reuses `PeriodStepper`) starting at the **next open period**, due date, and prior filings; summary refreshes when browsing.
- “Create VAT return” is enabled only for the next open unfiled period.
- Duplicate filings for the same start/end are rejected.

### Calculation

- Payable tax uses **realized** codes only. Parked cash-basis **`418` / `428`** appear in the itemization / parked totals and **do not** enter VAT payable.
- Codes covered (as used in MICT-style cash-basis books):

| Codes | Meaning |
|-------|---------|
| 0 | No VAT |
| 11 / 111 | Domestic sales net + tax |
| 21 / 221 | Domestic purchase net + deduction |
| 18 / 118 / 418 | Cash-basis sales + realized / parked |
| 28 / 228 / 428 | Cash-basis purchase + realized / parked |
| 29 / 129 / 229 | Service purchases outside the EU |
| 19 | Zero-rated sales (box 309) |
| 12 / 112 | Gross sales |
| 25 / 125 / 225 | Intra-community purchase of services |
| 901 | VAT settlement / clear |

- Official-style boxes in the summary and HTML (non-zero only): at least **301, 306, 307, 308, 309, 314**. Other 301–320 labels exist in the HTML builder when amounts appear.
- Rate mapping for 301: 24 % and 25,5 %; 302: 13,5 % / 14 %; 303: 10 % (Kitsas post-2024 / 2026 reform).
- Editor: ALV **type** and **percent** are separate controls (Kitsas `alvCombo` + `alvProssa`). Percent list is always 25,50 / 24,00 / 14,00 / 13,50 / 10,00 %.
- When `AlvVelvollinen` is off (`EI`), the editor hides ALV controls, browse hides the VAT column, and the VAT nav item is hidden.

### Declaration voucher

- Type **9100** with simple settlement to `AlvMaksettava` / `AlvPalautettava` / `AlvVelkatili` (no tax-liability radio trio).
- HTML attachment **`alv.html`** (role `alv`): box table + line itemization with human-readable VAT code titles. Not PDF.
- Soft-delete of type-`9100` (and other writable) vouchers from the voucher view so a VAT filing can be undone and recreated.
- **Create VAT return** opens a Kitsas-style preview dialog (calculation HTML) with **Print / Cancel / OK**; booking happens only on OK.

### Cash-basis lifecycle

- Booking codes **18/28** post parked VAT to BLM/ALM (`29391` / `17631`) as **418/428** with a new `eraid`.
- **Payment** against an AR/AP `eraid` injects `418→118` / `428→228` (payment date).
- **12-month force** on return creation: open sales parked eras with era date ≤ period end − 1 year are realized on the VAT voucher.
- When `MaksuAlvLoppuu` equals the period start, **all** remaining parked eras (sales + purchases) are forced.
- **Credit** helper `creditCashBasisLines`: clear the **same** open `418` era, or reverse already-declared **`118`** — never open a fresh `418` after force-realization ([Kitsas #1427](https://github.com/artoh/kitupiikki/issues/1427)).
- Voucher updates **preserve `eraid`** when `item_id` is omitted (avoid NULL wipe).

## Left for later

- Electronic filing (Ilmoitin.fi / Vero API / OmaVero submit).
- Official Tax Authority period fetch (`AlvKaudet` / VATMON|VATQTR|VATANN).
- Settlement booking radios (always tax payable / split / payable–refundable accounts).
- Document lock after filing (`OhitaAlvLukko` enforcement in Tilari).
- Small-business VAT relief (boxes 315–317; ended for periods from 2025).
- Unused VAT kinds: intra-community sales (14/15), goods intra-community acquisition (24), import of goods (27), construction services (16/26), margin scheme (13/23), advance invoice (51).
- Dedicated credit-invoice UI (helper exists; full billing still out of [SCOPE.md](SCOPE.md)).
- PDF attachment (HTML only).
- Payment reminders and other Kitsas limits under cash-basis VAT.
- Era-id data-repair tools for Kitsas-corrupted books.

## Key code

| Area | Path |
|------|------|
| Calc / create / HTML | `frontend/src/book/modules/vat/domain/vat.ts` |
| Periods / due date | `frontend/src/book/modules/vat/domain/vatPeriod.ts` |
| Cash-basis / credit / payment | `frontend/src/book/modules/vat/domain/vatCashBasis.ts` |
| VAT UI | `frontend/src/modules/vat/ui/VatView.tsx` |
| Settings | `frontend/src/modules/settings/ui/SettingsView.tsx` |
| Tests | `frontend/src/book/modules/vat/domain/vat.test.ts` |
