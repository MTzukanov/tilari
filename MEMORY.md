# MEMORY - Tilari

Dated log of findings and decisions that are not obvious from the code. Newest first.
Agent guide: [AGENTS.md](AGENTS.md).

This repo is public: keep book contents (company names, amounts, counterparties) out of this file.

---

## 2026-11-20 - Rental objects: the loan share on the payback chart, still to recover in percent (`feature/charts-share-percent`)

- Owner's picks from the chart options: B as recommended (not an object picker on the combined chart, which the
  object page's payback chart already covers, but the loan share added to that chart, dashed) and D (the
  Properties page's unrecovered chart as a percentage, behind a remembered checkbox, off by default).
- The percentage is an object's still to recover over its own capital put in so far (`PortfolioChart.objects[]
  .invested_snt`, the same months as its unrecovered line); the total line uses the combined chart's totals, so it
  is total unrecovered over total invested. 100 % at the purchase, 0 % paid back, below 0 a gain; a sale drops a
  line at its last month. `LineChart` takes a `tickFormat` for values that are not cents (basis points here).
- `testdb/tilari-properties-loans.kitsas` (owner's ask, for demos): the invented book with two loans stored, built
  by `npm run build:testdb:properties` with the other one. The rebuild rewrites `tilari-properties.kitsas` too,
  but only its creation time, UID and attachment times change (the fixture is not fixed in time): left out of
  commits unless the fixture changed.

## 2026-11-19 - Rental objects: the Properties page's totals on one chart (`feature/portfolio-summary-chart`)

- Owner's ask (option A of four): the measures on one chart, to see whether the money comes back. "Yhteiskaavio"
  (a remembered checkbox, on by default) draws first: Sijoitettu, Takaisin saatu (cash flow and sale proceeds),
  Palauttamatta and Yhtiölainaosuudet (dashed), totals only, on one scale.
- All its lines count the objects the unrecovered total counts - linked to an investment, until their sale -
  so Sijoitettu less Takaisin saatu is Palauttamatta every month (`testBook.test.ts` checks it). A first try
  kept a sold object's capital in Sijoitettu and left sale proceeds out of the cash line: the gap then showed
  neither what was left to recover nor the sale, so it was dropped. A sale steps all the lines down.
- Not built (owner to decide): an object picker on it (B), and still to recover as a % of what each object
  needed (D).

## 2026-11-19 - Rental objects: chart checkboxes in columns, all or none, the defaults form lined up (`feature/portfolio-chart-legends`)

- Owner's look at the Properties page. The defaults form's euro field stood higher than the two beside it and
  looked different. Cause: the form (`details.property-defaults`) sat outside every container the app's
  form-input rule lists (`.property-section`, `.editor`, the card forms), so its text inputs got the browser's
  look (white, 2 px grey border, about 21 px tall). `EuroInput` brings `.amount-input`, which is in that same
  rule (tinted `#fffef9`, 1 px border, 2.15rem). The grid lines up the bottoms of its fields
  (`align-items: end`), so the taller field's label rose. Fix: the defaults form is now in the rule, and its
  three fields look like Talous's "Myynti ja tavoite". The tint is how every editable field looks, not a mark
  of money. Right-aligned amounts are the money mark (the placeholder "0,00" too), and they stay.
- Owner: checkboxes one under another, in equal columns when there is room. The portfolio, cash-flow and loan
  legends are `.legend-columns`: CSS columns at least 13rem wide, as many as fit, filled top to bottom.
  Each row is the click target (a tint on hover, 2.5rem tall on a touch screen). With few rows the balanced
  columns put one item in each, so a short legend reads as a single row. The payback chart's legend has no
  checkboxes and stays inline. The loan chart's two lines that are always drawn sit in its columns, without
  a box.
