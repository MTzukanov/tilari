# MEMORY - Tilari

Dated log of findings and decisions that are not obvious from the code. Newest first.
Agent guide: [AGENTS.md](AGENTS.md).

This repo is public: keep book contents (company names, amounts, counterparties) out of this file.

---

## 2026-10-07 - Reports like Kitsas on `fix/reports-like-kitsas` (stacked on `fix/vat-like-kitsas`)

- Chart reports (tase/tulos) follow `LaatijanTaseTulos::kirjoitaRaportti`: `S` = show even when
  empty plus its own ranges (before: the running sum, so balance-sheet totals counted assets two
  or three times), `=` cumulative and never reset, `+`/`-` anywhere in the formula, D/C types,
  no two subtotals in a row, accounts with a zero balance left out.
- `s`/`S` statement macros use opening balances like `/saldot?alkusaldot` (all earlier results
  in BE, no T row).
- Account ledger: P&L opening from the fiscal year of the start date and the running balance
  restarts at a fiscal-year boundary; no throw when the range ends outside the fiscal years.
- Overview: fiscal years ending in the same calendar year get distinct keys.
- Not changed: kohdennus usage count includes drafts/deleted lines - Kitsas counts the same way
  (and the FK blocks deleting a kohdennus any line uses).
- Checked on a copy of a real book (FY2024/FY2025): assets = liabilities = class sums; result =
  P&L sum = 2371.

## 2026-10-07 - VAT like Kitsas on `fix/vat-like-kitsas` (stacked on `fix/write-guards`)

- `computeVat` follows Kitsas `AlvLaskelma`: all VAT-coded posted lines of the period except VAT
  returns, sign per `debetistaKoodilla`, brutto correction (12/22), margin scheme (13/23, deficit
  carried in `json.alv.marginaalialijaama`), every box from code ranges (301-314, 318-320).
  Before, codes 13-16, 22, 24, 26, 27, 51 were ignored and brutto sales gave 301 = 0.
- VAT return settles like `kirjaaVerot`: 1xx on the BL account, 2xx on the AL account, net to BV
  (or `AlvMaksettava`/`AlvPalautettava` only with `AlvMaksutilinKautta`). Before, the net went to
  `AlvPalautettava`/`AlvMaksettava` - in a Kitsas yritys chart those are 1762/2922, so 1763 was
  never cleared. Json `alv.koodit`, `kausialkaa`, `kausipaattyy`, `erapvm`, `maksettava` written.
- Editor/statement VAT lines follow Kitsas `ApuriRivi` (`vatBooking`): reverse charge 24-27/29
  books tax + deduction on top of net (before: only a deduction, i.e. VAT deducted without the tax);
  brutto 12 books the gross without a 112 line (Kitsas computes it at the return); a refund deposit
  books VAT on the credit side (before: unbalanced).
- Cash-basis VAT requires `AlvVelvollinen` (Kitsas `onkoMaksuperusteinenAlv`).
- Checked on a copy of a real book against every Kitsas-made VAT return: boxes and settlement
  identical from 2024 on (cash-basis nollaus lines are added at return creation, as before).
  Not implemented: alarajahuojennus (boxes 315-317; abolished from 2025, only old annual returns).

## 2026-10-07 - Write guards on `fix/write-guards` (stacked on `fix/numbering`)

- VAT-filed lock implemented (AGENTS.md rule 12 claimed it before it existed). A VAT return can
  still be deleted to redo it, as on Kitsas' ALV page (`AlvSivu::poistaIlmoitus`); only the
  voucher editor blocks it in Kitsas. A VAT period that
  overlaps a filed one counts as filed (was exact start/end only).
- Line dates are checked against TilitPaatetty and the fiscal years, not only the voucher date.
- A stored sales invoice (210) can no longer be saved as another type.
- Statement row split moves the rows by id (eraid/Merkkaus intact), picks the voucher type like
  Kitsas (open item/balance sheet -> Siirto), lock-checks the statement, logs it in Tositeloki,
  and does not realize cash-basis VAT twice when the statement was already posted.
- Year-end vouchers (9910/9920/9930) cannot be booked twice for the same period end; depreciation
  lines no longer realize parked cash-basis VAT.
- Kohdennus save keeps other languages and keys in its json.
- Checked on a copy of a real book with OhitaAlvLukko off: note-only edits save on every posted
  voucher of the open year; deletes are refused where VAT lines are filed.

## 2026-10-07 - C2 fixed on `fix/numbering` (stacked on `fix/save-round-trip`)

- Drafts have number 0; posting numbers `MAX+1` per fiscal year + series over posted vouchers;
  NULL series written (legacy `''` counted as no series, so no duplicates with old saves);
  series for new vouchers like Kitsas; renumbering when a posted voucher moves to another fiscal
  year or series (our earlier note claimed the opposite; corrected here and in hki KITSAS_DB.md).
