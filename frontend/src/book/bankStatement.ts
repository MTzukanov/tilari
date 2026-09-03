import { asCents } from './cents'
import { PostingError } from './errors'
import { saveVoucher } from './posting'
import type { SqliteDb } from './sqlite'
import { getVoucher, TYPE_BANK_STATEMENT, TYPE_EXPENSE, TYPE_INCOME } from './vouchers'

export function bankStatementMeta(voucher: {
  date: string
  json?: Record<string, unknown>
}) {
  const data = voucher.json || {}
  const raw = (data.tiliote || data.bank_statement) as Record<string, unknown> | undefined
  const info = raw && typeof raw === 'object' ? raw : {}
  return {
    start_date: (info.alkupvm || info.start_date || voucher.date) as string,
    end_date: (info.loppupvm || info.end_date || voucher.date) as string,
    account: info.tili !== undefined ? info.tili : info.account,
  }
}

type Line = {
  id: number
  date: string
  account: number
  debit_cents: number | null
  credit_cents: number | null
  archive_id?: string
  description?: string
  line_no?: number
  partner?: { id: number; name: string } | null
  allocation?: number
  vat_code?: number | null
  vat_percent?: number | null
}

function collectSplitLines(voucher: { entries: Line[] }, entryId: number): Line[] {
  const target = voucher.entries.find((v) => v.id === entryId)
  if (!target) throw new PostingError(`Vienti ${entryId} ei kuulu tositteeseen`, 404)
  const archive = (target.archive_id || '').trim()
  if (archive) {
    const group = voucher.entries.filter((v) => (v.archive_id || '') === archive)
    if (group.length) return group
  }
  const amount = asCents(target.debit_cents) || asCents(target.credit_cents)
  const date = target.date
  const pair = voucher.entries.filter(
    (v) =>
      v.date === date &&
      (asCents(v.debit_cents) === amount || asCents(v.credit_cents) === amount),
  )
  return pair.length ? pair : [target]
}

export function splitBankStatementLine(
  db: SqliteDb,
  voucherId: number,
  entryId: number,
  type?: number | null,
): number {
  const voucher = getVoucher(db, voucherId)
  if (!voucher) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  if (voucher.type !== TYPE_BANK_STATEMENT) {
    throw new PostingError('Vain tiliotteelta voi irrottaa riveja')
  }
  const lines = collectSplitLines(voucher as unknown as { entries: Line[] }, entryId)
  if (!lines.length) throw new PostingError('Ei irrotettavia vienteja')

  let inferred = type ?? TYPE_EXPENSE
  if (type == null) {
    for (const line of lines) {
      if (String(line.account) >= '3' && asCents(line.credit_cents)) {
        inferred = TYPE_INCOME
        break
      }
    }
  }

  const lineNo = Number(lines[0].line_no || 1)
  const date = lines[0].date
  const partner = lines[0].partner
  const description = lines[0].description || voucher.title || 'Tilioterivi'

  const newId = saveVoucher(db, {
    date,
    type: inferred,
    status: 100,
    title: description,
    partner,
    json: { tilioterivi: lineNo },
    entries: lines.map((line, i) => ({
      line_no: i + 1,
      date: line.date,
      account: line.account,
      allocation: line.allocation || 0,
      description: line.description || description,
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
      vat_code: line.vat_code || 0,
      vat_percent: line.vat_percent,
      partner: line.partner,
      archive_id: line.archive_id,
    })),
  })

  const ids = lines.map((line) => line.id)
  db.run(`DELETE FROM Vienti WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  const extra = { ...(voucher.json || {}) }
  extra.tiliote = extra.tiliote || extra.bank_statement || {}
  db.run('UPDATE Tosite SET json = ? WHERE id = ?', [JSON.stringify(extra), voucherId])
  return newId
}