- The portfolio chart has "Kaikki yhteensä" and "Kaikki kuukaudet" on top. Below them, "Kohteet" with "Valitse
  kaikki" and "Poista valinnat" (disabled when they would change nothing). These two act on the objects'
  lines only (`hidden` empty, or every object's id). The total is a line of its own and the months are a
  range, so neither is touched. The stored options keep their shape.
- Chart order, owner's wish: "Palauttamatta kuukauden lopussa" first, then "Kertynyt kassavirta" under it, to
  see the two meet or part, then the shares. The lead's sentence on a sold object follows that order.

## 2026-11-19 - Rental objects: the loan share in the figures (`feature/housing-loans-figures`, ADR-034, step 4c)

- The share at the as-of month (`housing_share_snt`) is followed in `computeObjects` once per object
  (`followLoans`, kept on `Computed.loans`; reminders and the Taloyhtiö tab reuse it). It is null rather than a
  partial sum when one loan's path does not reach that month, so a debt-free figure never leaves a loan out quietly.
- Sale costs are a percentage of the debt-free price (owner): an object with a share is computed again
  (`computeObject` with `housingShare`) once the loans are followed, since the share needs the payments and the
  purchase the first pass finds; the share does not change those.
- The view "Rahastoitu rahoitusvastike pääomana" was built here and taken out before merging, as the owner asked if
  it added complexity (no rahastoitu vastike seen; it needed made-up cost rows and a second pass). The charge's
  checkbox and warning stay.
- Found on the way, not from this step: at 360 px the Talous tab scrolled sideways (up to 38 px in the test book)
  where the acquisition-cost movements hold a long Finnish compound - a word does not wrap, and the date and kind
  columns kept their widths. On a phone a movement now takes two lines (date, kind, amount; then its text), a grid
  over the table rows; the old phone check ran on the golden book, whose texts are short.

## 2026-11-19 - Rental objects: lease and water cards as figure tiles (`feature/lease-water-tiles`)

- The owner liked the loan card's tiles and found the lease and water cards text-heavy. `Figure`, `Figures` and
  `Folds` moved out of `HousingPanel.tsx` into `ui/FigureTiles.tsx`, and their CSS has generic names
  (`.property-figure*`, `.property-fold*`); the loan card renders the same. Two changes reach it too: a file's pill
  in a tile is cut, not wrapped into a blob, and a tile narrower than 10rem (a `figure` container query) shows a
  voucher's date without its number, as a document line does on a phone.
- The running lease's card: Vuokra (€/kk, its parts, VAT, due day), "Nyt poikkeava vuokra" (an exception in force,
  as a tile, not a sentence), Vuokrarästi / Maksettu ennakkoon / Vuokrasaldo on the as-of date (arrears red, the
  "laskettu ... alkaen" reasons under it), Seuraava korotus (the next stored step, its rise and notice) or Korotus
  (the clause, its month, the last increase), Vesi, Vesitasaus (the latest share with its pill), Vuokravakuus (the
  balance, received, returned) and Sopimus (the slot's pills, "Asiakirja puuttuu" while held). The months, the
  increases, the exceptions and the deposit's bookings fold as small tabs; a missing document marks its tab with
  a red dot instead of a pill in a `<details>` summary. `RentMonths` was split out of `RentAccountView`; ended
  leases stay list rows with the sentence and `<details>`.
- A water settlement's card: Taloyhtiön hyvitys / lisälasku (use, advances, "ei löydy kirjanpidosta"),
  Tasauslaskelma, a tile per tenant's share (balance, stay, status pill, letter) and Omistajalle jää / Omistaja
  maksaa itse. The booked lines (the company's, each tenant's, others) fold as "Kirjaukset", by whose they are.
- Dropped as unused: `increaseText`, `exceptionText` and the keys `properties.lease.increase.*`,
  `properties.water.company`, `ownerKeeps`, `ownerBears`.
- 2026-11-20, owner's look: the ended and upcoming leases are the same cards too, under "Muut vuokrasopimukset",
  quieter (`.is-other`: no white box, smaller figures), with their Muokkaa, folds and missing-document marks (the
  reminders ask for every stored lease's documents, so the marks match). `RentAccountView` and `DepositSummary`
  went with the list rows; the suggestions keep their rows. Text that only said what the cards show went (the
  suggestion banners' leads, the month table's "*" footnote, the exception form's "check the days" line); facts
  the owner wants went behind an "i" (`InfoButton`, the loan card's, now shared): the exception form's note on the
  prefill or the change, and why the owner keeps or bears a water settlement's difference. On a phone the exception
  form stays in view inside its scrolling month table (sticky, at the width shown), so its "i" is reachable.
- Seen while testing, not fixed here: right after saving a voucher, changing the address to `#/voucher/new/200`
  (no other page between) refused the next save with "Virheellinen viennin id N"; the new form seems to keep the
  saved voucher's line ids. Opened via another page, the same voucher saves.

## 2026-11-17 - Rental objects: a loan's share month by month (`feature/housing-loans-month`, ADR-034, step 4b)

- `loanPath` (`domain/housingLoan.ts`) follows each loan's share from its certificates and the payments to the
  housing company (`housingPayments`, `domain/water.ts`, next to `housingCompanyPartners`); the card shows the
  computed share at the path's end with what twelve months repaid and paid as interest, and folds a chart and a
  month table (payments as line links, rahoitusvastike, interest, repaid, share; certificate rows with the gap
  and the implied rate). Interest is monthly on the share at the month's start (`share * pcm / 1 200 000`).
- A month's payment count is its total over the regular amount, rounded: chosen over counting repeating amounts
  only, which flagged a raised vastike as missing until it repeated, and over counting every line, which took a
  water invoice for a second payment.
- The path ends at the as-of month (data through), or at a later certificate; payments missing are counted to the
  as-of month only, so months the book has not imported yet do not warn.
- The invented fixture's vastike lines now name their housing company ("As Oy Esimerkkikatu 1", "As Oy Mallitie
  2"), so the test book has payments to follow; `testdb/tilari-properties.kitsas` was rebuilt.
- Owner's look at the cards: two loan cards ran together. Cards after cards (leases, settlements, loans) now keep
  1rem apart. The month table scrolls on its own on a phone.
- 2026-11-18, owner's second look: the green left bar of the cards meant nothing (it came with the first lease
  cards; green is "done" elsewhere), and a bar alone did not show where a card ends. A card in view is now a white
  box with a border, like a binder (`.property-lease-card`); a card in edit stays the form's own tinted box.
- The loan chart has a point per month (`LineSeries.dots: 'spaced'`: only while points are 6 px apart) and
  `LineChart`'s `pointTip`: pointing at a month shows its figures in a box beside it; a click, a tap or the arrow
  keys pick it (solid guide line, row marked in the table). Under 480 px the picked month's figures go under the
  chart, since a box beside the point does not fit.
- Owner, same day: the same on the other line charts. The payback chart and both portfolio charts use `pointTip`
  (the portfolio's rows carry each object's colour); `columnTitle` (native hover titles) is gone.
- Owner, same day: the loan card read "like a novel". Its figures are now tiles (`.property-loan-figures`: the
  share - computed at the path's end, with the certificate under it -, repaid in the last 12 months with the
  interest, the rahoitusvastike, the rate, the term), two a row on a phone. The note that no payments were found
  became an "i" by the share (hover title; a click shows it under the tiles), reworded to say what it means:
  the calculation assumes each month's rahoitusvastike was paid. The lists (months, shares, charges, rates,
  events) are one row of buttons, one open at a time.
- Owner, later: the list buttons are small tabs (like the page's, with the count beside the name; the page's
  `Tabs` is sticky, so not reused), an open list has no line under its last row, "Lyhennetty yhteensä" counts
  from the path's first month (the later of purchase, loan start, books' start, first charge: the span is under
  the figure), and the chart has "Arvio laina-ajan loppuun" (`loanForecast`, ADR-034; remembered in this browser,
  `tilari.properties.loanChart`): a dashed line to the end and the months summed by year. The rate is held at
  the latest until the rate estimates per reference rate exist.
- Owner: "Korko yhteensä" and "Lyhennys + korko yhteensä" as lines (summed, so they share the share's scale), all
  three choices remembered; the chart's how-to line is gone. The owner asked whether the annuity is right since its
  line looked straight: it is - over a few years at ~4 % an annuity's share sags only a few thousand euros above a
  straight line (about 4 px); a unit test now pins falling interest and growing repayment month by month.

## 2026-11-17 - Rental objects: housing-company loans on a Taloyhtiö tab (`feature/housing-loans`, ADR-034)

- Owner's step 4 (loan share and rahoitusvastike), planned in increments 4a-4e. Decisions: a loan belongs to the
  object, no housing-company record; a loan can be copied from another object of the same company (the copy keeps
  the original's `group`); the share is followed month by month from the payments to the housing company, not the
  bank's schedule, anchored to certificates; actual reference rates by hand on the loan, estimates for the future
  as one curve per reference rate in the Properties defaults (4d); a "Rahastoitu" checkbox per rahoitusvastike
  period, tuloutettu by default, with a later view option to count rahastoitu charges as capital; no ledger change -
  tilari-bank-import will read the vastike invoices into facts on the voucher (4e).
- 4a, built here: `housing_loans[]` and `housing_doc_voucher_ids` on the object (DATA_MODEL.md), the Taloyhtiö tab
  (`housing`; cards `/housing/new`, `/housing/loan/{key}`) with the company's documents (linked, uploaded, and every
  voucher a loan links, marked with what it is for) and loan cards edited in place; "+ Yhtiölaina" on the overview.
  Copy sources list every other object's loans, those paying one of this object's housing-company partners first
  (`housingCompanyPartners`, taken out of `statementSuspects`). Rates are in 1/1000 % (`*_pcm`).
- Reminders while held: `loan_share_missing`, `loan_certificate_stale` (12 months), `loan_certificate_missing` and
  `loan_charge_notice_missing` (skippable, ADR-030 kinds `loan_certificate` / `loan_charge`).
- A certificate uploaded on a card is dated today, like the other documents Tilari writes; its own date is the row's.
- Fixed, owner's review: the forms edited in place (lease, water and loan cards, Talous sections, rent days) had
  the browser's own inputs since #75 moved them out of `.property-edit`, the container the shared input style
  (`App.css`, with `.editor`) was scoped to. The style now lists `.property-lease-card-edit`, `.property-section`
  and `.property-rent-dates-edit` too; a `.property-form-row`'s unlabelled inputs share the line instead of filling it.
- Owner: an empty loan form saved with only "Tarkista: Laina." A refused save now marks every field to fix
  (`field-invalid` + `aria-invalid`, the reason in its label: "Nostettu · puuttuu"), lists them above the buttons and
  focuses the first; the marks follow the form until it saves (`buildLoan` returns `LoanIssue[]`). The lease and water
  cards still show one line (`saveErrorText`): the same treatment there is a later step if wanted.
- Owner's second look: the card said "no share" with a share entered. The page's as-of date follows the booked
  months (end of the last whole one), and the rows were dated after it; the card and the reminders now read loans
  on `loanDay(asOf, today)`, the later of the two, and fall back to the newest share and the next rows (`loanNow`).
- Owner: more fields are required - what the share's monthly path and the forecast need (ADR-034 "What a loan
  needs"). A new loan opens with one row each for its share, rahoitusvastike and rate; a copy brings its rate and
  asks for the object's own share and rahoitusvastike. A fixed rate hides margin and reset interval.
- English: lyhennysvapaa is "interest-only period", not "repayment holiday" (owner).
- Owner's third look: the lease and water cards mark their fields the same way. The parts are shared:
  `formIssues.ts` (`FormIssue`, `issueCollector`, `invalidProps`, `useIssueFocus`) and `Field` / `FormIssueList` in
  `FormParts.tsx`, texts under `properties.form.*`. `buildLeases` / `buildSettlements` return the leases or
  `{ issues }` with fields `{lease key}.{field}` (`leaseField`) / `{settlement key or new}.{field}`
  (`settlementField`); an overlap marks both leases' (settlements') dates, and a card keeps only its own issues
  unless they are all there is. The old one-sentence `properties.error.leaseOverlap` etc. are gone. The rules are
  unchanged, except that a tenant typed without a start now asks for the start instead of failing at the save.
- The "Puuttuu" pill of an empty document slot said nothing of what was missing: `properties.docs.absent` is now
  "Asiakirja puuttuu". The warnings list's word pill ("Puuttuu" beside its sentence) stays.
- The company's whole loan (`total_snt`) stays optional (owner).

## 2026-11-15 - Test book with rental-object investments (`testdb/tilari-properties.kitsas`)

- Owner asked for a book with an acquisition: the golden `tilari-test.kitsas` links none, so neither payback chart
  was ever drawn in e2e. Rather than change the golden book (its figures are in `expected.ts`), a second book is
  generated from the invented unit-test fixture (`buildPropertyFixture`) with its suggested links applied
  (`properties/testBook.test.ts`; `npm run build:testdb:properties` writes it, every run checks the committed file
  still opens with linked objects and that the chart's unrecovered total ends at the page figure).
- e2e opens it with `openBook(page, propertiesBook, 'Esimerkki Vuokraus Oy')`.
- Seen on it: the line charts cut the last month's label in half at the right edge; a label near the edge now ends
  at its point. Two of the eight hues (slots 2 and 8, orange-red and red) are close on a long legend; they pass the
  validator as non-adjacent slots and the legend names them.

## 2026-11-15 - Rental objects: the Properties page's charts per object

- Owner chose two charts, not one, and "Palauttamatta" as the investment measure: "Kertynyt kassavirta" and
  "Palauttamatta kuukauden lopussa", a coloured line per object and a thick black "Kaikki yhteensä", with one row
  of checkboxes for both (`ui/PortfolioCharts.tsx`, under "Omistuksessa"). One chart was ruled out by scale:
  tens of thousands to recover beside a few hundred of cash flow flattens the cash lines.
- Data: `PortfolioResponse.chart` (`portfolioChart` in `domain/series.ts`) puts each object's own months on one month
  axis, null outside them. The total counts every object whatever is unchecked. A sold object's cash flow stays
  in the cash total after its sale; it leaves the unrecovered total from its sale month, so the line ends at the
  "Palauttamatta" KPI (held objects only). An object with no investment linked (`unlinked`) has a cash line and
  no unrecovered line; with none invested the unrecovered chart is not shown (the golden book).
- Colours: the dataviz skill's eight categorical hues in fixed order by the object's place in the chart (hiding one
  repaints none), validated on white; a 9th object repeats them dashed. Three are under 3:1 on the surface, so
  every line has its name in the legend and the month hover lists the values (a column-wide `<title>`).
- Choices (hidden objects, total, all months) are kept in this browser (`tilari.properties.portfolioChart`), by
  object id, not per book.

## 2026-11-15 - Rental objects: the cumulative cash flow on the payback chart

- Owner: the lower chart ("Palauttamatta kuukauden lopussa") gets the cash flow line too. It now draws
  "Palauttamatta" and "Kertynyt kassavirta" (the upper chart's running total, `runningTotals`) on one axis, with a
  legend; heading "Kuukauden lopussa: palauttamatta ja kertynyt kassavirta". Both are always shown, over all months.
- `shared/LineChart.tsx` draws any number of money lines (built for the planned portfolio chart, one line per object).
  Its ticks share one step (`lineTicks`): the old payback ticks were -niceMax(min), 0, max/2, max, so a small
  negative part put its tick 3px under zero. Hover titles are one string: mixed JSX children in an SVG `<title>`
  rendered empty.
- On a large object the running cash flow hugs zero beside the unrecovered money; that is the honest scale.

## 2026-11-15 - Rental objects: the object page in tabs (`feature/property-tabs`)

- Owner: the object page and its edit page needed too much scrolling and were hard to move around in. Agreed
  (plan, 2026-11-15): tabs that switch content, with the tab in the address. The view has Yleiskatsaus, Vuokrasuhteet,
  Vesimaksut, Asiakirjat and Talous (all the figures on one tab). The edit page gets the same tabs (Perustiedot
  for the overview). Extras: folded lease and settlement cards in edit, overview quick actions that add a row,
  warning tiles that open their lease, and counts and marks on tabs.
- The company page's lesson ("one page", ADR-031) holds: a closed tab must not hide a problem. Each tab shows a
  count and a dot in the tone of its worst warning (`WARNING_TABS`/`tabMarks` in `ui/format.ts`; a note marks
  nothing, a dated reminder is warn and crit once late), and the overview keeps every warning.
- Step 1, the view: the overview has the quick actions at its top (owner: not at the bottom), the warnings,
  "Vuokrasuhde nyt" and "Vesi" cards, four key figures (rent balance, 12 months, IRR, still to recover) and the
  cash flow and payback charts (owner moved them from Talous), so a month (`/month/{YYYY-MM}`) opens there.
  Talous has the other key figures, the years, the break-even price, the acquisition cost and the sales; the rent
  balance is not repeated there. Each tab has its own "+" in its panel's title row (leases, water, documents,
  price estimate). The documents' query moved up to the page for the tab's count.
- Phone (owner's screenshot at a large text size): file pills ran past the card (`a.pill-doc`'s 20rem beat the
  pill's 100%), and so did grids with a rem minimum (overview cards, due tiles) and the warnings' text column.
  The text size is CSS `zoom`, so bounding boxes look fine while the workspace scrolls sideways: test with
  `scrollWidth - clientWidth` on `main.workspace` (e2e "rental object on a phone", 137.5 %, 360px). Under 640px
  the tabs wrap into chips and are not pinned (four rows at 137.5 % would cover the screen); a warning's pill
  goes above its sentence. Vertical tabs were the owner's idea; wrapping keeps them all in sight in less room.
- The dated tiles carry the lease they are about (`Warning.lease_key`, computed, never stored) and open
  that lease's card in edit (`#/property/{id}/leases/lease/{key}`; the edit page's `/edit/leases/lease/{key}`
  still parses until the page goes).
- Owner, later the same day: no tabbed edit page. The edit page repeats every lease, settlement and document,
  so editing moves into the view, per card: a lease card's "Muokkaa" turns only that card into its form with its
  own Tallenna and Peruuta, and a card save writes the doc with only that card changed (as rent exceptions and
  "Ohita" already do). Order: leases, water, then documents, Talous and the basics; the edit page goes last.
- Edit in place, step 1 (leases): `LeaseCardEdit` is the edit page's `LeasesEditor` with one draft (`single`:
  no suggestion banner, no "Lisää vuokrasopimus"; `otherDrafts` so a deposit already on another lease is not
  offered). The save builds every lease with the card's draft in its place, so an overlap shows on the card.
  Documents a card writes go through `useDocWriter`; `PropertyEdit` keeps its own copy until it is removed
  (deliberate, short-lived duplication). One card open at a time; another asks first when the open one has
  changes. The open card is in the address (`/leases/new`, `/leases/lease/{key}`) and in a voucher's way
  back; its unsaved form is kept in sessionStorage (`tilari.properties.cardDraft`) and restored only when the
  card opens from the address. The suggestions' "Tarkista" became a "Lisää" per row that opens a prefilled card.
  The rent days (`rent_from`/`rent_until`) have their own small Muokkaa under the Vuokrasuhteet title, also on
  a sold object (the last day matters after a sale), not on a read-only book.
- Owner's review of step 1: editing happens in one place. The edit page lost the leases and the rent days
  (water there shares with the stored leases); its old `/edit/leases[/new|/lease/{key}]` addresses open the
  view's tab or card, and "Muokkaa kohdetta" from the leases tab opens the basics. The lease card in force had
  only "Lisää korotus tai poikkeava vuokra…" as its way into the form, so the owner took "Muokkaa kohdetta" and
  landed on the edit page: every lease card now has a plain "Muokkaa". Two faults the e2e rewrite showed: the
  card's inputs (documents to pick, partners) were loaded once, so a document written on one card was missing
  on the next (now reloaded per card), and the Asiakirjat list was not refreshed after a card save (now is).
- Owner, after trying leases: suggestions go at the top of the tab, before a new card's form; and water,
  documents and Talous are edited where they are shown too, so the edit page stays short and general. Water
  settlements are cards like leases (`WaterCardEdit`; `/water/new`, `/water/settlement/{key}`); a card's views
  and statement guesses count the object's other settlements (`WaterEditor` `otherDrafts`). Asiakirjat links
  with a picker at the top and unlinks with "Poista linkki"; a document a lease, settlement or sale holds has
  no unlink there (a save would link it again: `leaseVoucherIds`/`waterVoucherIds` go into `doc_voucher_ids`).
  Talous sections each have a Muokkaa (`FinanceEdits.tsx`). The edit page keeps kind, "Ei mukana", note and
  delete; it opens no vouchers, so its unsaved-form storage and the `propertyEdit` voucher way back are gone.
- Owner: no "Myyntikuluja ei ole asetettu" warning. Sale costs not set are none (0 % and 0 €), overridden per
  object or in the defaults; `sale_costs_unset`, `BreakEven.costs_set` and the portfolio's † are gone.

## 2026-11-15 - Rental objects: document rows line up by the inputs (`fix/lease-row-align`)

- Owner: on the lease form, Eräpäivä and "Lataa sopimus" sat lower than the Sopimus pick. The notice rows
  (`.property-lease-notice`: contract, increase notice, exception, water statement and letter, the rent
  exception form) aligned to the bottom, and a picked document's file pill wraps under the pick, so the pill's
  bottom set the line.
- The rows now align to the top. Each row's buttons (and "Ei asiakirjaa") sit in one `.property-lease-actions`
  group that skips a label's line and has inputs' height, so a button that wraps stays inside the group, beside
  the fields, instead of dropping below the pill with an empty label's space. Above 900px (the side menu's width)
  the row does not wrap; the group shrinks and its buttons stack, right-aligned, which can leave space between
  the pick and the buttons. At 900px and below the group takes its own line. The lease's first grid aligns
  to the top when it has the notice beside Eräpäivä (`:has(> .property-lease-notice.span-3)`).

