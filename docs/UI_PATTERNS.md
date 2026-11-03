# UI patterns: documents and status

For anyone building or restyling a page that lists documents, deadlines or things that need doing.
The company page (`#/company`) is the reference; rental objects use the same parts (see
[Rental objects](#rental-objects)).

## The problem it solves

A page of thin outlines and pale text gives every row the same weight, so what is missing does not
stand out. Here colour and a filled button mark what needs doing, and everything else stays quiet.

## Rules

1. **A colour means one thing everywhere.**

   | Tone | Meaning | Examples |
   |---|---|---|
   | `ok` | Done | Valmis, 5/5 asiakirjaa |
   | `warn` | Needs doing, or waiting | 0/5 asiakirjaa, Odottaa |
   | `crit` | Missing or wrong | Puuttuu, Poistettu, Myöhässä |
   | `accent` | Open, in progress | Avoin, Käynnissä |
   | `neutral` | A plain fact | Lukittu, Vapaaehtoinen |
   | `doc` | A file or a suggestion | a file name, Ehdotus |
   | `voucher` | A voucher | Tosite 4/2026 |

2. **One filled button, on what is wanted now, and no other buttons.** A missing row gets a filled upload
   button. If the book already suggests a document for that row, the suggestion's "Lisää" is the filled one
   instead. Every other action in a row is a quiet link, so a long list is not a wall of buttons.

3. **Blue opens the file, purple opens the voucher.** A title is plain text. The pill next to it is
   what you click, so the same two colours lead to the same two places on every page.

4. **Cards open in place, and the address says which.** A voucher opened from inside a card comes back
   to that card, because the card is in `voucherHash`'s `via`. Opening a card scrolls it to the top,
   since closing the one above would otherwise move it away. Opening one on arrival by default does not.

5. **Dates and short codes use `--font-num`.** It is a system monospace; Tilari downloads no web fonts.
   Body text keeps the font the user picked (`shared/fontPrefs.ts`).

6. **A list shows what is wanted, and a setting says what it does.** On the company page a ticked
   document is listed and required, and an unticked one is not listed, so no row sits there as a maybe. A
   row that already holds a document stays, because unticking must not hide what was attached. A group of
   checkboxes gets a title and a line saying what ticking does, and each box says when to tick it.

7. **State reads as a pill, not as coloured text.** Plain coloured words were too easy to miss. Use the
   same tone for the same meaning: "Tehty" looks like "Valmis", and "Ei asiakirjaa" like "Puuttuu".

8. **A list of documents reads as a table.** Each part of a line stays in its place from line to line:
   the voucher pill with the date, the title, the files, the actions. A mark such as "Ehdotus" sits at the
   title's far side, so it moves nothing. A row's status starts at one place and its buttons end at one,
   with the quiet link in front of them. Where one row does not fit (a list under 60rem), a line folds into
   two: date and title, then files, with the actions centred at the side of both. On a phone (under 30rem)
   the actions move to the files' row, the voucher number and "Ehdotus" go,
   and the title wraps to two lines, since there is no hover to show it in full. A thin line separates
   documents from each other; none goes under a row's name or after its last document.

## Parts

| Part | File | Use it for |
|---|---|---|
| `Pill` | `shared/Pill.tsx` | A status or fact, by tone |
| `FilePill` | `shared/Pill.tsx` | Opens one attachment; a long name is cut and shows in full on hover |
| `VoucherPill` | `shared/Pill.tsx` | Opens a voucher and shows its `date` and `number`; `label` names it on hover and for screen readers |
| `DueTiles`, `DueTile` | `shared/DueTile.tsx` | Something with a due day; its state is a `Pill`, with the same colour on the edge. `action` adds a quiet link; `onOpen` makes the whole tile a button |
| `DocRows`, `DocRow` | `shared/DocRows.tsx` | A framed list of things that hold documents; `onFiles` makes a row take dropped files |
| `DocLines`, `DocLine` | `shared/DocRows.tsx` | One document as a table row: `voucher` (or a plain `date` if it has none), title, `mark` at the title's far side, the files as children, and `end` |
| `Binder` | `shared/Binder.tsx` | A card that opens in place, with badges that show its state while closed |
| `SuggestBanner` | `shared/SuggestBanner.tsx` | Suggestions from the book: a blue banner with a title, a line on where they come from, one `action` for all of them (add them all, or review them) and the suggestions below, as `DocLine`s with a filled "Lisää" in `end` |

CSS, in the "Documents and status" part of `App.css`:

- `.section-label`: the small uppercase heading inside a page or card.
- `.num-text`: a date or code in `--font-num`.
- `.btn-small.is-primary`: the row's filled button.
- `.btn-link.btn-quiet`: a secondary action such as "Poista linkki" or "Ei tarvita".
- `.suggest-banner`: the banner; `.suggest-banner-list` folds a long list of suggestions under it (the company page).
- Tokens on `:root`: `--ok`, `--warn`, `--crit`, `--doc`, `--voucher`, each with a `-soft` background;
  `--card`, `--sunk` and `--font-num`. Each text and soft pair has at least 4.5:1 contrast. Keep that
  when changing one.

## Example

```tsx
<DocRows>
  <DocRow
    name={t('some.kind')}
    status={<Pill tone="crit">{t('some.missing')}</Pill>}
    tone="missing"
    actions={<FileButton className="btn-small is-primary" onFiles={upload}>{t('some.upload')}</FileButton>}
    onFiles={upload}
  >
    <DocLines>
      <DocLine
        voucher={<VoucherPill label={t('some.voucher', { id })} date={formatDate(doc.date)} number={id} onOpen={open} />}
        title={doc.title}
        end={<button className="btn-link btn-quiet">...</button>}
      >
        <FilePill id={file.id} name={file.name} />
      </DocLine>
    </DocLines>
  </DocRow>
</DocRows>
```

## Rental objects

Moved onto these parts in four steps (2026-11-02 and -03), visual only: no change to `property/{id}` data,
`doc_voucher_ids` or `PropertyEdit.createDoc`.

| Where | Now |
|---|---|
| `PropertyView.tsx` `Documents` | `.section-label` per group, `DocLines` and `DocLine` with `VoucherOpen` and `FilePill`; "show all" and the bank toggle stay |
| `FormParts.tsx` `VoucherLink` | The voucher's pill, its title and the files as `FilePill`s; reaches every lease and water panel |
| `LeasesPanel.tsx`, `WaterPanel.tsx` | A lease's state and a tenant's water status are `Pill`s |
| `PropertyEdit.tsx`, `DocPicker.tsx` | Linked documents are `DocLine`s with the remove as a quiet link; the picked document shows its `FilePill`s |
| `LeasesEditor.tsx`, `WaterEditor.tsx` | Suggestions in `shared/SuggestBanner`, each a `DocLine` |
| `ui/Warnings.tsx` (object page and the portfolio's "Huomioitavaa") | A lease ending or a rent increase is a `DueTile` (days left, or "Myöhässä" once past); every other warning is a line led by a `Pill`: Virhe and Puuttuu red, Hoidettava amber, Ehdotus blue, Huomio grey (`warningTone` in `format.ts`) |

What stayed a link, and why:

- `LineLink` and a deposit's movements: they show a date and an amount, a figure taken from the ledger, not a
  document.
- An object's name in the portfolio's warnings, "Muokkaa", the month panel's links: navigation inside Tilari.
- "Ohita" and "Poista": quiet links, so the document's own pills stay the loudest thing on the line.

A rental object keeps its own page, and its month panel opens through the address: these are not `Binder`s.

