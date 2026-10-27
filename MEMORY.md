# MEMORY - Tilari

Dated log of findings and decisions that are not obvious from the code. Newest first.
Agent guide: [AGENTS.md](AGENTS.md).

This repo is public: keep book contents (company names, amounts, counterparties) out of this file.

---

## 2026-10-27 - Rental objects 1f: lease reminders (`feature/property-reminders`)

- Phase 2 increment 1f (ADR-030): reminders are warnings computed on the as-of date - vacancy,
  a lease ending within 90 days, an increase due, water settlements missing (15 months), and
  tenant water shares with no letter (30 days) or not settled to the cent (60 days). Nothing is
  stored and nothing can be dismissed: the data answers each one.
- The portfolio's name column shows ⚠ (with the count) before the name, outside `.property-name`
  so the name's text stays as it was (an e2e matches it exactly). Notes do not mark rows
  (`NOTE_CODES`): `sale_costs_unset` would sit on every held row until the owner sets sale costs,
  and `sale_carried` / `sale_line_split` explain a shared sale.
- An increase whose anniversary month passed without a step shows only through that month; the
  next one comes 60 days before the next anniversary.
- Owner's demo review: what the book suggests must remind too (suggested leases, water
  settlements, deposits not linked), not only stored leases; a list of every object's warnings
  after the portfolio's figures, and a ⚠ count in the header that opens it. One count takes
  about 90 ms on a real book, so the header waits 0.8 s after the last change.
- Owner: missing documents remind too - a lease's contract, an increase's notice, an agreed
  exception's agreement, a water settlement's statement (objects still held).
- Owner: a single document check can be skipped ("Ohita" / "Ei asiakirjaa", `no_document: true` on
  the step, exception or settlement); the lease contract cannot.
- The book cannot tell "no increase" from an unset clause (`increase` with `kind: 'none'` is not
  stored), so a missing increase clause is no reminder.

## 2026-10-27 - The storage chip shows only where the book lives, not its file name

- The chip ("Selaimessa", "Levyllä", ...) also printed `source_name`, which the book picker right
  below always shows for an open book (both read `meta.source_name`). Owner asked to drop the
  repeat; the chip's tooltip still names the file.

## 2026-10-27 - Rental objects: the rent day boxes show the defaults

- Owner asked: instead of empty "Vuokra omistajalle alkaen / päättyen" boxes with a paragraph
  explaining the defaults, the boxes show the default days (`rent_start_default`,
  `rent_end_default`; the end stays empty while the object is held) and the paragraph is gone.
  Only a day other than the default is stored as `rent_from` / `rent_until`, so untouched boxes
  keep following the purchase and sale dates; a stored own day equal to the default is dropped
  on save.

## 2026-10-27 - PR previews as a non-zipped artifact, not under tilari.fi

- Owner asked for a preview of each PR, cleaned up after merge. `tilari.fi/PRs/<N>/` was rejected:
  one origin with the live app means a preview's code reads and writes its OPFS working copies,
  attachment blobs (with their GC), IndexedDB file handles and remembered locker credentials. A
  hosted preview on a separate origin (Cloudflare Pages) was weighed too; the owner chose the
  GitHub artifact: one HTML file, no hosting, no secrets.
