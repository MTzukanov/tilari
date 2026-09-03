# Testing

Layers below run against the golden book in [`testdb/`](../testdb/).

## Golden book

`testdb/tilari-test.kitsas` is a tiny schema-24 Kitsas file with **known euro amounts**
(committed). Playwright and Vitest load that file. Expected figures live in
[`frontend/src/book/expected.ts`](../frontend/src/book/expected.ts).

| What it covers | How |
|----------------|-----|
| Two fiscal years | 2024 and 2025 calendar years |
| Posted vs draft | Voucher 6 `tila=50` (999 EUR) must never enter balances / lines / cost centres |
| Asset vs P&L sign | Bank `ARP` 1910 vs sales `CL` 3000 / expense `D` 4000, 5000 |
| Synthetic equity | `BE` 2251 and `T` 2371 |
| Opening / running balance | March 2024 bank: opening 1000, after two lines 1150 |
| P&L year reset | Account 3000 opening is 200 in Apr 2024, 0 on 2025-01-01 |
| Cost centre + child project | Office (1) + Project A (`kuuluu=1`) |
| Ended cost centre | Old cost centre `paattyy=2024-12-31` |
| Cost centre starting later | Apartment `alkaa=2025-01-01` |
| Attachment | Voucher 7 / attachment `kuitti.txt` |
| Partner | Asiakas Oy on sales voucher 2 |

Double-entry check: assets (1910) equal equity and liabilities (`BE` + `T`) at each year end.

## Layer 1 - Server (locker + smoke)

```bash
cd server
npm test
npm run smoke
```

| File | Asserts |
|------|---------|
| `src/locker/locker.test.ts` | Health; list/get/put + ETag 409; TILARIAT pack; lean-split of fat `.kitsas` |
| `src/smoke.ts` | Open golden book via shared `Ledger` |

## Layer 2 - Frontend unit (implemented)

```bash
cd frontend
npm test
```

| File | Asserts |
|------|---------|
| `periodNav.test.ts` | Month bounds, year shift, mid-year fiscal-period overlap, all-time span |
| `book/balances.test.ts` | sqlite-wasm golden 2024 balance-sheet identity |
| `book/ledger.test.ts` | Reports, cost centres, attachments, posting writes |
| `book/attachments.test.ts` | TILARIAT pack, extract/pack BLOBs, conditional locker upload |
| `book/persist/locker/supabaseLocker.test.ts` | Memory Storage round-trip + ETag 409 + AES-GCM; wrong secret; no Node |
| `book/persist/locker/vaultCrypto.test.ts` | Envelope round-trip, wrong AES key, generated secret |
| `book/blobStore.test.ts` | SHA keep-set / persist-skip helpers for `tilari/blobs/` |
| `routing.test.ts` | Hash routes including nested voucher from account / cost centre |
| `allocationPrefs.test.ts` | localStorage round-trip, ended cost-centre overlap |
| `i18n/engine.test.ts` | Finnish/English/Swedish/German catalogs, first-run locale persist |
| `book/newBook/createBook.test.ts` | Schema 24 + yritys chart seed, VAT/practice overlays, Ledger open |
| `allocationTotals.test.ts` | List totals skip project rows when parents already include them |

## Layer 3 - Playwright

```bash
cd frontend
npm run test:e2e          # Vite + wasm engine (Chromium, Firefox, WebKit; 3 workers)
npm run test:desktop      # production UI from Node launcher (same browsers, 1 worker)
```

Write APIs are covered by `frontend/src/book/ledger.test.ts`. Playwright stays on `testdb/`.

Playwright WebKit on Linux does not persist OPFS (reload / browser storage / wasm
save). Those tests `test.skip` on WebKit; Chromium and Firefox still run them.
CI sets `retries: 0` and `maxFailures: 1` so a failure stops the suite instead of
retrying a 4-minute test three times.

## CI

[`.github/workflows/test.yml`](../.github/workflows/test.yml) runs the layers
above (oxlint, server/frontend `tsc`, server test + smoke, Vitest, Playwright
wasm + desktop on Chromium, Firefox, and WebKit) on push to `main`, pull
requests, and when the VPS deploy workflow calls it.

Pages ([`pages.yml`](../.github/workflows/pages.yml)) deploys after that Test
run succeeds on `main`. VPS ([`build-and-deploy.yml`](../.github/workflows/build-and-deploy.yml))
`needs` the reusable job on `v*` tags. A given commit is not tested twice.

| File | Asserts |
|------|---------|
| `e2e/session-changes.spec.ts` | Wasm: open → edit → Muutokset → save → second edit |
| `e2e/session-changes.http.spec.ts` | Http: three consecutive change types before save; save round-trip |
| `e2e/open-attachments.locker.spec.ts` | Desktop: locker→browser open shows download vs write chips; second open skips download |
