import { asCents, centsOrNull } from './cents'
import { jsonDate, nameFi, parseJson } from './json'
import { pnlAccount, SQL_POSTED } from './kernel/sqlFragments'
import type { SqliteDb } from './sqlite'
import type { AllocationSummaryRow } from './types'

export const TYPE_NONE = 0
export const TYPE_COST_CENTRE = 1
export const TYPE_PROJECT = 2
export const TYPE_TAG = 3

const TYPE_NAMES: Record<number, string> = {
  [TYPE_NONE]: 'Yleinen',
  [TYPE_COST_CENTRE]: 'Kustannuspaikka',
  [TYPE_PROJECT]: 'Projekti',
  [TYPE_TAG]: 'Merkkaus',
}

function isPnlAccount(account: number, type: string | null): boolean {
  if ((type || '').startsWith('C') || (type || '').startsWith('D')) return true
  return String(account) >= '3'
}

export function listAllocations(db: SqliteDb) {
  const rows = db.all<Record<string, unknown>>(
    `SELECT
       k.id AS id,
       k.tyyppi AS type,
       k.kuuluu AS parent_id,
       k.json AS json,
       COALESCE(kt.lkm, 0) AS entry_count,
       COALESCE(mk.lkm, 0) AS tag_count
     FROM Kohdennus k
     LEFT OUTER JOIN (
       SELECT kohdennus, COUNT(id) AS lkm FROM Vienti GROUP BY kohdennus
     ) AS kt ON kt.kohdennus = k.id
     LEFT OUTER JOIN (
       SELECT kohdennus, COUNT(vienti) AS lkm FROM Merkkaus GROUP BY kohdennus
     ) AS mk ON mk.kohdennus = k.id
     ORDER BY k.tyyppi, k.id`,
  )
  const out = rows.map((row) => ({
    id: Number(row.id),
    type: Number(row.type),
    type_name: TYPE_NAMES[Number(row.type)] ?? String(row.type),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    name: nameFi(row.json),
    starts: jsonDate(row.json, 'alkaa'),
    ends: jsonDate(row.json, 'paattyy'),
    count: Number(row.entry_count || 0) + Number(row.tag_count || 0),
    parent_name: '',
  }))
  const byId = new Map(out.map((item) => [item.id, item]))
  for (const item of out) {
    const parent = item.parent_id != null ? byId.get(item.parent_id) : undefined
    item.parent_name = parent?.name ?? ''
  }
  return out
}

export function getAllocation(db: SqliteDb, allocationId: number) {
  const row = db.get<{ id: number; tyyppi: number; kuuluu: number | null; json: unknown }>(
    'SELECT id, tyyppi, kuuluu, json FROM Kohdennus WHERE id = ?',
    [allocationId],
  )
  if (!row) return null
  let parentName = ''
  if (row.kuuluu != null) {
    const parent = db.get<{ json: unknown }>('SELECT json FROM Kohdennus WHERE id = ?', [row.kuuluu])
    if (parent) parentName = nameFi(parent.json)
  }
  return {
    id: Number(row.id),
    type: Number(row.tyyppi),
    type_name: TYPE_NAMES[Number(row.tyyppi)] ?? String(row.tyyppi),
    parent_id: row.kuuluu == null ? null : Number(row.kuuluu),
    parent_name: parentName,
    name: nameFi(row.json),
    starts: jsonDate(row.json, 'alkaa'),
    ends: jsonDate(row.json, 'paattyy'),
    count: 0,
  }
}

function allocationFilterSql(includeProjects: boolean): string {
  return includeProjects
    ? 'AND (Kohdennus.id = ? OR Kohdennus.kuuluu = ?)'
    : 'AND Kohdennus.id = ?'
}

function filterParams(allocationId: number, includeProjects: boolean): number[] {
  return includeProjects ? [allocationId, allocationId] : [allocationId]
}