- `upload-artifact` v7 with `archive: false` serves the file inline as `text/html` from
  `productionresultssa<N>.blob.core.windows.net` with no CSP (checked on an upstream artifact),
  so the inlined app runs. That host's storage is shared with every repo's HTML artifacts: test
  with copies. Details: [docs/PAGES.md](docs/PAGES.md#pr-previews).

## 2026-10-27 - Server: the live app's origin `https://tilari.fi` is allowed by default

- Since Pages moved to its custom domain, browsers load the app from `https://tilari.fi` (github.io
  redirects there), but `DEFAULT_ALLOWED_ORIGINS` held only `https://mtzukanov.github.io`, so a
  self-hosted server with default settings refused the live app. The default is now both origins;
  github.io stays for the case the custom domain is removed. Doc links point at `tilari.fi`.
  No server is run by the owner, so nothing deployed was affected.

## 2026-10-27 - Rental objects: the water form keeps a suggestion's booked lines

- Owner reported: a water settlement the book suggested listed its booked lines, but once added
  to the edit form ("Lisää") the lines were gone, and the statement and letter boxes stayed
  empty. Those boxes pick Liitetieto documents, and the lines sit on bank vouchers, so they
  cannot be filled from them. The form now gets the object's water lines
  (`WaterDetail.lines`) and gives each settlement in it the lines `settlementFor` gives it, live
  as the period changes (`settlementViews`, as the object page): the company's lines under the
  statement, each tenant's lines with the status under their share, others below.

## 2026-10-27 - Rental objects: the seller keeps the rent of the month of the sale

- Owner asked: after a sale the rent counts to the end of the sale month by default (ADR-026),
  as the seller usually keeps it; before, the count ended on the sale day and the month's rent
  showed as paid ahead. `rent_until` on the object overrides it, next to `rent_from`; the edit
  page shows both defaults in one hint, and the rent account says why it ends where it does.

## 2026-10-27 - Rental objects: no overlapping leases or water periods; rent from the month after a purchase

- Owner reported that overlapping date ranges could be saved. Exceptions within a lease were
  already refused, but two leases of an object (e.g. an open-ended one and the next tenant's) or
  two water settlement periods on the same days were not: those days expected rent, or settled
  water, twice. Saving now refuses them (`checkRanges`, domain `ranges.ts`), the form names both
  with their days, and it gives readable texts for an increase or exception outside the lease
  too. Documents already saved with overlaps still read (no corrupt flag) and warn.
- Owner asked: after a purchase the rent counts from the first whole month owned (ADR-026), as
  the seller keeps the month of the sale; before, every object bought with a tenant needed an
  exception at 0 for the rest of the purchase month. `rent_from` on the object overrides it when
  the sale agreed otherwise. Exceptions entered for that purpose are now redundant, not harmful.

## 2026-10-26 - Rental objects 1e: rent deposits per lease (`feature/property-deposits`)

- A lease's `deposit` links the deposit's items and loose lines on a liability account (ADR-029);
  the lease card shows received, returned, the deduction kept from a return (the same payment's
  income or cost lines) and the balance on the as-of date. Warnings `deposit_open` (ended over
  60 days ago, still held) and `deposit_over` (more returned than received).
- Real-book check on a copy: deposits are on a liability account named for rent deposits, most as
  items without a cost centre; some returns were booked without the item, so loose lines can be
  linked too. A return can be reduced by a key or a water settlement booked as rent in the same
  voucher. Portfolio 92 ms, one object at most 64 ms.
- Candidates match the account name or the line's text; the voucher's title only stands in for
  an empty text - otherwise a VAT line on a voucher titled for a deposit was offered (found in
  the e2e).
- Two receipts near one lease start (two parking spaces bought the same day), neither from the
  tenant: no suggestion; the owner picks.
- Owner's review (demo): the item's return was hard to find in the picker; the linked deposit now
  lists its bookings (received, returned) as links, an item's label names its return dates, and
  the picker is newest first (★ on top). "vakuu" also matched insurance (sairausvakuutusmaksu on a
  liability account); insurance forms are left out now.
- The lease form's water checkbox sat ~1.5 px above the parking one (Chromium and Firefox): a flex
  row aligned by baseline took the checkbox's bottom edge as the label's baseline.
- That row also had no space above it: the lease card's `.property-lease-head` rule (later in
  App.css) took the form row's 1rem top margin away. The form's rule is scoped to
  `.property-lease-edit` now; the card and the water panel keep theirs.

## 2026-10-26 - Rental objects: the list's rent leaves out the water advance

- Owner asked: the object list (`#/properties`) showed the tenant's rent with the water advance
  included. The advance is settled against use, so the list now shows rent + parking only. The
  lease card still shows the total with its parts, and the rent account still expects the total.

## 2026-10-26 - Rental objects: agreed rent exceptions; rent before a later acquisition (`feature/property-rent-exceptions`)

- Owner asked for exceptional rents (discounts or otherwise agreed). A lease's `exceptions[]`
  holds stretches of days with their own amounts, a reason and the agreement voucher; they stand
  over the steps without changing them (ADR-027). The rent account expects them, the month table
  marks those months (the normal rent and the reason on hover), the lease card lists them.
- Fixed: a lease taken over with an object whose acquisition is booked later than the first rent
  (on a real book: the asset re-booked as a balance item on 1 January, after December's rent came
  in) showed that month's rent as paid ahead for good. Counting now starts from the month of rent
  received before the acquisition's date (`rentCountedFrom`, now `rentStart`, ADR-026). Only that object of the
  book had rent before its acquisition date.
- `<p>` around the "income without a lease" sources held a `<details>`; now a `<div>`.
- Fixed the acquisition date of such an object too (ADR-028): its purchase was booked on the
  shares account without an item and moved onto an item by a technical voucher on 1 January. The
  item lines of a re-booking are now dated at the original purchase lines, so the acquisition
  date, holding time and returns follow the purchase. On the real book only that object changed.
- Owner asked for an easy entry: every month of the rent account that moved the balance has a
  "Lisää poikkeus" button with a prefilled exception (`exceptionPrefill`), saved from the object
  page. With the acquisition dated at the purchase, the purchase month expects rent by days
  although the seller usually got it; that month now offers an exception at 0 for those days.
- Owner could not find where exceptions are entered: the lease card now links to the edit page
  ("Lisää korotus tai poikkeava vuokra..."); the demo has to run from the worktree, not the main
  checkout.
- Fixed: on a narrow page the rent account's month table overflowed. Firefox drew a month over the
  next row (cells on the baseline of a payment link that wrapped to two lines), wrapped links were
  centred and indented, and the table ran past the page edge. Cells are now top-aligned, links
  wrap flush left, and a table still too wide scrolls sideways (checked in Firefox and Chromium).

## 2026-10-26 - Rental objects 1d: rent arrears per lease, exact (`feature/property-arrears`)

- Owner decisions: figures exact to the cent with no tolerance (also in the water settlements:
  a share is settled only when its lines equal its balance; more is "over"), and each lease keeps
  its own balance (a new tenant starts at zero). ADR-026.
- `domain/arrears.ts`: expected rent per month from the stored leases (part months by days) plus
  water shares, received income given to one lease each, running balance per lease. Counted from
  the object's acquisition (else the books' start), not from an older lease start: on a real book
  a lease taken over with the purchase otherwise showed years of false arrears.
