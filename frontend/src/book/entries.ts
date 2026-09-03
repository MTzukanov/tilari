import { centsOrNull } from './cents'
import { SQL_POSTED } from './kernel/sqlFragments'
import type { SqliteDb } from './sqlite'

export function listEntries(
  db: SqliteDb,
  opts: { account: number; startDate: string; endDate: string },
) {
  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.selite AS description,
       Vienti.alvprosentti AS vat_percent,
       Tosite.id AS voucher_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.tyyppi AS voucher_type,
       Tosite.sarja AS voucher_series,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE ${SQL_POSTED}
       AND Vienti.tili = ?
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.rivi`,
    [opts.account, opts.startDate, opts.endDate],
  )

  return rows.map((row) => ({
    id: Number(row.id),
    date: String(row.date),
    account: Number(row.account),
    debit_cents: centsOrNull(row.debetsnt),
    credit_cents: centsOrNull(row.kreditsnt),
    description: String(row.description || ''),
    vat_percent: row.vat_percent == null ? null : Number(row.vat_percent),
    voucher: {
      id: Number(row.voucher_id),
      date: String(row.voucher_date),
      doc_number: row.voucher_doc_number == null ? null : Number(row.voucher_doc_number),
      type: Number(row.voucher_type),
      series: String(row.voucher_series || ''),
    },
    partner: row.partner_id
      ? { id: Number(row.partner_id), name: String(row.partner_name) }
      : null,
  }))
}