export function computeAllocationBalances(
  db: SqliteDb,
  allocationId: number,
  startDate: string,
  endDate: string,
  includeProjects = true,
) {
  const accounts = new Map(
    db
      .all<{ numero: number; tyyppi: string | null; name: string }>(
        `SELECT numero, tyyppi, COALESCE(json_extract(json, '$.nimi.fi'), '') AS name FROM Tili`,
      )
      .map((row) => [
        Number(row.numero),
        { number: Number(row.numero), type: row.tyyppi || '', name: row.name || '' },
      ]),
  )
  const rows = db.all<{ account: number; ds: number; ks: number }>(
    `SELECT
       Vienti.tili AS account,
       COALESCE(SUM(Vienti.debetsnt), 0) AS ds,
       COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     JOIN Kohdennus ON Vienti.kohdennus = Kohdennus.id
     WHERE ${SQL_POSTED}
       AND ${pnlAccount()}
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
       ${allocationFilterSql(includeProjects)}
     GROUP BY Vienti.tili`,
    [startDate, endDate, ...filterParams(allocationId, includeProjects)],
  )

  const lines: { number: number; name: string; type: string; balance_cents: number }[] = []
  let kitsasProfit = 0
  let income = 0
  let expense = 0
  for (const row of rows) {
    const account = Number(row.account)
    const balance = asCents(row.ks) - asCents(row.ds)
    if (balance === 0) continue
    const acc = accounts.get(account) ?? { name: '', type: '' }
    const type = acc.type || ''
    lines.push({ number: account, name: acc.name || '', type, balance_cents: balance })
    kitsasProfit += balance
    if (type.startsWith('C')) income += balance
    else if (type.startsWith('D')) expense += -balance
  }
  lines.sort((a, b) => (String(a.number) < String(b.number) ? -1 : 1))
  return {
    start_date: startDate,
    end_date: endDate,
    include_projects: includeProjects,
    lines,
    kitsas_profit_cents: kitsasProfit,
    income_cents: income,
    expense_cents: expense,
    profit_cents: income - expense,
  }
}

export function computeAllAllocationBalances(
  db: SqliteDb,
  startDate: string,
  endDate: string,
  includeProjects = true,
): AllocationSummaryRow[] {
  const items = listAllocations(db).filter(
    (item) => item.type === TYPE_COST_CENTRE || item.type === TYPE_PROJECT,
  )
  return items.map((item) => {
    const balances = computeAllocationBalances(
      db,
      item.id,
      startDate,
      endDate,
      item.type === TYPE_COST_CENTRE ? includeProjects : false,
    )
    return {
      ...item,
      kitsas_profit_cents: balances.kitsas_profit_cents,
      income_cents: balances.income_cents,
      expense_cents: balances.expense_cents,
      profit_cents: balances.profit_cents,
    }
  })
}

export function listAllocationEntries(
  db: SqliteDb,
  allocationId: number,
  startDate: string,
  endDate: string,
  opts: { includeProjects?: boolean; pnlOnly?: boolean } = {},
) {
  const includeProjects = opts.includeProjects !== false
  const pnlOnly = Boolean(opts.pnlOnly)
  const pnlSql = pnlOnly ? `AND ${pnlAccount()}` : ''
  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS account_name,
       Tili.tyyppi AS account_type,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.selite AS description,
       Vienti.alvprosentti AS vat_percent,
       Vienti.kohdennus AS allocation_id,
       json_extract(Kohdennus.json, '$.nimi.fi') AS allocation_name,
       Tosite.id AS voucher_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.tyyppi AS voucher_type,
       Tosite.sarja AS voucher_series,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     JOIN Kohdennus ON Vienti.kohdennus = Kohdennus.id
     LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE ${SQL_POSTED}
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
       ${pnlSql}
       ${allocationFilterSql(includeProjects)}
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.rivi, Vienti.id`,
    [startDate, endDate, ...filterParams(allocationId, includeProjects)],
  )

  const out = []
  for (const row of rows) {
    const account = Number(row.account)
    const type = String(row.account_type || '')
    if (pnlOnly && !isPnlAccount(account, type)) continue
    out.push({
      id: Number(row.id),
      date: String(row.date),
      account,
      account_name: String(row.account_name || ''),
      account_type: type,
      debit_cents: centsOrNull(row.debetsnt),
      credit_cents: centsOrNull(row.kreditsnt),
      description: String(row.description || ''),
      vat_percent: row.vat_percent == null ? null : Number(row.vat_percent),
      allocation: {
        id: Number(row.allocation_id),
        name: String(row.allocation_name || ''),
      },
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
    })
  }
  return out
}

export { parseJson }