- Shown: the lease card's balance and its months (payments as links), the other leases' leftovers,
  income no lease takes, a KPI tile and a portfolio column (both in cents), warnings
  `rent_arrears`, `former_owes`, `former_paid_ahead`. Only stored leases count: suggestions
  added with "Lisää kaikki" can overlap (a tenantless contract next to a running lease), which
  shows as arrears on the wrong lease until the owner fixes the dates.

## 2026-10-26 - Rental objects 1c: water advances and settlements (`feature/property-water`)

- Owner: for most apartments water is a prepayment that the housing company settles against
  actual use once a year or more often; the tenant then gets part back or pays more. Water
  settlements must show on the apartment and in its rental relationships, before the arrears
  (which must count them). Built on `feature/property-water`, on top of the unmerged
  `feature/property-leases` (ADR-025).
- `water_settlements[]` in `property/{id}` (DATA_MODEL.md) and `water: 'flat'` on a lease.
  `domain/water.ts` computes the tenants' shares and finds the booked lines; the object page has
  a "Vesimaksut ja vesitasaukset" panel and the lease card the latest settlement; the edit page
  has a "Vesitasaukset" section with settlement letters (PDF on a type-800 voucher, like the
  increase notice; the letter frame is shared in `ui/letter.ts`).
- Defaults chosen in the demo: every lease that is not flat shares in a settlement, also with no
  water amount entered (tenants mostly pay rent and water in one line, so the suggestions cannot
  split them; the owner types the water advance from the contract). Without the actual use the
  company's difference is passed on by days.
- Found on a real book (no amounts here): company settlements on the vastike account in both
  directions, one refund passed on to the tenant on the same account, a tenant refund as negative
  rent income, an extra charge paid in monthly instalments with the rent (which the lease
  suggestions had read as a rent step - fixed: settlement lines make no step), and a settlement
  deducted from a deposit return. Texts include the typo "Vesitataus" and "puuttuneista
  vesimaksuista".