## 2026-11-14 - Rental objects: a water statement can be the housing company's invoice (`feature/water-statement-guess`, ADR-025)

- Owner reported: an extra water charge paid as a plain invoice (an expense voucher with the vastike's reference;
  "water" only in its PDF) could not be picked as the settlement's statement. The picker listed Liitetieto only
  (`listNoteVouchers`); nothing else required it (storage and reminders take any voucher).
- The statement picker now also offers the object's vouchers with expense lines and files, bank statements left
  out (`WaterDetail.statement_candidates`). Linked, such a voucher's expense lines are the settlement's company
  lines (`waterLines(rows, settlements)`, `WaterLine.statement`), never a tenant's; `draftSettlement` carries the
  picked voucher so the form shows them as booked before saving.
- Stars: an exact match to the difference first; else `statementSuspects`, the owner's suggestion: payments to the
  partner the object pays repeating amounts (the housing company) that are not the vastike, the vastike's own
  reference first. Checked read-only in the owner's book (no copy): some companies keep one reference for years
  (a new one when the property manager changes), others send a new one every month, and statement-imported lines
  carry none, so an amount never repeated is the fallback. Too many hits to remind of: guesses only order the list.
- `loadCorrectionDates` became `loadCorrections`: the line that takes a booking away gets `reverses`. Both sides
  (`Computed.reversed`) stay out of the suspects and candidates; the owner's misallocated vastike payments that
  the reference found were already moved by bank-import's correction voucher, which Tilari pairs this way.
