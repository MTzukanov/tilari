import { getAccounts, periodForDate } from './access'
import { computeAccountOpening, computeBalances, entryDelta } from './balances'
import { listEntries } from './entries'
import type { SqliteDb } from './sqlite'

export function balancesWithLines(db: SqliteDb, date: string) {
  const accs = getAccounts(db)
  const result = computeBalances(db, date)
  const byNumber = new Map(accs.map((a) => [String(a.number), a]))

  function sectionFor(num: string): 'assets' | 'liabilities' | 'profit' {
    if (num < '3') return num.startsWith('1') ? 'assets' : 'liabilities'
    return 'profit'
  }

  const lines = Object.keys(result.balances)
    .sort()
    .map((number) => {
      const acc = byNumber.get(number)
      return {
        number: Number(number),
        name: acc?.name ?? '',
        type: acc?.type ?? '',
        balance_cents: result.balances[number],
        section: sectionFor(number),
      }
    })

  return {
    date: result.date,
    period: result.period,
    lines,
    balances: result.balances,
  }
}

export function entriesWithRunning(
  db: SqliteDb,
  account: number,
  startDate: string,
  endDate: string,
) {
  const accs = getAccounts(db)
  const acc = accs.find((a) => a.number === account)
  const type = acc?.type || ''
  const entries = listEntries(db, { account, startDate, endDate })
  const openingCents = computeAccountOpening(db, account, startDate, { type })
  const debitSum = entries.reduce((s, e) => s + (e.debit_cents || 0), 0)
  const creditSum = entries.reduce((s, e) => s + (e.credit_cents || 0), 0)
  // P&L balances restart at each fiscal year (Kitsas saldot for TULOS accounts).
  const isPnl = type.startsWith('C') || type.startsWith('D') || String(account) >= '3'
  let yearEnds = periodForDate(db, startDate)?.ends ?? null
  let running = openingCents
  for (const entry of entries) {
    if (isPnl && yearEnds && entry.date > yearEnds) {
      running = 0
      yearEnds = periodForDate(db, entry.date)?.ends ?? null
    }
    running += entryDelta(account, entry.debit_cents, entry.credit_cents, type || null)
    ;    (entry as typeof entry & { balance_cents: number }).balance_cents = running
  }
  const endPeriod = periodForDate(db, endDate)
  const balancesRes = endPeriod ? computeBalances(db, endDate) : null
  const closingCents = balancesRes ? (balancesRes.balances[String(account)] ?? 0) : running
  return {
    account,
    name: acc?.name ?? '',
    type,
    start_date: startDate,
    end_date: endDate,
    period: balancesRes?.period ?? { starts: startDate, ends: endDate },
    opening_cents: openingCents,
    entries: entries as (typeof entries[number] & { balance_cents: number })[],
    debit_sum_cents: debitSum,
    credit_sum_cents: creditSum,
    closing_cents: closingCents,
    count: entries.length,
  }
}