## 2026-10-26 - Rental objects phase 2: rental relationships first, in increments

- Owner decisions for phase 2: rental relationships first, built in increments, each demoed
  locally before a PR. Rent arrears count by object (all rent income on the cost centre), not by
  tenant. Rent increases are entered as steps; the lease's rule only drives reminders and the
  forecast. Documents stay type-800 vouchers; Tilari links them by id. The housing-company loan
  share and the vastike split come last and stay Tilari data: the ledger is not changed for them
  (an import-time split was considered and rejected).
- Increment 1a (`feature/property-leases`): `leases[]` in `property/{id}` (DATA_MODEL.md), an editor
  on the edit page, a "Vuokrasuhteet" panel on the object page (the lease running on the as-of
  date, then the others), and the tenant and rent under the object's name in the portfolio list.
  The lease state follows the as-of date, like the figures, so the server parity test stays
  deterministic. A lease's contract and notices are added to `doc_voucher_ids` on save.
- Owner review: the leases should come from what the book already has. `domain/leaseSuggest.ts`
  suggests them (never stored until the owner adds them on the edit page and saves): linked
  documents titled vuokrasopimus (also the typo "vuorkasopimus"; not "huolenpitosopimus") give a
  lease each, with the period from the title (d.m.yyyy, d.m.yy, m.yyyy; 31.11. reads as 30.11.);
  the tenant is a payer named in the title (also two words written together), else the payer with
  the most months who started with the contract; KELA/FPA is never the tenant. Rent steps are the
  object's monthly income repeated two months in a row (by object, like arrears). Payments outside
  every contract with a tenant become their own suggestions. On a real book the current tenant came
  out right for every flat whose contracts name the tenant; agencies and parking documents on a
  flat's cost centre need the owner's look.
- Owner review of the form: the payment is split into vuokra, vesi and autopaikka (suggestions
  split by line text: a line about water only is water; on a parking object the fee is rent); the
  due day starts at 5; no notice period or notes. Steps stay as the starting rent plus increases
  (korotus), each with its increase notice (korotusilmoitus). The increase clause (percent, euros
  or index) sits with the starting details and prefills the next increase. "Luo korotusilmoitus"
  writes a PDF letter (`shared/textPdf.ts`: Helvetica, WinAnsi, no dependency) to a new posted
  type-800 voucher titled after the object with the tenant as partner, links it to the increase
  and downloads it. The voucher is dated on the book's day, so a year must be open for it (Kitsas
  refuses the same).
- Owner review: contracts and the owner's own increase notices are uploaded in the lease form
  ("Lataa sopimus", "Lataa ilmoitus"; shared `FileButton`, also used by the voucher editor's
  dropzone). Documents created from the form are remembered in `created_voucher_ids` and can be
  deleted from it: one made on this visit at once (undo), an earlier one when the form is saved, so
  Peru leaves the book untouched. Other documents are only unlinked. Linked documents and items
  open their voucher; the unsaved form waits in sessionStorage (like the setup page). Document
  picks are the shared `DocPicker` over `SearchSelect`.

## 2026-10-26 - Fixed: a month typed in the address did not open on an object's page

- `#/property/{id}/month/{YYYY-MM}` was read only when the page mounted (keyed by id), so changing
  the month in the address while the page was open kept the old month's lines. The page now
  follows `hashchange` and reads the address itself: a bar click changes the address with
  `replaceState` and no route change, so the `month` prop can be stale. A month outside the
  last 24 still turns on the whole ownership period.
- Checked: `#/allocation/{id}/month/...` already follows the address (e2e covers both).

## 2026-10-10 - Book file menu grouped by where the book lives

- Owner review: the native `<select>` mixed local-file and storage actions under "Toiminnot" and
  listed all recents together. It is now a custom menu (`FilePick.tsx`, model in
  `app/open/bookMenu.ts`): **Luo uusi kirja** alone, then **Avoin kirja** (owner: right under
  create), **Tämä laite** and **Oma säilytys**, each recent under the group it came from
  (`locker:` = storage, anything else = device). Items that cannot work are hidden, not greyed
  (link only for an unlinked browser copy that is not a storage book and only where the API
  exists; **Tallenna uutena kopiona** only for a storage book; storage off = only
  **Yhdistä omaan säilytykseen…**). Renamed: Avaa tiedosto, Tallenna tiedostoksi, Tallenna uutena
  kopiona, Sulje ja poista tästä selaimesta (first in its group).