- `DocPicker` labels show the Kitsas number (`date · 12/2025 · title`), so a voucher can be searched by number.
- Owner's review on the real book: the guesses found the right invoices; asked for the amount in the list and for
  a pick to fill what it can. Rows of vouchers with the object's lines show their amount as booked (`−` for a
  charge, as "Kirjattu"). A pick fills the amount and charge/refund from the lines and an estimated period
  (`statementPeriod`): the period a water text names; else the year after the form's latest earlier settlement
  when the voucher is within 400 days of its end; else the year up to the month before (as suggestions). Only
  fields the owner left empty, or that the previous pick filled, change; "–" clears what a pick filled. A note
  says the period is an estimate while it is unchanged.
- Left out: a warning for a line with another object's reference (owner declined 2026-11-15), `Tosite.viite`
  (rarely filled), and an invoice moved onto the object by a correction is not offered there (the correction
  voucher has no file).

## 2026-11-14 - Rental objects: a parking space offers no water or parking extra (`feature/parking-objects`)

- Owner: a parking space should not be offered an extra parking space or water. On kind `parking` or `garage`
  (`isParkingKind`) lease suggestions count every line as rent (water-only lines too), the lease form hides the
  "Lisät: Autopaikka" extra, the water amounts and "Vesimaksu tasataan", the rent account's exception form hides
  water, and the water settlements are neither suggested (`water_suggestions`) nor shown as an empty section.
  Amounts or settlements already stored stay visible (`draftExtras` reads the stored lease). ADR-025 amended.
  The "ALV" checkbox (VAT leases, ADR-033) stays on parking objects: a parking space can be let with VAT.
