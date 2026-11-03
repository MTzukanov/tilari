/**
 * What a period's closing left to pay in income tax, or to get back, and what has settled it since.
 * Kitsas's "Tuloverojen kirjaus" (type 9930, `arkisto/tuloverodialog.cpp`) credits Tuloverosiirtovelat
 * with the tax still to pay, or debits Tuloverosiirtosaamiset with what comes back. Later lines on that
 * account settle it, oldest first, whatever voucher they are on: the payment after the tax decision, a
 * refund, or a correction. Read on every load, never stored.
 */
import { getSettings } from '../../../access'
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_OPENING } from '../../../vouchers'
import { lastEndedBefore, type PeriodRange } from './suggest'

/** Kitsas's defaults for its settings `Tuloverosiirtovelat` and `Tuloverosiirtosaamiset`. */
export const TAX_PAYABLE_ACCOUNT = 2968
export const TAX_RECEIVABLE_ACCOUNT = 1813

export type TaxSettlement = {
  direction: 'pay' | 'refund'
  /** What the period's lines put on the account: the income tax booking and later corrections. */
  booked_snt: number
  settled_snt: number
  /** Oldest first. */
  settlements: { voucher_id: number; date: string; amount_snt: number }[]
}

function accountSetting(db: SqliteDb, key: string, fallback: number): number {
  const value = Number(getSettings(db, [key])[key])
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/** A line on a period's last day belongs to it; a later one corrects the last period ended before it. */
function periodOf(periods: PeriodRange[], date: string): string | null {
  return periods.find((p) => p.ends === date)?.ends ?? lastEndedBefore(periods, date)
}

type Item = { open: number; entry: TaxSettlement | undefined }
type Advance = { voucher_id: number; date: string; open: number }

/** By `Tilikausi.loppuu`: a settlement for each way the period's tax went, to pay first. */
export function taxSettlementsByPeriod(db: SqliteDb, periods: PeriodRange[]): Map<string, TaxSettlement[]> {
  const out = new Map<string, TaxSettlement[]>()
  const sides = [
    { direction: 'pay' as const, account: accountSetting(db, 'Tuloverosiirtovelat', TAX_PAYABLE_ACCOUNT), grows: 'credit' as const },
    { direction: 'refund' as const, account: accountSetting(db, 'Tuloverosiirtosaamiset', TAX_RECEIVABLE_ACCOUNT), grows: 'debit' as const },
  ]
  for (const side of sides) {
    const rows = db.all<{ tosite: number; pvm: string; tyyppi: number; debit: number | null; credit: number | null }>(
      `SELECT Vienti.tosite AS tosite, Vienti.pvm AS pvm, Tosite.tyyppi AS tyyppi, Vienti.debetsnt AS debit, Vienti.kreditsnt AS credit
       FROM Vienti JOIN Tosite ON Tosite.id = Vienti.tosite
       WHERE Vienti.tili = ? AND ${SQL_POSTED}
       ORDER BY Vienti.pvm, COALESCE(Vienti.${side.grows === 'credit' ? 'kreditsnt' : 'debetsnt'}, 0) > 0 DESC, Vienti.id`,
      [side.account],
    )
    const byPeriod = new Map<string, TaxSettlement>()
    const queue: Item[] = []
    // What settled more than was booked so far, such as a prepayment on the account: it settles the next booking.
    const advances: Advance[] = []
    const settle = (item: Item, voucherId: number, date: string, amount: number) => {
      item.open -= amount
      if (!item.entry) return
      item.entry.settled_snt += amount
      const same = item.entry.settlements.find((s) => s.voucher_id === voucherId)
      if (same) same.amount_snt += amount
      else item.entry.settlements.push({ voucher_id: voucherId, date, amount_snt: amount })
    }
    for (const row of rows) {
      const debit = Number(row.debit ?? 0)
      const credit = Number(row.credit ?? 0)
      const grows = side.grows === 'credit' ? credit - debit : debit - credit
      const date = String(row.pvm)
      const voucherId = Number(row.tosite)
      if (grows > 0) {
        const ends = Number(row.tyyppi) === TYPE_OPENING ? null : periodOf(periods, date)
        let entry: TaxSettlement | undefined
        if (ends) {
          entry = byPeriod.get(ends) ?? { direction: side.direction, booked_snt: 0, settled_snt: 0, settlements: [] }
          entry.booked_snt += grows
          byPeriod.set(ends, entry)
        }
        const item: Item = { open: grows, entry }
        queue.push(item)
        for (const advance of advances) {
          if (item.open <= 0) break
          const amount = Math.min(advance.open, item.open)
          if (amount <= 0) continue
          advance.open -= amount
          settle(item, advance.voucher_id, advance.date, amount)
        }
      } else if (grows < 0) {
        let left = -grows
        for (const item of queue) {
          if (left <= 0) break
          if (item.open <= 0) continue
          const amount = Math.min(item.open, left)
          left -= amount
          settle(item, voucherId, date, amount)
        }
        if (left > 0) advances.push({ voucher_id: voucherId, date, open: left })
      }
    }
    for (const [ends, entry] of byPeriod) out.set(ends, [...(out.get(ends) ?? []), entry])
  }
  return out
}
