# Annual tax return (6B)

Source of truth for what Tilari implements for a limited company's income tax return. Cross-links:
[SCOPE.md](SCOPE.md), [DECISIONS.md](DECISIONS.md) ADR-032, [VAT.md](VAT.md).

Finnish tax-form wording stays in the catalogue and the output: it is the owner's way into OmaVero, which
does not show the file codes. This page uses the codes because it talks about the file.

## What it does

A button on a period's card on the company page (`#/company`) opens a dialog with four tabs:

- **OmaVero-luvut**: the figures in OmaVero's order and wording, each traced to its accounts, with a copy
  button on every amount, and the whole return as text. "Tallenna laskelma asiakirjoihin" keeps the calculation
  as a PDF (below).
- **Täytettävät tiedot**: what the book cannot know. Each OmaVero question takes a yes or a no for this period:
  neither is preselected, a question left open is not a no, and answers do not carry over to the next period (the
  contact and share counts do). The form saves with questions open, so typed work is not lost; the return then
  shows them as a check, and no file is made. "Onko tilinpäätös laadittu?" is yes unless the owner says otherwise.
- **Liitelomakkeet**: forms 62, 8A and 71B as far as the figures call for them, and 73 always: closed, with the
  reason, when they do not.
- **Ilmoitin-tiedosto**: the same figures as a file for Ilmoitin.fi.

Leaving a tab with typed figures saves them, so moving on to the file does not lose them.

The checks and the file's problems are listed under a heading that says what is left. Each item's text links to
where it is fixed: the tab, the section (focused, so it shows), and for a 6B field its row, opened on its accounts.
Items fixed outside the dialog (drafts, the business ID in the settings) are plain text.

Both outputs render one calculation (`computeTaxReturn`), so they cannot disagree. Nothing is posted: the
ledger is read, and only the owner's inputs are written, to `TilariData` (`tax-return/{ends}`, `tax-return/mapping`).

## Sources

- Fields, money types and formulas: Vero's record descriptions `VSY06B26` v1.1 "Elinkeinotoiminnan veroilmoitus,
  yhteisö (6B)", `VSY07326`, `VSY08A26`, `VSY71B26` and `VSY06226`.
- Form 73's classes: Vero's guide to form 73 ("Erittely osinkotuloista ja voitonjaon luonteisista eristä").
- File format: Vero's "Electronic filing of information returns, general description".
- Attachments: Vero's "Enclosures to the electronically submitted income tax return".
- Order and wording: OmaVero's print of a filed return.

## Where an account goes

`domain/mapping.ts`, first match wins:

1. The book's own choice (`tax-return/mapping`).
2. Named standard accounts whose heading or type would mislead: `9530`, `9540` to 379; `9090`, `9270` to 337,
   not taxed.
3. Account type: `CZ`/`CLZ` to 358, `DZ` to 384, `DH` to 368 with half deductible, `DP` to 364, `DPZ` to 364
   and not deducted. Accounts starting `99` skip this and go to direct taxes, whatever their type says.
4. An income account added among financial items (`9...`, type `C...`) and named for dividends (`osinko`,
   `osingot`, `utdelning`, `dividend`) goes to 337. Its heading would put it with interest, and then neither the
   dividend field nor form 73 would show it. It is still a guess, listed to confirm.
5. The standard chart's headings, each covering accounts from its number to the next heading, compared as
   text the way Kitsas orders its chart (`17631` sits under `176`).

Account types are the book's today, not as they were: a type changed later applies to earlier years as well.

- **Outside the standard chart:** Vero publishes fields, not accounts, so no official table says where an account
  goes. Software that fills in a 6B keeps per-field rules built on its own standard chart; Kitsas has only its
  statement formulas (`tase/PMA`, `tulos/yleinen`), which stop at a statement line and are coarser than the form. An
  account the book added has no such rule, so it takes the nearest heading above its number. That is a guess, and it
  can change the tax: a dividend account placed in Muut rahoitustuotot is taxed in full. It is listed for the owner
  to confirm or change, and the return says so until then.
- **Sale accounts** (`sale` in the mapping): sale proceeds and costs carry one net figure. Gains and losses come
  from the 71B rows, and gains minus losses must equal the accounts' net exactly. Without rows, the net goes to
  261 or 270, and so it does while suggested rows do not tie: the form's figures stay the ledger's until the rows are
  saved or tie. On saved rows a difference is reported once, as `sale_gap`: `result_ties` and `estimate` leave it out.
- **A credit balance on a `19x` account** moves to 452, as a short-term debt.
- **Long and short term** (461, 462): accounts under `26`-`27` are long-term, `28`-`29` short-term, unless the owner
  says otherwise for the account (`terms` in `tax-return/mapping`).
