# Fiscal years and financial statements

Source of truth for what Tilari implements for the fiscal year dashboard and
the year-end closing versus Kitsas.
Cross-links: [SCOPE.md](SCOPE.md), [COMPATIBILITY.md](COMPATIBILITY.md),
[DATA_MODEL.md](DATA_MODEL.md).

Finnish UI labels (the filled catalog is still Finnish) are in
`<abbr title="…">` tooltips. Kitsas schema keys stay in code font.

## Fiscal years dashboard

Route `#/fiscal-periods`. One row per `Tilikausi` (fiscal year), with the same
columns Kitsas shows:

| Column | Source |
|--------|--------|
| <abbr title="Tilikausi">Financial year</abbr> | `alkaa – loppuu`; padlock when `Asetus.TilitPaatetty >= loppuu` |
| <abbr title="Tase">Balance sheet</abbr> | Balance sheet total at period end (accounts `< 2`) |
| <abbr title="Liikevaihto">Turnover</abbr> | Accounts of type `CL` / `CLZ` inside the period |
| <abbr title="Yli-/alijäämä">Surplus / deficit</abbr> | P&L accounts (`>= 3`) inside the period |
| <abbr title="Tilinpäätös">Statements</abbr> | Confirmed / in progress / due, from `Tilikausi.json` |

A row also flags a balance-sheet mismatch when the debit and credit sums up to
the period end differ. The toolbar adds a period, edits the selected one (dates
and average headcount), or opens the closing wizard.

## Closing wizard

Ten steps in three sections, matching the Kitsas checklist. Step completion is
derived from the book — a posted voucher, the lock date, or a `Tilikausi.json`
field — so there is no separate progress state to keep in sync.

**Preparatory steps**

1. Post every voucher that belongs to the year (manual)
2. Book depreciation → voucher type **9910**
3. Book year-end accruals → voucher type **9920** (plus opening voucher)
4. Review the balance sheet and income statement (manual)
5. Review the balance-sheet itemization (manual)
6. Compute and book income tax → voucher type **9930**

**Preparing the statements**

7. Lock the books — sets `Asetus.TilitPaatetty` to the period end
8. Draft the notes to the accounts — wizard, generator and editor
9. Print the statements — print-ready HTML in a new tab

**Confirmation**

10. Confirm the statements — writes `Tilikausi.json.vahvistettu`

## Calculations

### Depreciation (9910)

- **Declining-balance** (`APM`): rate from `Tili.json.menojaannospoisto`
  (percent of the balance at period end)
- **Straight-line** (`APT`): one era (`Vienti.eraid`) at a time,
  `Vienti.json.tasaerapoisto` months. Elapsed months count the acquisition month
  unless the era came from the opening voucher.
- Each proposal books a credit on the asset account (`Vienti.tyyppi` 99102) and
  a debit on `Tili.json.poistotili` (99100). The expense line carries the period
  as its accrual window and `json.jaksotustili` pointing back at the asset.
- Attachment `poistolaskelma.html`.

### Accruals (9920)

Lines carrying `Vienti.jaksoalkaa` are split across the year end by day count,
ported from `laskeJaksotus` in Kitsas:

- An entry dated **within** the period defers the part after year end (credit)
- An entry dated **after** the period accrues the part before year end (debit)
- Counter-entries go to the `BJ` accruals (liability) or `AJ` prepayments
  (asset) account

A negative VAT liability (`BV` in debit) is reclassified to the `AV` receivable
in the same voucher.

The closing voucher is mirrored by an **opening voucher** on the first day of
the next period with the sides swapped, so the accrual unwinds automatically.
Accrual windows that still run past the next year end are carried on that
voucher. If no next period exists, only the closing voucher is written.

### Income tax (9930)

Pre-filled from account types: `C`/`CL` income, `D`/`DP` fully deductible,
`DH` half deductible, `DVE` prepaid tax. The chain matches Kitsas:

```
result      = income − full deduction − half deduction / 2
final       = result − prior loss
tax         = final > 0 ? final × 20 % : 0
unpaid      = tax − prepayments
```

Prior loss and the final tax amount are editable. The voucher debits
`Tuloverojaksotustili` (default 9940) against `Tuloverosiirtovelat` (2968) or
`Tuloverosiirtosaamiset` (1813), and carries `verolaskelma.html`. When
prepayments already cover the tax, no voucher is written and only the
calculation is stored.

**Difference from Kitsas:** the full breakdown is persisted in
`Tilikausi.json.verolaskelma` in cents, shown again when the dialog reopens, and
injected into the notes through the `@verolaskelma@` marker. Kitsas only
attaches a PDF.

## Notes to the accounts

The template lives in `Asetus.tppohja/fi`; Tilari seeds a Finnish limited-company
template when the book has none. The generator supports the subset of the Kitsas
DSL that the shipped template needs:

- `#tag [-M|-P|-I] Title` — optional section, hidden for the listed PMA sizes
- `#MIKRO` / `#PIEN` / `#ISO` — size-specific blocks
- `#HENKILOSTO` — included when an average headcount is set
- `{{eNNN}}` / `{{sNNN}}` / `{{dNNN}}` — closing, opening and change for an
  account or account prefix
- `{{kausi}}`, `{{alkupvm}}`, `{{loppupvm}}`, `{{nimi}}`, `{{ytunnus}}`,
  `{{kaupunki}}`, `{{tulos}}` (period, start date, end date, name, business id,
  city, result)
- `@tase@`, `@tulos@`, `@verolaskelma@`, `@henkilosto@` (balance sheet, P&L,
  tax calculation, headcount)

The wizard picks the PMA size, the headcount and the optional sections, then
generates the HTML. The editor is a `contenteditable` region with a small
toolbar built on the browser's own formatting commands, plus a raw-HTML mode —
no rich-text dependency. Saving writes `TPTEKSTI_{loppupvm}`, the
`Asetus.tilinpaatos/{loppupvm}` backup, and the `tilinpaatos` timestamp.

## Printing

**Print** assembles a cover page and the notes into one HTML document with
`@page` A4 rules and opens it in a new tab; the browser's print dialog produces
the PDF. **Download HTML** downloads the same document for archival.

No PDF library is bundled — see [COMPATIBILITY.md](COMPATIBILITY.md) for what
that means when the book is opened in desktop Kitsas.

## Not in this version

- Annual report and consolidated statements
- Swedish and English notes templates; association and housing-company variants
- Archiving (Kitsas stores the archive path outside SQLite)
- Closing private accounts (type 9040)
