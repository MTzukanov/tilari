# Golden Kitsas test book

| File | Role |
|------|------|
| `tilari-test.kitsas` | Tiny schema-24 book with known euro amounts (committed) |
| `tilari-vat.kitsas` | VAT return e2e (cash-basis) |
| `tilari-vat-accrual.kitsas` | VAT e2e mixed accrual + parked cash |
| `tilari-vat-force.kitsas` | VAT e2e force-realize path |
| `tilari-period-end.kitsas` | Period-end closing wizard e2e |
| (frontend) `src/book/expected.ts` | Integer-cent amounts Vitest asserts |

Open `tilari-test.kitsas` in the UI for manual checks. Automated tests load the committed file; rebuild only if you intentionally change fixture content (historically via a Python builder that has been removed — prefer editing through the app or a small Node script).