- **Opening profit** (474, 475): equity accounts `225`-`237` plus every earlier period's result.

Where past filings of a book differ from the chart, the chart decides and the owner can override per account.

## Attached forms

**8A, securities** (`domain/form8a.ts`). One group per asset class, each tied to its 6B field to the cent.

- In Käyttöomaisuus and Muu omaisuus a row comes from each tase-erä with a balance, and that balance is the cost.
- In Rahoitusomaisuus rows are typed: one tase-erä can hold a whole portfolio. The cost is typed too, and the check
  says what is left.
- The company's name and business ID start empty. The line that opened a tase-erä is no guide: on a purchase its
  partner is usually the seller, and on a real book it named the company in no case. Its text shows beside the row.
- Rows with the same name and business ID become one line on the form, so a flat and its garage take one row. Their
  counts add up, so a count goes on only one of them. The ID alone is not enough: OmaVero takes no empty ID, so a
  company without a Finnish one gets 0000000-0 (valid by its check digit), and those rows stay separate.
- Comparison value per share: three decimals under 10 euros, otherwise two (Vero's check #2038). The total is count
  times unit, rounded to the cent, unless typed. Vero's guide to 8A: a listed security's is 70 % of its closing price
  on the balance sheet date, a fund unit's 70 % of its value at the end of the calendar year, and housing shares
  bought since 1.1.2006 have none. So only Muu omaisuus goes without a remark when it is empty.
- Names, IDs and counts carry over to the next year; comparison values do not.
- **Pasting rows** (any group): one holding per line in the form's order (name, business ID, count, cost, comparison
  value per share, and the total if wanted), separated by tabs as a spreadsheet copies them, or by semicolons, typed
  or read from a file. The lines replace the group's typed rows, a first line that cannot be read is a header, and
  other unreadable lines are listed. A row without a business ID keeps the ID of an earlier row of the same name, so
  a Finnish ID is typed once. Tilari reads no broker's files itself: a tool that does writes this format, as
  tilari-bank-import's `nordnet-tax-forms` does for Nordnet.

**73, dividends** (`domain/form73.ts`). The ledger has one figure, Saadut osingot ja ylijäämät; the classes are typed.
The form is always on the tab: when not needed it is closed and says why (no euros in the field, with a link to the
figures, or the answer that all dividends are Finnish and tax-free), and it can still be filled in.

- Classes, from Vero's guide: tax-free from Finland, another EU or EEA state, or outside; taxable in full from the same
  three; and REITs. A class is wholly tax-free or wholly taxable, so its share equals its total. Listed shares the
  company owns under 10 % of are taxable; a tax-free class needs the conditions in Vero's guide.
- Once a class has an amount, the form's taxable share is Veronalainen osuus on the 6B, as Vero says to carry it.
  Until then the 6B follows the ledger (a tax-free dividend account, `9090` or `9270`, counts as tax-free).
- The total must equal Saadut osingot ja ylijäämät in the Kirjanpito column, which is the book's figure: gross, a
  foreign dividend converted as booked.
- "Onko yhtiö julkisesti noteerattu?" takes a yes or a no, like the 6B's questions. Each class's "Jakajayhtiö on
  listattu" is a checkbox: off is OmaVero's "Ei tai jakajayhtiöitä on useita". Omistusosuus is optional.
- Not needed when every dividend is tax-free and from Finland, which OmaVero asks as a question. A yes there while the
  figures show taxable or foreign dividends is a check to fix.
- Amounts do not carry over to the next year.

**71B, sales** (`domain/form71b.ts`). Sections 2, 4 and 5, for other assets.

- A voucher that credits a tase-erä and books on a sale account suggests a row, with its price, the tase-erä's credit
  as the cost, and the dates. The owner adds what the ledger lacks. Costs booked on other vouchers, such as a broker's
  fee, are not linked to a sale: they stay in `sale_gap` until written on a row.
- A row with a gain goes to section 2; a loss goes to section 4, as deductible in full.
- Once saved, removed rows stay removed, and vouchers not on the rows are listed to add.

**62, depreciation** (`domain/form62.ts`). Accounts in Koneet ja kalusto fill the movable assets section; Aineettomat
oikeudet and Muu käyttöomaisuus fill other depreciation; Pitkävaikutteiset menot fill long-term expenditure. Tax follows
the book until a figure is typed, and the rest of the section follows from it. Reserves, value changes and buildings
are typed: the ledger cannot tell their tax class. The form ties to Vähennettävät poistot in both columns, and Vero's
limits on regular depreciation (25 %, 7 %, 4 %) are checked exactly.

## Checks

Exact, with no tolerance; differences are shown to the cent.