- Decided 2026-11-14: a parking space rented with a flat for a while (one payment for both on the flat's cost
  centre) is split in tilari-bank-import (rule key `split`, its PR #15): the parking's part of each payment is
  booked on the parking's own cost centre, so Tilari needs nothing for it; each object has its own lease.

## 2026-11-14 - Rental objects: VAT leases (`feature/lease-vat`, ADR-033)

- Owner: VAT rent invoiced from Holvi reaches the book at payment; the payment is split into a net income line and
  a VAT row on 2939. The rent account saw only the net line (the VAT row has no cost centre), so it could not be
  followed with VAT. Checked read-only in the owner's book (counts only): every VAT-coded rent line is code 11
  with its 2939 row at `rivi + 1`, same partner and rate; none is invoiced on 1701.
- A lease gets `vat: true` ("ALV" in Lisät). Its rent account counts with VAT: expected VAT at the day's general
  rate, received = each line + its own VAT row (`ledger.ts pairVatRows`). Four computed warnings
  (`rent_vat_missing`, `_unexpected`, `_row_missing`, `_rate`); the month marks the line with ⚠.
- The property fixture's netto rent lines now have their VAT rows, as real books do. `format.test.ts` skips `_one`
  keys when it matches warning codes to `WARNING_WORDS`.
- Still to confirm in the demo: the expected VAT rounds rent, water and parking each on its own, like invoice rows;
  if the owner's invoices round the total instead, a lease with several parts can differ by a cent.
- Seen while testing, not from this change: `company.spec.ts` "a slot can be marked not needed, and a deleted voucher
  shows as deleted" fails every time in WebKit, also on `main` (c216c1c): no "Poistettu" pill after the voucher is
  deleted. Chromium passes, and CI runs Chromium only.

## 2026-11-07 - Viennit VAT picker overlap; attachment names wrap (`fix/voucher-rows-and-attachment-names`)

- Owner: on the Viennit table the VAT picker of a taxed line ran into Kohdennus. The table is `table-layout: fixed`,
  so its six columns shared the row evenly, and `.editor-table .vat-select { min-width: 12rem }` (plus the rate)
  could only spill out of the cell. A `<colgroup>` now fixes the amount, VAT, allocation and split widths, the rate
  is narrower in this table, and below `min-width: 52rem` the section scrolls sideways. `showCutText` gives a cut
  VAT label its full text on hover.
- Attachment names wrap to three lines, broken anywhere, before the ellipsis; the card link's `title` has the full
  name. Dropzone tiles are wider than their thumbnail, and a saved attachment's "Poista" is as small as a new one's.
  Breaking only after `_`, `-` and `.` read better but showed about a third less of the name, so it was dropped.

## 2026-11-03 - Rental objects: warnings as tiles and pills (`feature/property-warnings`)

- Last move from `docs/UI_PATTERNS.md`. `ui/Warnings.tsx` renders an object's warnings the same on its page and in
  the portfolio's "Huomioitavaa": `lease_ending` and `increase_due` are `DueTile`s (the tenant in the label, the
  day, days left in amber or "Myöhässä" in red once past, the whole sentence on hover), counted with `dayCount`
  like the company page's deadlines. A tile opens the edit page from the object page, and the object from the
  portfolio. Every other warning is a line led by a `Pill` word; `WARNING_WORDS` in `format.ts` lists every
  `properties.warn.*` code and a unit test keeps the two whole. Lines sort errors first, notes last.
- "Ohita" is a quiet link. `DueTile` takes a `title` for the hover text.
- The e2e's as-of date for the reminders is 30.11.2025, not the 31.12.2025 its comment said.
## 2026-11-03 - Tax return: 8A and 73 rows read from a voucher's attachments

- Owner: running tilari-bank-import's `nordnet-tax-forms` and then picking its file in the 8A paste was an extra
  step. The bank import's Nordnet year end now attaches `8a-YYYY.csv` and `73-YYYY.csv` to `Nordnet 31.12.YYYY`
  (that command is gone), and the dialog finds them on the period's draft or posted vouchers by name
  (`domain/rowFiles.ts`). They fill Rahoitusomaisuus and the 73 classes by themselves while nothing is typed there;
  otherwise a button reads them again. Files are UTF-16 with a byte order mark (Kitsas previews no other CSV as a
  table), so the paste's own file input decodes that too.
- When form 73 is not needed (no euros in Saadut osingot), an automatic read fills it and the form moves from the
  closed section to the open one, which drops the "Luettiin N riviä" line; the amounts are there.

## 2026-11-03 - Tax return: a new calculation replaces the kept one

- Owner's test of "Tallenna laskelma asiakirjoihin": each save added another voucher and PDF to the 6B row. Now a save
  writes over the newest kept calculation (voucher date and title to the day, new file uploaded, old files deleted),
  deletes the other kept ones (`tila 0`, like any delete) with their links, and unlinks those already deleted. A
  calculation dated on or before the lock date cannot change, so it stays and the save makes a new voucher.
- Books saved before this keep their extra calculations until the next save, which folds the open ones into one.

## 2026-11-03 - Company page: a period's sections fold

- Owner: Määräajat, Asiakirjat and the dividends fold, and only Määräajat is open at first. What is opened or
  folded holds for the session and for every period, or opening a voucher and coming back would fold the
  documents again. The e2e helper unfolds Asiakirjat once per test.

## 2026-11-03 - Company page: one meeting, one file; extraordinary meetings; income tax payment

- Owner's look at the drafts: account names were missing next to the numbers; a step for paying the tax after
  the tax decision; the "add shareholders first" text should lead there; the process was confusing; the AGM
  decides, so its minutes are the decision's attachment too; an extra dividend's extraordinary meeting belongs
  among the period's documents. `docs/DIVIDENDS.md` now writes the whole process down, and the section has a
  "Näin osinko etenee" list.
- The minutes are kept once, on the decision's voucher, and the meeting's row links that file. This needed
  links to drafts: the company writes no longer refuse one (`voucher_missing` replaces `voucher_not_posted`);
  a linked draft is amber and is not a problem.
- "Tuloveron maksu" reads 2968 oldest first. Checked read-only on the owner's book (only settled or not per
  year): the closed years come out settled and the newest open, as expected. A residual tax paid through the
  bank import's tax account rule (2920) would leave 2968 open; the owner's book clears 2968 with its own voucher.
- Extraordinary meeting files used to be suggested under "Muut"; they now go to their own row.

## 2026-11-03 - Company page: shareholders, recipients and dividend drafts

- Owner: "continue with what is still not built" after seeing the dividend cards. Built increment 3 of the plan:
  shareholders on the company's own card, "Saajat" on each dividend, "Kirjaa osingonjakopäätös" on the newest
  ended period and "Tee maksutosite" on a dividend with an unpaid part. Both write drafts; the owner posts them.
- Vero's guide on withholding from dividends (7.12.2022, in force from 1.1.2023) was read again on 2026-11-03:
  7.5 % of the whole dividend, tax-free and earned-income parts included, to a person or domestic estate up to
  150 000 euros a recipient, 28 % above; none to a company; non-residents under the source tax rules. The
  guide does not say over which period the 150 000 is counted; Tilari counts the payment's calendar year.
- Withholding is rounded half up per recipient. The payment draft splits the unpaid amount, so a partly paid
  dividend's second draft pays only the rest.
- A decision dated today goes on the newest ended period (the rule from 2026-11-02), so the button is only
  there; the form warns when its date would land the decision on another period.
- The e2e posts the decision draft as it is in the editor: the test book has no 2261, and an unchanged draft
  posts without an account check, so it runs on the golden book without changing it.

## 2026-11-03 - Rental objects: the edit page's documents and a shared suggestion banner (`feature/property-edit-docs`)

