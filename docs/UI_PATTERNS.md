# UI patterns: documents and status

For anyone building or restyling a page that lists documents, deadlines or things that need doing.
The company page (`#/company`) is the reference. Rental objects are next; see
[Next: rental objects](#next-rental-objects).

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

2. **One filled button, on what is wanted now.** A missing row gets a filled upload button. If the
   book already suggests a document for that row, the suggestion's "Lisää" is the filled one instead.
   Finished rows keep their actions but fade them until hover, so a long list is not a wall of buttons.

3. **Blue opens the file, purple opens the voucher.** A title is plain text. The pill next to it is
   what you click, so the same two colours lead to the same two places on every page.

4. **Cards open in place, and the address says which.** A voucher opened from inside a card comes back
   to that card, because the card is in `voucherHash`'s `via`. Opening a card scrolls it to the top,
   since closing the one above would otherwise move it away. Opening one on arrival by default does not.

5. **Dates and short codes use `--font-num`.** It is a system monospace; Tilari downloads no web fonts.
   Body text keeps the font the user picked (`shared/fontPrefs.ts`).

6. **Say why a row is not required.** When something is legally needed but needs no file here, say so
   on the row (`DocRow`'s `hint`) instead of showing it as missing. The balance sheet specifications and
   PRH's extract are the examples. Show the note only while the row is optional: once a setting requires
   the document, the note would contradict the row.

7. **State reads as a pill, not as coloured text.** Plain coloured words were too easy to miss. Use the
   same tone for the same meaning: "Tehty" looks like "Valmis", and "Ei asiakirjaa" like "Puuttuu".

## Parts

| Part | File | Use it for |
|---|---|---|
| `Pill` | `shared/Pill.tsx` | A status or fact, by tone |
| `FilePill` | `shared/Pill.tsx` | Opens one attachment; a long name is cut and shows in full on hover |
| `VoucherPill` | `shared/Pill.tsx` | Opens a voucher; pass its number as the label and its date as `title` |
| `DueTiles`, `DueTile` | `shared/DueTile.tsx` | Something with a due day; its state is a `Pill`, with the same colour on the edge. `onOpen` makes it a button |
| `DocRows`, `DocRow` | `shared/DocRows.tsx` | A framed list of things that hold documents; `onFiles` makes a row take dropped files |
| `DocLines`, `DocLine` | `shared/DocRows.tsx` | One document: `mark`, title, date, pills, and `end` at the far side |
| `Binder` | `shared/Binder.tsx` | A card that opens in place, with badges that show its state while closed |

CSS, in the "Documents and status" part of `App.css`:

- `.section-label`: the small uppercase heading inside a page or card.
- `.num-text`: a date or code in `--font-num`.
- `.btn-small.is-primary`: the row's filled button.
- `.btn-link.btn-quiet`: a secondary action such as "Poista linkki" or "Ei tarvita".
- Tokens on `:root`: `--ok`, `--warn`, `--crit`, `--doc`, `--voucher`, each with a `-soft` background;
  `--card`, `--sunk` and `--font-num`. Each text and soft pair has at least 4.5:1 contrast. Keep that
  when changing one.

`.company-suggest`, the blue "Ehdotuksia kirjanpidosta" banner, still lives with the company page. Move
it to `shared/` when a second page uses it.

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
      <DocLine title={doc.title} date={formatDate(doc.date)} end={<button className="btn-link btn-quiet">...</button>}>
        <FilePill id={file.id} name={file.name} />
        <VoucherPill label={t('some.voucher', { id })} title={formatDate(doc.date)} onOpen={open} />
      </DocLine>
    </DocLines>
  </DocRow>
</DocRows>
```

## Next: rental objects

Not done yet: the owner asked to consider it after the company page. It is visual only, so no change to
`property/{id}` data, `doc_voucher_ids` or `PropertyEdit.createDoc`. Work on a local branch and demo it
first, as for any feature.

| Where | Now | Change to |
|---|---|---|
| `PropertyView.tsx` `Documents` | Panel with `h4` groups and `.property-doc-list`; a long voucher link, then `.property-attachment` | `.section-label` per group, `DocLines` and `DocLine` with `FilePill` and `VoucherPill`. Keep "show all" and the bank toggle |
| `PropertyEdit.tsx`, linked documents | `.property-linked-list` with a small remove button | `DocLine`, the remove button in `end` |
| `DocPicker.tsx` | A "view" link styled as `btn-small` | `FilePill` for the picked document; the search stays |
| `FormParts.tsx` `VoucherLink` | Underlined number and title | `VoucherPill`, or the title plus a pill. This one change reaches every lease panel. `LineLink` shows an amount, so keep it a link |
| `LeasesPanel.tsx` `LeaseList`, `LeaseCard` | Lease state as plain text | `Pill`, tone by state |
| `LeasesEditor.tsx`, `WaterEditor.tsx` suggestions | `.property-lease-suggestions` | The suggestion banner moved to `shared/`, with `DocLine` and `mark` |
| `PortfolioView.tsx` `AlertsList`, `PropertyView.tsx` warnings | Text lists | `DueTile` where there is a due day (lease reminders), `Pill` for the rest |

Suggested order: `Documents` first, since it is the most visible, then `VoucherLink`, lease states and
the editors. Each is a separate demo.

Check before starting:

- `e2e/properties.spec.ts` selects `.property-doc-list` in two places.
- A rental object has its own page, and its month panel opens through the address. Do not turn those into
  `Binder`s unless the owner asks: this is about how a document reads, not about navigation.
- Remove `.property-attachment` and its 📎 once nothing uses it.

Done when no document on a rental object's pages uses an underlined link for a file or voucher, and the
e2e still passes.
