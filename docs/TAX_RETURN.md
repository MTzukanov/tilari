# Annual tax return (6B)

Source of truth for what Tilari implements for a limited company's income tax return. Cross-links:
[SCOPE.md](SCOPE.md), [DECISIONS.md](DECISIONS.md) ADR-032, [VAT.md](VAT.md).

Finnish tax-form wording stays in the catalogue and the output: it is the owner's way into OmaVero, which
does not show the file codes. This page uses the codes because it talks about the file.

## What it does

A button on a period's card on the company page (`#/company`) opens a dialog with three tabs:

- **OmaVero-luvut**: the figures in OmaVero's order and wording, each traced to its accounts, with a copy
  button on every amount, and the whole return as text.
- **Täytettävät tiedot**: what the book cannot know. Each OmaVero question takes a yes or a no for this period:
  neither is preselected, a question left open is not a no, and answers do not carry over to the next period (the
  contact and share counts do). The form saves with questions open, so typed work is not lost; the return then
  shows them as a check, and no file is made. "Onko tilinpäätös laadittu?" is yes unless the owner says otherwise.
- **Ilmoitin-tiedosto**: the same figures as a file for Ilmoitin.fi.

Both outputs render one calculation (`computeTaxReturn`), so they cannot disagree. Nothing is posted: the
ledger is read, and only the owner's inputs are written, to `TilariData` (`tax-return/{ends}`, `tax-return/mapping`).

## Sources

- Fields, money types and formulas: Vero's record description `VSY06B26` v1.1, "Elinkeinotoiminnan
  veroilmoitus, yhteisö (6B)".
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
4. The standard chart's headings, each covering accounts from its number to the next heading, compared as
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
  261 or 270.
- **A credit balance on a `19x` account** moves to 452, as a short-term debt.
- **Long and short term** (461, 462): accounts under `26`-`27` are long-term, `28`-`29` short-term.
- **Opening profit** (474, 475): equity accounts `225`-`237` plus every earlier period's result.

Where past filings of a book differ from the chart, the chart decides and the owner can override per account.

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

`unplaced`, `result_ties`, `net_wealth`, `negative` and `sale_gap` stop a file from being called ready.
Warnings: `custom_accounts`, `drafts`, `not_ended`, `income_tax`, `dividend_answer`, `sale_split`, `manual`, `to_check`.

## The file

`domain/ilmoitinFile.ts`. ISO-8859-1 `name:value` lines joined by CRLF, starting `000:VSY06Byy` and ending
`999:1` with no line break after it. Comma decimals; zero fields left out, except 478 and whichever of 500/505
and 573/574 applies. Repeating groups go between `001:n` and `009:i`.

- **014** is the book's business ID plus `_TL`: Vero's rule for software a filer has developed itself. **048** is
  `Tilari`. **045** is left out: Vero says the operator that transmits the file adds it.
- **The personal ID** is required in 703. It is typed when downloading and kept only in the dialog's state. The file
  is built in the browser, also on the Node engine, so the ID never reaches the book or a server.
- **Stopped** (no bytes): missing required answers, an OmaVero question left open, characters outside ISO-8859-1, too long a text, a negative in an
  `R13,2` field, an answer needing fields the file does not produce.
- **Check only** (bytes, but not to send): a form in the same file that is not generated, a failed check, or a year
  other than the record description's.

Checking is the owner's: Ilmoitin.fi's check validates a file before sending. `testi.ilmoitin.fi` takes invented
data only. Vero asks software makers to tell `ohjelmistotalot@vero.fi` when production use starts; Tilari sends
nothing itself.

## Left for later

- Forms 8A, 71B, 73 and 62. Until they exist a file for a company with securities or depreciable assets can be
  checked but not sent. 8A's securities and 73 by country need detail that lives in the bank import, not the ledger.
- Attachment PDFs' names for Ilmoitin.
- 7812 (dividends) and 7851 (shareholder loans) are separate annual returns: listed, not generated.
- Owner's housing in company property, share capital changes after the year end, and banks and insurers: a yes
  stops the file, and the owner files those in OmaVero.