- Third move from `docs/UI_PATTERNS.md`. The edit page's linked documents and balance-sheet items are `DocLine`s
  with their remove or delete as a quiet link; a balance-sheet item's pill has a date and no number, since a
  tase-erä has none. `DocPicker` shows the picked document's files as pills in place of "Näytä"
  (`properties.edit.viewDoc` went). `DocCandidate` carries `series` and `files` (read by `voucherFiles`, shared
  with `loadVoucherRefs`) in place of `first_attachment`; nothing stored changed.
- The company page's "Ehdotuksia kirjanpidosta" banner is `shared/SuggestBanner` (`.company-suggest*` became
  `.suggest-banner*`), now also on the object page's lease and water panels and in both editors. An editor's
  suggestion is a `DocLine`: its first day in the date column, its source in `mark`, a filled "Lisää" in `end`.
  The banner's lead and paragraph rules have their own classes, since a plain `p` rule reached the water
  settlement cards inside it.
- A lease card's missing contract and a settlement's missing statement are a line of text again ("Tasauslaskelma
  Puuttuu" from the card's left edge, `.property-doc-slot`), not a `DocLine` with an empty date column: the
  owner wanted them aligned left like the card's other lines. A linked one stays a `DocLine`.
- A folded `DocLine` (list under 60rem, as on the edit page) keeps its actions at the side of both rows,
  centred: a quiet "Poista" alone on the second row of a line with no files looked broken. The phone layout
  is unchanged.

## 2026-11-03 - CI: the e2e step has 20 minutes (`ci/e2e-timeout-20`)

- The Chromium e2e step in `test.yml` ran 9-10 minutes on one worker and hit its 10-minute limit now and then
  with every test passed (a rerun went green). The step now has 20 minutes and the `frontend` job 25, so the
  step's own limit is the one that stops a hung run.

## 2026-11-03 - Rental objects: lease and water panels on the shared parts (`feature/property-lease-docs`)

- Second move from `docs/UI_PATTERNS.md`. A linked voucher in a lease or water panel is its purple pill, its title
  and a blue pill per file: `loadVoucherRefs` reads each voucher's own `Liite` rows (id and name only, never
  `data`, Kitsas's system attachments left out), passed on as `LeaseVoucher.files`. Computed, nothing stored.
- The contract and a settlement's statement are `DocLine`s; increases and exceptions are `DocLines` with the day
  they apply from in the date column, since that says more than the notice's date. An empty slot reads "Puuttuu"
  by the same rules as the reminders' `missingDocuments`: only while the object is held, not where the owner
  said there is no document ("Ei asiakirjaa"), and not on a water suggestion, which has no stored slot.
- A lease's state and a tenant's water status are `Pill`s (`.property-water-status` went); a suggestion's source
  is a `Pill doc` whose span keeps the hover text.
## 2026-11-02 - Checks link to their place, form 73 always findable, the calculation kept as a PDF

- Owner's look at form 73 on a real book: form 73 was not on the Liitelomakkeet tab. The dividend account had been
  added to the chart, so the heading above its number placed it with interest; the 6B dividend field stayed empty and
  73 was never asked for. An added `9...` income account named for dividends now goes to the dividend field (still to
  confirm), and 73 is always on the tab, closed with the reason when the figures do not call for it.
- The checks' heading was a pill and read as one more check; it is a heading now (owner). Each item links to its tab
  and section; a 6B field's row opens on its accounts.
- The passed list said "arvopaperit ja lomake 8A" while a failed 8A check named Rahoitusomaisuusarvopaperit: two 8A
  groups, one tied and one not. The passed text now names the group's field.
- The calculation is kept as a PDF on a Liitetieto voucher linked to the 6B row (owner asked to keep the result for later
  reference). No library: `shared/textPdf.ts` already writes the rental letters. The link is flagged `calculation` so
  the 6B row and its deadline stay open until the filed return is linked.
- WebKit e2e: "a deleted voucher shows as deleted" (company spec) reloads with `page.goto` and WebKit then has no book
  open. Not from this change; PR CI runs Chromium only, so it shows only in the release matrix.

## 2026-11-02 - Form 73, and 8A rows pasted from a spreadsheet

- Form 73 is typed by class, because the ledger has one dividend figure. Its total must equal the 6B's Saadut osingot ja
  ylijäämät, and its taxable share becomes the 6B's Veronalainen osuus (Vero's guide to 73). A filed return checked
  against the bank import's year-end report: the class totals were the payer's country sums, all taxable.
- The book's figure is the one that counts. Nordnet's own EUR for a foreign dividend can differ by cents from the ECB
  rate the monthly vouchers use, so the bank import splits the booked amounts and takes only the country from Nordnet.
- 8A's listed securities come by paste (tabs or semicolons, the form's columns) rather than an importer in Tilari
  (SCOPE.md). tilari-bank-import's `nordnet-tax-forms` writes that file. A pasted row with no business ID keeps the ID
  of the earlier row with the same name, so Finnish IDs are typed once.
- Form 73's "Onko yhtiö julkisesti noteerattu?" is a compulsory yes/no like the 6B's questions (owner's rule of
  2026-11-02); "Jakajayhtiö on listattu" stays a checkbox, as OmaVero's own default reads "Ei tai jakajayhtiöitä on
  useita".

## 2026-11-02 - Forms 8A, 71B and 62, and a debt's term by choice

- Back-tested on real filed returns, read in place and printed as pass/fail. It found two things the unit tests had
  not: a fully depreciated asset vanished from 62, because accounts came from those with a closing balance; and a
  tase-erä's partner is the seller, not the company, so it was dropped as a source of names and business IDs.
- In financial assets one tase-erä can hold many securities, so 8A's rows there are typed until the bank import brings
  them. Other assets follow tase-eriä, and two can make one filed row: rows with one business ID combine.
- An 8A filing can give many securities one business ID: OmaVero takes no empty ID, so a company without a Finnish one
  gets 0000000-0. Rows therefore combine only when the name matches too. Combining by ID alone would have merged them, and only a back-test against the filing showed it.
- A filed 71B row's cost can differ from the booked cost, so a suggestion stays editable, and `sale_gap` shows what is
  left. Sale fees are booked on their own vouchers, with nothing linking them to a sale.
- Leaving a tab with typed figures saves them. With these forms too much could be lost by moving to the file to check it.
- A very long patch hits the sandbox's limit on one shell argument, and a script mentioning `rm` inside `bash -c` is
  stopped by a safety check. Scratch browser tests can live outside the repo, with a config that imports the repo's and
  a `node_modules` link beside it, so nothing needs removing afterwards.

## 2026-11-02 - 6B questions take a yes or a no; counted messages have a singular

- Owner: a single checkbox cannot tell "no" from "not thought about", so OmaVero's questions became compulsory yes/no
  answers, and they no longer carry over (ADR-032). "Tilinpäätös on laadittu" is on by default.
- `audit_remarks` had the same flaw and worse: an untouched checkbox stopped the file, and "no" took two clicks.
- The i18n engine had no plurals, so counts read "1 luonnosta". A message can now have `key_one`. Finnish changes the
  noun, not the verb: "1 luonnos jää", "2 luonnosta jää".
- Whether a custom account's guess matters: placed by heading alone, a dividend account landed in Muut rahoitustuotot,
  which also hid form 73 from the list of forms needed. Confirming accounts is not a formality.
