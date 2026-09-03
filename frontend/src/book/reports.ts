import { getAccounts } from './access'
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
  const openingCents = computeAccountOpening(db, account, startDate, { endDate, type })
  const balancesRes = computeBalances(db, endDate)
  const debitSum = entries.reduce((s, e) => s + (e.debit_cents || 0), 0)
  const creditSum = entries.reduce((s, e) => s + (e.credit_cents || 0), 0)
  const closingCents = balancesRes.balances[String(account)] ?? 0
  let running = openingCents
  for (const entry of entries) {
    running += entryDelta(account, entry.debit_cents, entry.credit_cents, type || null)
    ;    (entry as typeof entry & { balance_cents: number }).balance_cents = running
  }
  return {
    account,
    name: acc?.name ?? '',
    type,
    start_date: startDate,
    end_date: endDate,
    period: balancesRes.period,
    opening_cents: openingCents,
    entries: entries as (typeof entries[number] & { balance_cents: number })[],
    debit_sum_cents: debitSum,
    credit_sum_cents: creditSum,
    closing_cents: closingCents,
    count: entries.length,
  }
}
