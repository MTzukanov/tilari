# Compatibility with desktop Kitsas

## Interchange (current)

As of this version, Tilari is **fully compatible** with desktop Kitsas
`.kitsas` files. You can open the same saved file in either program, edit,
save, and open it in the other. There is no Tilari-only book format today.

That is the **current** contract, not a guarantee for every future release.
A later Tilari might add its own format or bump schema; that would need an
ADR, and export to schema 24 would stay documented until then.

Use the file you **save or download**. An in-browser or locker working copy
may be lean (attachments stored beside SQLite) and will not open in desktop
Kitsas until export reassembles `Liite.data`. Do not let both apps write the
same path at once (see [Concurrent use](#concurrent-use-with-the-desktop-app)).

## File format

- Extension `.kitsas` = SQLite 3, schema version **24** (`Asetus.KpVersio`).
- We refuse to open files missing `Asetus`, `Tili`, `Tilikausi`, `Tosite`, `Vienti`
  or `KpVersio`.
- We do **not** bump `KpVersio`. If upstream ships 25, add an ADR and a
  migration note before writing.

## Round-trip

**Working copy** in the browser/locker uses a lean `.kitsas` (`Liite.data`
null) plus a separate attachment store (ADR-015). That layout is **not**
what desktop Kitsas expects.

**Export for Kitsas** (local save / download copy) reassembles BLOBs into
`Liite.data` so the file opens in desktop Kitsas 5.10+ and other schema-24
tools. That means:

- Same table names and column types as `luo.sql`
- Cents in `debetsnt` / `kreditsnt`
- JSON columns remain valid JSON objects (possibly `{}`)
- Exported `Liite.data` is a BLOB; `sha` is hex SHA-256
- `Tositeloki` rows are additive

Opening a classic Kitsas file unpacks attachment BLOBs into the web store
once; the OPFS working copy stays lean.

## Concurrent use with the desktop app

Desktop Kitsas uses WAL and can take an exclusive lock.

- Close desktop Kitsas before sharing the same `.kitsas` file.
- The browser works on an OPFS working copy (and a download / File System
  Access save). It does not take a live lock on the original path.
- First mutate snapshots original bytes in OPFS.

## Financial statements

Tilari writes the closing exactly where desktop Kitsas looks for it:

- Notes to the accounts in the `TPTEKSTI_{loppupvm}` attachment on voucher 0, with a
  copy under `Asetus.tilinpaatos/{loppupvm}`
- Closing state in `Tilikausi.json` (`henkilosto` headcount, `tilinpaatos` drafted-at, `vahvistettu` confirmed-at)
- Year-end vouchers 9910 / 9920 / 9930 with the `Vienti.tyyppi` codes Kitsas
  uses (99100 depreciation, 99211/99212 accrual, 99221/99222 opening)

Two differences to know about:

- **`verolaskelma` in `Tilikausi.json`** is a Tilari addition holding the income
  tax breakdown in cents. Kitsas ignores unknown keys, and Tilari preserves keys
  it does not know, so books round-trip either way.
- **No `TP_{loppupvm}` PDF is generated.** Tilari produces the statements as
  HTML and leaves PDF creation to the browser print dialog, which keeps the
  bundle free of a PDF library. A PDF made elsewhere can be uploaded and is
  stored under the `TP_` role that Kitsas expects; otherwise re-print the
  document in desktop Kitsas if you need that attachment.

## What we will not change in the file

- Chart layout / heading rows (read-only)
- Report templates stored under `Asetus` keys `tase/*`, `tulos/*` (Tilari only
  seeds `tppohja/fi` when the book has no notes template)
- Billing tables even when unused
- Synthetic equity accounts `BE` / `T` — still computed, not stored as journal lines

## Branding

Compatible with Kitsas **files**, not affiliated with Kitsas Oy.
See ADR-000.