- Fixed: a recent `local:`/`server:` book could not be reopened. `openKitsasPath` accepts only the
  book already open, but `prepareEngine` closed the current book first, then the open failed with
  `file.lastGone` and the entry was deleted. Device recents now reopen through a
  `FileSystemFileHandle` kept in IndexedDB (`book/persist/fileHandles.ts`); the file is read
  before the current book is closed. Without a handle: `file.pickAgain` + the picker, entry kept.
- Fixed: a working copy restored after refresh lost its disk link (`restore()` adopted with a
  null handle). It now reloads the handle; `saveLocal` asks for permission again when needed.
- Fixed: a new book showed "Luo uusi kirja…" in the menu (it is not in recents; the select fell
  back to its first option). The button shows `meta.source_name`.

## 2026-10-10 - Fixed: Supabase storage errors hid the reason

- Supabase Storage answers most failures with HTTP 400 and the real status in the JSON body
  (`statusCode`, `message`). The stores looked only at the HTTP status, so an RLS refusal showed as
  "upload failed, check the connection". `locker/storageError.ts` now reads that body: 401/403 or
  an RLS message -> `locker_forbidden` (names the anon key and the storage policies), and the
  server's own message rides on `Error.cause`, which `mapFileError` appends in brackets.
- A bucket with no select policy for anon lists as empty and reads every object as missing, so
  "connected, no books" does not prove the policies are right. The first encrypted connect
  (writing `vault.json`) is where it shows.
- Supabase publishable keys (`sb_publishable_…`) are not JWTs. Sent as `Authorization: Bearer`,
  Storage answers 403 "JWS Protected Header is invalid". They now go on `apikey` only; the legacy
  anon JWT still goes on both. `sb_secret_…` keys are refused like `service_role`.
- `vault.json` is now created create-only (no upsert); on `duplicate` the existing vault is read.
  Before, two tabs connecting to an empty bucket could each write one, and the second replaced
  the salt that keyed the first tab's books.

## 2026-10-10 - Open: no UI for an object's sale vouchers