## 2026-11-02 - Company page: dividends read from the ledger

- Owner approved the steps after the annual report row. Each period's card gets "Osingot tämän tilikauden
  voitosta": one card per decision with five steps, the vouchers behind them and their files, and rows for what
  is unpaid or unremitted. Nothing is stored; ADR-031 has the rules.
- Problems with no date (a payment over the decision, a debt without a contract) count in the card's
  "Huomioita"; a late withholding counts in "Määräaikoja", and in the header like any deadline.
- Withholding is matched oldest first across the whole account, so a book whose payroll also uses 2921 still
  comes out exact as long as each remittance clears what came before it.
- No e2e for the card: the test books have no dividend accounts, and adding them would change the golden
  books. Unit tests cover the figures; the look was checked on an invented book at 1280px and 380px.

## 2026-11-02 - Company page: the dividends' annual report; what a dividend payment is

- Owner: the report is filed with Vero but was never stored in the book, and past and future ones should be
  here. So it is a required row, listed only for a period the book shows a dividend from. It goes on the period
  whose profit was distributed, where the dividend's own section will go, and its name gives the year paid,
  since that is the year the report covers.
- Its date is the end of the January after the year paid (Vero), moved past days off like the 6B. It is
  "Odottaa" until that date, then "Puuttuu". A past report goes through the row's upload, with its own date kept
  when the year is closed. No suggestions for it: nothing in a book names one yet.
- Read from Osingonjako (2261, the chart's number, as the statement template reads it): a posted credit is the
  decision, and the first debit after it the payment. A draft payment does not count. Nothing is stored. The
  accounts become a setting with the dividends themselves.
- Correction to the 2026-10-31 entry and ADR-031: "cash payments keep coming from the bank import" was the
  agent's wording inside a question, never the owner's decision. A payment is a voucher, whether or not money
  leaves the bank that day: it can turn the dividend into a debt to the shareholder, with the contract attached.
  Later lines on the payable repay that debt and are no dividend step, so nothing allocates them to dividends.

## 2026-11-02 - Rental objects: the object page's documents as lines (`feature/property-doc-lines`)

- First of the moves listed in `docs/UI_PATTERNS.md` "Next: rental objects"; each is its own demo. The
  Asiakirjat panel lists a document as a `DocLine`: the purple pill opens the voucher, the blue pills open its
  files. A linked voucher deleted in Kitsas reads "Poistettu", as on the company page. A sale's vouchers use the
  same pill. Nothing stored changed.
- `.property-doc-group h4` outranked `.section-label`, so the group names kept the old look until it went.

## 2026-11-02 - Company page: document lines as a table

- Owner's request: lines looked unstructured, and "Ehdotus" pushed everything to the right. A line now has
  fixed columns: voucher pill (date and number together), title, files, actions (UI_PATTERNS rule 8).
- The pill always shows the voucher's date. A document's own date from a closed year stays next to the title
  ("asiakirja ..."), so the pill never shows a date the voucher does not have.
- Breakpoints are container queries on the list, not the window, since the side menu and the card change its width.
- A draft's pill used to read "Tosite -": `formatVoucherId`'s default fallback is truthy, so `voucherNoId` was never used.
- Owner: too many similar buttons too close, and separators after a single item. A row's actions are now quiet
  links, with only a missing document's upload or a suggestion's "Lisää" a real button. That replaced fading a
  finished row's buttons until hover, so the `done` tone went too. Separators are only between documents.

## 2026-11-01 - Annual tax return (6B): figures for OmaVero and an Ilmoitin file

- Owner asked for a button with the annual return's data, for OmaVero by hand or Ilmoitin. Both outputs render one
  calculation (ADR-032, [docs/TAX_RETURN.md](docs/TAX_RETURN.md)). 8A, 71B, 73 and 62 come next; until then a file
  for a company with such figures can be format-checked but not sent.
- Back-tested on real filed returns against the book, read in place and printed as pass/fail: the book's result and
  equity match every year, and the differences were accounts placed differently between years and a few figures typed
  by hand. The rules alone gave almost every field. Account types are today's, so a type changed later moves earlier years too.
- Kitsas keeps the tax contact in `VeroYhteysHenkilo` and `VeroYhteysPuhelin`, and Tilari has no field for them. A
  message pointing to the book's settings was a dead end, so the dialog takes them too and never writes `Asetus`.
- A select does not fire for the value it already shows, so confirming a guessed field needs its own button.
- `createBook.ts` imports `luo.sql?raw`, which only Vite understands: anything using it runs under Vitest, not
  `node --import tsx`.
- Vero's 6B record description v1.1 is dated 24.11.2026 on its own page, later than this entry. Taken as current; its
  only change from 1.0 is the optional field 179.

## 2026-11-01 - Company page: a period's rows follow the year's closing

- Owner's request: chronological. The rows are in a fixed order (`PERIOD_KINDS`), not sorted by date: an
  empty row has no date, and a document on a shared voucher can carry a date later than its own.
- Statements (specifications, annual report), board minutes, audit report, 6B, AGM, PRH, tax decision, other.
  The audit report has no deadline of its own; it goes after the board because it covers what the board signed.
- Documents inside a row are oldest first. Kitsas's own statement PDF stays at the top of its row.
- Open, found on the way and not from this change: `e2e/company.spec.ts` "a slot can be marked not needed, and a
  deleted voucher shows as deleted" fails on webkit every time, also on `main` at #58, waiting for the "Poistettu"
  pill after `page.goto`. Chromium and Firefox pass. PR CI runs Chromium only; the release tier runs webkit.
  Cause not looked into.

## 2026-11-01 - Confirmed: desktop Kitsas keeps `TilariData`

- Owner test: a book saved by Tilari, with company and rental data, was opened in desktop Kitsas, a voucher
  edited and a backup taken. Every table of the file and its backup was compared: the only difference is
  `Asetus.Varmuuskopioitu`. `TilariData` is intact, every link resolves, files keep their bytes, and
  Kitsas logged its edit as usual. Tilari's own reader gives the same overview on both files.
- Not covered: nothing was uploaded through the company page in that book. Such a voucher comes from the
  same save as a rental document's, which Kitsas also kept, and the e2e covers the upload itself.
- That book, an older copy, has importer lines with `kumppani` 0 and `eraid` 0: the case fixed in #54, not
  from this page, which writes no lines. Most of its broken foreign keys are also in a book Tilari never saved.

## 2026-11-01 - Fixed: the 6B date ignored holidays; PRH's "receipt" is optional

- The 6B showed 1.5.2023 for a year ending 31.12.2022. 30.4. was a Sunday, and the code moved only past
  weekends, onto Vappu. The right day is 2.5., as Vero's notice of 13.1.2023 says. `isDayOff` now follows
  laki 150/1930, 5 §, including Easter, Ascension and Midsummer Eve.
- Only the 6B moves. The act covers deadlines at an authority (1 §), so not the statements or the AGM, and
  PRH's text names no day-off rule. With a late fee at stake its date stays the earlier one.
- The PRH "receipt" came from the first design and is not a standard document. PRH sends a trade register
  extract once statements are registered, and the free extract in Virre lists them. So the kind is renamed
  and off by default, and a passed date says to check with PRH, not "late". The late fee covers periods
  ending on or after 1.12.2024: 150, 300 or 600 euros by lateness, doubled in some cases (PRH, 25.8.2026).
- Owner: a ticked document is listed and required, an unticked one is not listed. A row holding a document
  stays, or unticking would hide what was attached (the list of all documents would still have it).
- Filing with the tax return reaches the register only if the attachment is filed exactly as Vero
  instructs, so a filed return does not prove the statements were registered (PRH, 27.4.2026).
- Owner rule: a real book is never copied to temp or test folders, and demos use invented books.

## 2026-11-01 - Company page: colour and cards; balance sheet specifications are optional

- Owner reviewed the first demo: too dull to see what is missing. The page now has cards that open in
  place, tinted missing rows and coloured pills, built from reusable parts. Parts, rules and the steps for
  moving rental objects' documents the same way are in `docs/UI_PATTERNS.md`. Not moved yet.
- Tase-erittelyt: required by law to be prepared and kept (KPL 3:13, 2:10), never filed, and already in
  Kitsas's archive, so no separate file by default (ADR-031). Kitsas keeps the archive's date in the
  desktop's settings, so the book cannot tell whether an archive was made.
- Legal text checked from Finlex's open data (`opendata.finlex.fi/.../statute-consolidated/{year}/{number}`
  returns XML; the normal pages do not read with the tools): KPL 3:6 four months, OYL 5:3 six months, OYL
  8:10 two months from adoption. The newest consolidated KPL served there was 167/2022, OYL 652/2024.