- `postVoucher` gives a draft a fresh number (numbers on old tilari drafts are not trusted).
- Posting needs a fiscal year for the date (Kitsas `EIAVOINTAKUTTA`).
- Editor: neighbours and "go to number" use the fiscal year; `doc_number` is sent only when the
  number was changed by hand.
- Checked on a copy of a real book: a draft keeps 0, posting gives MAX+1 of the year, series NULL.

## 2026-10-07 - C1 fixed on `fix/save-round-trip`

- `saveVoucher` upserts lines by Vienti id (Kitsas `lisaaTaiPaivita`); omitted fields keep the
  stored value; unchanged saves write nothing; `postVoucher` posts a draft without rewriting
  lines; `Ledger.mutate` runs in a SAVEPOINT (rollback on error) and writes are serialized.
- Editor: drafts carry id/type/date/eraid/json/partner (`modules/vouchers/editorLines.ts`); the
  assistant rebuilds lines only after assistant edits and reuses line ids (and eraid); vouchers
  it cannot rebuild exactly (line dates != voucher date, VAT rounding != per-row rounding, no
  single payment line, lines on the wrong side) are edited on "Viennit" only. An unchanged draft
  can be posted (Kitsas).
- Statement: loaded rows are saved as stored until edited; loaded rows are hidden only by archive
  id (date+amount only for rows imported in the session, Kitsas `tuotu`) - before this a row with
  the same date and amount as another voucher's bank line was dropped on save. Rebuilt rows use
  Kitsas line types and keep their line ids, stored class, eraid and partner id.
- Posted vouchers without lines can be re-saved (Kitsas allows them; e.g. a tiliote whose rows all
  became own vouchers).
- Checked on a copy of a real book: every writable posted voucher and every tiliote round-trips
  unchanged through the API, editor and statement paths. About three quarters of its
  purchase/sales vouchers fit the assistant; the rest open on "Viennit".

## 2026-10-06 - Save round-trip and numbering defects (both fixed 2026-10-07, see above)

Found while reconciling a production book that had been edited in tilari (around 2026-09-01) after
`holvi-kitsas-import` had imported bank rows. Re-checked on main `161baaf`: both still present.

### C1. Saving a purchase/sales voucher drops bank-import fields

Observed: a purchase voucher (tyyppi 100, imported from a bank statement) was opened and saved in
tilari. Afterwards `Vienti.arkistotunnus` was NULL, `Vienti.tyyppi` was 0 on both lines, and the
line dates had changed. The bank importer uses `arkistotunnus` as its idempotency key, so a
re-import would book the transaction a second time.

Evidence that tilari wrote it: the voucher's last `Tositeloki` row has `userid 0` and
`{"toiminto":"tallenna"}` (tilari's `appendLoki`); Kitsas desktop writes `userid NULL` + full JSON.

Cause (`frontend/src/modules/vouchers/ui/VoucherEditor.tsx`):
- `linesFromAssistant()` rebuilds the payment line from `EMPTY_LINE` -> `archive_id` lost.
- The save mapping builds entries without `entry_type` or `date` -> `posting.ts` writes
  `tyyppi 0` and the voucher date.

Fix direction: carry loaded per-line fields (`archive_id`, `entry_type`, `date`, `json`, `eraid`)
through assistant, transfer and generic layouts; an unchanged save writes nothing. Regression test:
load an imported purchase voucher, save unchanged, compare `Vienti` rows (except ids).

### C2. Voucher numbering differs from Kitsas

`posting.ts` `nextDocNumber` / `saveVoucher`:
1. A number is assigned on every save, drafts included. Kitsas numbers only at `tila >= 100`.
2. `MAX` is per calendar year (`strftime('%Y')`) and counts drafts and deleted vouchers.
   Kitsas: fiscal year (`Tilikausi`), `tila >= 100`.
3. `sarja` is written as `''`. Kitsas computes the next number with `sarja IS NULL`, so it does not
   see tilari's vouchers -> **duplicate numbers possible** (seen: two tilari-saved vouchers were the
   only `sarja ''` rows; one carried a number above Kitsas's own MAX).
4. Kitsas series settings (`erisarjaan`, `kateissarjaan`, `tositesarjat`) are ignored.

Fix direction: number on posting only; fiscal year + `tila >= 100` + series chosen like Kitsas
`TositeTyyppiModel::sarja`; write NULL for no series and treat existing `''` as NULL; keep the
number when the date moves fiscal year (kitsas `5ae038d1`). Tests: draft = 0, posted MAX+1 over
posted only, NULL vs `''`, `erisarjaan` ON, a fiscal year that is not a calendar year.

### Context for agents
- Bank-file import is out of scope here; `holvi-kitsas-import` (sibling project) creates draft
  vouchers that are reviewed and posted in tilari. Until C1 and C2 are fixed, do not post or edit
  imported vouchers in tilari on a production book.