- `property/{id}.sale_voucher_ids` (vouchers whose lines on the object count as the sale's costs,
  e.g. a broker invoice or a property manager's certificate for the sale) is stored, checked on
  save (`checkLinks`) and counted (`classify.ts`), and the object page lists such vouchers under
  each sale - but no screen sets it. The edit page keeps a stored value (`{ ...doc }`) without
  showing it. Today only costs matched automatically (same cost account within 180 days of the
  sale) reach Myyntikulut; anything else stays in Kulut.
- Owner: not needed now; note it so it is not forgotten. When wanted: a "Myyntitositteet" section on
  `#/property/{id}/edit` that picks posted vouchers with lines on the object's cost centre.

## 2026-10-10 - Rental objects: lines left uncorrected on purpose

- Owner decision (kept): a closed year's income/cost misclassification is not corrected in the
  open year. The owner's importer now lists such lines in its correction voucher's notes as
  `[hki:omit:<Vienti.id>:tili=<account>]`; Tilari counts them on that account (ADR-024), so an
  object's month shows the charge as a cost instead of negative rent. Kitsas column unchanged.
- Found on the way: a housing company's refund (water settlement) shows as a cost bar above zero
  when the month's own charge is the misbooked line; with the line recounted the bar is normal.

## 2026-10-10 - Rental objects: an item sold inside another object's price

- Owner report: a flat and its parking space sold on one voucher for one price (the parking space
  at 0 in the contract), the price and the cost of both items booked on the flat's cost centre.
  The parking space showed its book value as proceeds and negative sale costs; the flat showed
  that book value as an extra sale cost. The pair's total was right.
- Rule (`classify.ts`, `saleShares`): on a voucher crediting items of several objects, an object
  with no P&L lines of its own there, next to one that has them, brings in nothing and gets the
  `sale_carried` note; its credit goes with the objects that have lines (pro rata to their own
  credits). Its book value becomes its loss on sale. Unchanged when every object has lines, or
  none (unallocated lines are still split by credit, `sale_line_split`).
- The fix is in Tilari, not the books: the year was closed, and a correction pair in a later year
  would read as running costs and income, not as part of the sale.
- Setup (`suggest.ts`): such a sale voucher no longer decides on its own. Before, its lines on
  one object made setup suggest the parking space's item for the flat. When the voucher credits
  other items too, the item's own evidence (cost centre on its lines, its voucher, its text)
  decides first, and the object with the sale lines only when nothing does. On a real book only
  the two items of that sale changed (the parking space now by its own name).
- Owner review: from a sale on the object page there was no way to the sale-cost voucher (only
  the sale voucher's date was a link). Each sale now lists the other vouchers whose lines counted
  as its costs (`Disposal.cost_vouchers`: listed or matched near the sale). The section shows
  each sale as rows Myyntihinta / Myyntikulut / Käteen, every amount next to its voucher link
  (number and title); several cost vouchers get one row each under the total. On a phone the
  voucher goes on its own line.

## 2026-10-09 - Rental object: a month's lines; one loan per object

- Clicking a month on the object's cash-flow chart opens the lines behind its bars under the
  chart (`PropertyDetail.month_lines`, Selaus rows plus the net amount and the date each counts
  on). They add up to the bars by construction: corrections on their corrected booking's date,
  year-end accruals as booked, and bank-loan interest without a cost centre. The bar tooltip
  lists the first lines. The month is in the URL (`#/property/{id}/month/{YYYY-MM}`) and survives
  opening a voucher; the panel links to `#/allocation/{id}/month/{YYYY-MM}`, which opens the
  cost-centre page in Kuukausi mode. The two can differ on purpose (booking dates, cost centre only).
- A loan account can be one object's Pankkilaina only: saving it on a second object is refused
  (`loan_linked`); a file saved before that shows `loan_shared` on both. Before this, both objects
  counted all of the loan's interest and the portfolio total counted it twice. Setup never changes
  loans and is not blocked by an older double link.
- Owner review: hover text on a table row should show the cell's full text, not "Avaa tosite".
  `showCutText` sets the title only on cells (or spans) actually cut off, on every resizable table:
  `SortableTable`, Selaa Viennit and Tositteet, the statement editor.

## 2026-10-09 - Cost-centre page uses the shared tables

- Rental objects phase 1 pushed after the owner's review: PR #26 (`feature/properties-core`)
  and PR #27 (`feature/properties-ui`, stacked on it). Test names were replaced with made-up
  ones before the push; the unscrubbed local commits are kept as `archive/properties-*-unscrubbed`.
- `#/allocation/{id}`: account totals in `SortableTable`; the lines are the Selaus Viennit rows
  (`selectBrowseEntries` with a cost-centre WHERE) in `BrowseEntriesTable` with its own column
  widths, so status, attachments, balance-sheet item and VAT show as in Selaa. Partner now comes
  from the voucher when the line has none, as in Selaa.
- Fixed: an item reference and a cost-centre name in the Kohdennus column ran together (the flex
  gap does not separate adjacent text nodes).

## 2026-10-08 - Rental objects (vuokrakohteet), phase 1, local branches only

- Branches `feature/properties-core` (book module, TilariData, ADR-023) and
  `feature/properties-ui` (screens) on top of each other; not pushed until the owner has
  reviewed them locally.
- Storage decided with the owner: one Tilari table `TilariData` (key -> JSON). Checked in
  kitupiikki: the cost-centre dialog rebuilds `Kohdennus.json` on OK, and the developer-tool
  chart export copies every `Asetus` key into a `.kitsaskartta`. Cloud upload is not a concern.
- Sale lines are found without account numbers (a voucher that credits a linked item and has
  P&L lines); bank statements are never disposals (a refund can sit next to other rent).
- "Data through" is the latest bank-statement voucher date: Kitsas dates a statement at its
  period end, while its last transaction is often days earlier.
- Name-based setup suggestions need a shared word: statement titles with dates matched unit
  numbers in cost-centre names on a real book. Words also match in another case (prefix of 5+
  letters: Kuopio/Kuopion), and a name that matches everything a close rival does plus its unit
  number wins (F 44 over F 48); two flats named only by their housing company stay undecided.
- Checked on a copy of a real book (pass/fail only): every object's per-year result equals the
  Kitsas cost-centre report; linked share items equal the 1453 balance, and 1441 once the
  ambiguous items (two flats in one housing company) are chosen; desktop-Kitsas open/edit/backup
  of a file with `TilariData` still to be confirmed by the owner.

## 2026-10-07 - Part C merged (PRs #16-#24)

- The part C stack below is merged into `main` in order, plus `fix/firefox-leave-guard` (#24),
  which fixes defects found by the release e2e run (all also on the old `main`):
  - Leave guard: a blocked Back/Forward returns to its exact history entry (entries carry an
    index in `history.state`). Before, Firefox's asynchronous `history.go` let a fallback
    `replaceState` overwrite the previous entry, so the next Back stayed in the editor.
  - Native picker: `is-native-picker-open` was never removed (removal re-tested the overflow the
    class itself sets), so after the first date picker the attachment row could cover Tallenna.
  - Desktop e2e: the HTTP engine is offered only with a connected same-origin locker, which saves
    through `/api/objects`; tests connect "Tämä kone" first.
- Using tilari on the owner's working book (posting/editing imported vouchers) is still the
  owner's call.

## 2026-10-07 - Part C: review fixes as a PR stack (merge in this order)

A review of main `45788e6` against Kitsas (kitupiikki devel `b081bfa3`) found C1/C2 plus defects
in write guards, VAT, reports, persistence and the Node server. Fixed on stacked branches, each
with tests and checked on a copy of a real book (entries below):

1. `fix/locker-server-safety` - server book ids, origins, Host, body limit, atomic writes
2. `fix/save-round-trip` - C1
3. `fix/numbering` - C2
4. `fix/write-guards` - VAT-filed lock, line dates, split, year end
5. `fix/vat-like-kitsas` - VAT calculation, settlement and VAT lines
6. `fix/reports-like-kitsas` - chart reports, opening macros, account ledger
7. `fix/persistence` - saves, uploads, overwrites, two tabs, encryption
8. `docs/part-c` - this entry

Dropped after checking: kohdennus usage count (Kitsas counts the same way); deleting a VAT return
(Kitsas' ALV page allows it). Not done: alarajahuojennus (boxes 315-317, abolished from 2025);
an app login for the Node server (put a public hostname behind Cloudflare Access).

## 2026-10-07 - Persistence on `fix/persistence` (stacked on `fix/reports-like-kitsas`)

- Download/Save-as of a locker book or a linked-file book is only a copy: it no longer marks the
  book saved (before, the next locker save was skipped and reported as saved).
- Attachments found inside a shelf ledger (Liite.data) on open/restore/reload, and ones written
  inline during the session (VAT/TP HTML), are uploaded with the next locker save.
- Kitsas-file export refuses (`attachments_missing`) while attachment bytes are missing; the HTTP
  engine's download packs locker attachments (`/api/export?pack=1`).
- Linking a file refuses one that changed after the copy was opened or holds another company's
  book; `saveLocal` re-checks the file time.
- No blind ETag: a missing ETag is adopted only if the shelf has not changed since the session
  loaded it (wasm and HTTP engine); reload-from-locker takes the fresh ETags.
- Node object store: ETags on GET/upload and atomic `If-Match` on the ledger write, so two
  concurrent saves cannot both win; GC spares blobs younger than 15 min (a save in progress);
  a deleted book's own blobs still go at once. Supabase has no conditional write (documented).
- One writer per working copy (Web Lock per book); a restore that finishes after another open no
  longer replaces it; latest OPFS session by save time; clean old sessions pruned on open.
- Encrypted shelves: v2 envelope binds ciphertext to its object path (GCM additional data); v1
  still read. The HTTP object locker no longer re-derives the vault key on every call.

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
- Bank-file import is out of scope here; `tilari-bank-import` (sibling project, formerly
  `holvi-kitsas-import`) creates draft vouchers that are reviewed and posted in tilari. C1 and C2
  are fixed on `main` (part C, merged 2026-10-07); until the owner says so, do not post or edit
  imported vouchers in tilari on a production book.