## 2026-10-31 - Company documents and deadlines (`feature/company-documents`)

- Owner asked for a place for the company's cycle: a new sidebar item (Yhtiö, `#/company`), Tilikaudet
  left as it is, files as normal vouchers (type 800 or on the records they belong to), Tilari's own
  data in `TilariData` (ADR-031). A design from a session without access to this repo was the
  starting point; its concepts carried over, its Kitsas API, SQL tables and dividend model did not.
- Owner decisions: documents and deadlines first, dividends next after the review; company-level
  documents get their own section; dividend vouchers will be drafts the owner posts.
- What the model has to allow: documents on normal vouchers, several documents on one voucher, the
  same file on two vouchers. A dividend is decided on one voucher and paid on a second, which moves it
  to withholding and a payable (corrected 2026-11-02, see that entry).
- Matching notes: `osinko` inflects to `osingon`; `veroilmoitus` is inside VAT and transfer-tax
  returns; `6b` is inside hex file names; a file name's date is not the period's year.
- Checked on a copy of a real book (pass/fail only): the suggestions put each file of a voucher with
  several documents on its own slot, look-alikes gave none, and accepting all of them changed only
  `TilariData`.
- Vero.fi and PRH confirmed the 6B and the 8 month PRH deadline; the first design's month-end rounding
  of the PRH date was late for mid-month period ends. The other two: see 2026-11-01.

## 2026-10-31 - Fixed: the save status turned clean before the working copy was written

- A save marked the book clean first and wrote the working copy after, so a reload right then
  restored the older dirty flag and a saved book showed "Ei tallennettu" (2 of 8 tries in the e2e).
  The file itself was already saved. Now `isDirty()` stays true until that write has finished
  (`holdStatusDuring`), on disk, download and locker saves; the dirty flags themselves change as
  before, so the working copy records the save and a failure leaves them to decide the status.
- A reload during the write still shows "Ei tallennettu", but the status showed that too by then.

## 2026-10-31 - Fixed: `?` conditions in the statement template did not work

- The `muoto` fix in #55 changed nothing on the shipped template: `?muoto=oy` sits right above a
  `##` heading and the generator reset the condition at every `##`, so `oy` and `tmi` books got
  byte-identical notes. Its test used a template with no heading; the tests now use the shipped one.
- Now like Kitsas: a condition holds until the next `?` line (`kyssariEhto`) and compares the
  setting the line names, exactly (`kyssariTesti`); the wizard hides the sections under a
  condition that does not hold (`TpAloitus`). A book with no `muoto` still counts as `oy`, where
  Kitsas would leave out both forms' sections (only test books have none).
- Checked on copies of real limited-company books: notes byte-identical with the stored, no and all
  choices; the wizard drops only `tmipaaoma`. In the browser with the shipped template, a `tmi` book
  no longer offers the dividend choices and its notes do not mention share capital.

## 2026-10-31 - Fixed: saved statement notes lost on reopen; legal form never read

- Every reopen moves `Liite.data` to the attachment store, and the statement code read only
  `Liite.data`. After a reopen the notes editor opened blank, the print silently regenerated the
  text from the template (ignoring the owner's edits), and a save dropped the report line from the
  stored text. The text now comes from `Asetus.tilinpaatos/{date}` when `Liite.data` is NULL; Kitsas
  (since 2020) and tilari write that copy together with the attachment. The store itself is not
  used: domain code is synchronous and a locker book's bytes may still be syncing. No attachment row
  still means no text, as in Kitsas.
- Checked on copies of real books after extraction: every statement's text read back, reached the
  print and kept its report line on a second save; where the attachment was still inline, its
  `Asetus` copy was byte-identical, and every lean one had a copy.
- The statement asked `Asetus` for `Muoto`; the key is `muoto` (Kitsas `AsetusModel`). That alone
  did not fix the legal form; see the entry above.
- Seen, not changed: a row with `Liite.data` NULL and no `Asetus` copy still reads as empty; no
  known writer leaves one.

## 2026-10-31 - Posting in tilari vs saving in Kitsas: NULL line fields, log snapshot

- Owner test: the same drafts (written by tilari-bank-import) posted in tilari and saved in desktop
  Kitsas gave the same accounts, amounts, numbers and attachments, but different line fields:
  Kitsas's save rewrites every line (`lisaaTaiPaivita`: `eraid > 0 ? eraid : NULL`,
  `kumppani ? kumppani : NULL`, empty `arkistotunnus` NULL); tilari's post kept the tool's
  `eraid` 0, `kumppani` 0, `arkistotunnus` ''. Kitsas's tase-erittely (`eraroute.cpp`) lists
  the lines without a tase-erä by `eraid IS NULL`, so those lines were missing from the list
  (totals right, from the account balance).
- Fixed: a save that writes the voucher, and a post, store those as NULL (`nullEmptyLineFields`);
  an unchanged save still writes nothing. tilari-bank-import writes NULL too and has
  `fix-empty-line-fields` for older lines.
- Log: tilari's `kirjaa` / `tallenna` rows now also carry the voucher in Kitsas's log shape
  (`lokiSnapshot`), so Kitsas's log tab shows what was posted; still `userid 0` + `toiminto`.
- Seen, not changed: the locker's lean split rewrote three Kitsas-written `Liite.sha` values from
  BLOB to TEXT (same hex, data identical on download).

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

## 2026-10-27 - Rental objects: a month with an exception offers to change or remove it

- Owner asked for "Muokkaa poikkeusta" on a rent account month that has an agreed exception,
  where other months offer "Lisää poikkeus", and for a way to delete one. It opens the same form
  (one `ExceptionForm` for adding and editing, as the owner wanted) with the stored exception
  (dates, amounts, reason); the save replaces it on the lease, matched by its first day, and
  keeps its agreement voucher. "Poista poikkeus" in that form removes it after a confirm (the
  save is immediate). `RentMonth.exception` now carries the stored exceptions (`agreed`) instead
  of only their notes. A month with two exceptions gets a button per exception, named by its days.

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
  of a file with `TilariData` still to be confirmed by the owner (confirmed 2026-11-01).

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