| Check | Fails when |
|---|---|
| `unplaced` | An account with a balance has no field |
| `unanswered` | An OmaVero question has neither a yes nor a no |
| `result_ties` | The form's Kirjanpito figures do not give the book's result |
| `net_wealth` | Assets minus debts differ from equity |
| `estimate` | The result differs from the stored `verolaskelma`, or from the Kitsas estimate if none is stored |
| `negative` | A negative in an `R13,2` field |
| `sale_gap` | Gains minus losses differ from the sale accounts' net |
| `form8a_gap` | A group's costs on 8A differ from its 6B field |
| `form62_tax`, `form62_book` | Depreciation on 62 differs from Vähennettävät poistot |
| `form62_limit` | Regular depreciation is over Vero's limit |
| `form73_listed` | Form 73 is needed and its listing question has no answer |
| `form73_gap` | Form 73's total differs from Saadut osingot ja ylijäämät |
| `form73_tax` | A typed Veronalainen osuus differs from form 73's taxable share |
| `tax_free_answer` | The answer says every dividend is tax-free and from Finland, but the figures disagree |

`unplaced`, `result_ties`, `net_wealth`, `negative`, `sale_gap`, `tax_free_answer` and the form checks stop a file from
being called ready.
Warnings: `custom_accounts`, `drafts`, `not_ended`, `income_tax`, `dividend_answer`, `sale_split`, `manual`, `to_check`.

## The file

`domain/ilmoitinFile.ts`. ISO-8859-1 `name:value` lines joined by CRLF, starting `000:VSY06Byy` and ending
`999:n` with no line break after it. The forms follow one another, each with its own header and `999:` running in
sequence: 6B, then 62, 73, 8A and 71B as far as they have rows (73 once a class has an amount). Comma decimals; zero fields left out, except 478 and whichever of 500/505
and 573/574 applies. Repeating groups go between `001:n` and `009:i`.

- **014** is the book's business ID plus `_TL`: Vero's rule for software a filer has developed itself. **048** is
  `Tilari`. **045** is left out: Vero says the operator that transmits the file adds it.
- **The personal ID** is required in 703. It is typed on the file tab, next to the download button, and kept only in the dialog's state. The file
  is built in the browser, also on the Node engine, so the ID never reaches the book or a server.
- **Stopped** (no bytes): missing required answers, an OmaVero question left open (form 73's too), characters outside
  ISO-8859-1, too long a text, a negative in an `R13,2` field, an ownership share on 73 over 100 or with more than two
  decimals, an answer needing fields the file does not produce, a form row missing what Vero requires.
- **Check only** (bytes, but not to send): a form in the same file that is not generated, a failed check, or a year
  other than the record description's.
- **Remarks** (no effect on the file): an 8A row without a business ID or comparison value. Vero only remarks on these.

Checking is the owner's: Ilmoitin.fi's check validates a file before sending. `testi.ilmoitin.fi` takes invented
data only. Vero asks software makers to tell `ohjelmistotalot@vero.fi` when production use starts; Tilari sends
nothing itself.

## The stored calculation

"Tallenna laskelma asiakirjoihin" writes the return as it stands into a PDF (`ui/calculationPdf.ts`, with the
letters' `shared/textPdf.ts`: text only, A4, no library) and keeps it on a Liitetieto voucher of the day, linked to
the period's Veroilmoitus 6B row on the company page. The PDF holds the checks, every 6B figure with the accounts it
comes from, and the rest of the return in OmaVero's wording. The personal IDs typed for the file are not in it.

The link is marked `calculation`: the row lists it with a "Laskelma" tag, but it does not fill the row or meet the
tax return's deadline. Only the filed return does. The row keeps one calculation (owner, 2026-11-03): a new save
writes over the newest kept one in place (date, title, its file replaced), deletes the other kept ones with their
links and unlinks those already deleted (`replaceCalculation` in `company/domain/upload.ts`). One dated on or before
the lock date cannot change and stays; the save then makes a new voucher.

## Left for later

- On 73: dividends that were deductible for the payer (listed by country) and the partly taxable classes of credit,
  insurance and pension institutions. These go by hand in OmaVero; a credit institution's 6B already stops the file.
- 71B for fixed-asset shares and partnership interests, losses with restricted deduction, and earlier years' confirmed
  losses: these go by hand in OmaVero. The dialog says so when the figures call for the first.
- 62 does not carry typed figures over: where tax differs from the book, next year's opening balance is typed again.
- Attachment PDFs' names for Ilmoitin.
- 7812 (dividends) and 7851 (shareholder loans) are separate annual returns: listed, not generated.
- Owner's housing in company property, share capital changes after the year end, and banks and insurers: a yes
  stops the file, and the owner files those in OmaVero.
