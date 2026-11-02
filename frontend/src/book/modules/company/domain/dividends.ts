/**
 * What the ledger shows of a period's dividend, read on every load and never stored. The decision
 * credits Osingonjako and the payment debits it. A payment is that voucher, not cash leaving the bank:
 * a dividend can be paid by turning it into a debt to the shareholder.
 */
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_OPENING } from '../../../vouchers'
import { lastEndedBefore, type PeriodRange } from './suggest'

/** Osingonjako in Kitsas's chart, the number `statementTemplate.ts` also reads. */
const DISTRIBUTION_ACCOUNT = 2261

export type PeriodDividend = {
  /** The first payment's date, null before it is paid. Its year sets when the annual report is due. */
  paid: string | null
}

/** By `Tilikausi.loppuu` of the period whose profit is distributed: the last one ended before the decision. */
export function dividendsByPeriod(db: SqliteDb, periods: PeriodRange[]): Map<string, PeriodDividend> {
  const lines = db.all<{ pvm: string; credit: number | null }>(
    `SELECT Vienti.pvm AS pvm, Vienti.kreditsnt AS credit
     FROM Vienti JOIN Tosite ON Tosite.id = Vienti.tosite
     WHERE Vienti.tili = ? AND ${SQL_POSTED} AND Tosite.tyyppi <> ?
     ORDER BY Vienti.pvm, COALESCE(Vienti.kreditsnt, 0) > 0 DESC, Vienti.id`,
    [DISTRIBUTION_ACCOUNT, TYPE_OPENING],
  )
  const out = new Map<string, PeriodDividend>()
  let latest: PeriodDividend | null = null
  for (const line of lines) {
    const date = String(line.pvm)
    if (Number(line.credit ?? 0) > 0) {
      const ends = lastEndedBefore(periods, date)
      latest = ends == null ? null : (out.get(ends) ?? { paid: null })
      if (ends != null && latest) out.set(ends, latest)
    } else if (latest && latest.paid == null) {
      latest.paid = date
    }
  }
  return out
}
