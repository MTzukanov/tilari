/**
 * A period's dividends as the ledger shows them, read on every load and never stored. A decision
 * credits Osingonjako and a payment debits it. A payment is that voucher, not cash leaving the bank:
 * a dividend can be paid by turning it into a debt to the shareholder. The payment credits the
 * withholding, and a later line debiting the withholding account remits it.
 */
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_OPENING } from '../../../vouchers'
import { nextWorkingDay } from './deadlines'
import { lastEndedBefore, type PeriodRange } from './suggest'

/** Osingonjako and Ennakonpidätysvelka in Kitsas's chart. `statementTemplate.ts` reads 2261 too. */
export const DISTRIBUTION_ACCOUNT = 2261
export const WITHHOLDING_ACCOUNT = 2921

export type DividendPayment = {
  voucher_id: number
  date: string
  /** The part of the voucher's debit on Osingonjako that pays this dividend. */
  amount_snt: number
  /** Credited to the withholding account on the voucher. */
  withheld_snt: number
  /** The voucher credits a liability other than the withholding: the dividend became a debt. */
  debt: boolean
}

export type Remittance = { voucher_id: number; date: string; amount_snt: number }

export type Dividend = {
  decision: { voucher_id: number; date: string; amount_snt: number }
  /** Oldest first. */
  payments: DividendPayment[]
  paid_snt: number
  withheld_snt: number
  /** What lines debiting the withholding account have covered, oldest withholding first. */
  remitted_snt: number
  remittances: Remittance[]
  /** The oldest unremitted withholding's due day, else the last one's. Null without withholding. */
  withholding_due: string | null
}

export type PeriodDividend = {
  /** Oldest first. */
  dividends: Dividend[]
  /** The first payment's date. Its year sets when the annual report is due. */
  paid: string | null
  /** For the deadline: the earliest open due day, else the last; null without withholding. */
  withholding: { due: string; open_snt: number } | null
}

/** Withholding on a dividend is remitted by the 12th of the month after its payment (Vero). */
export function withholdingDue(paid: string): string {
  const [year, month] = paid.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
  return nextWorkingDay(`${next}-12`)
}

type Line = { voucher_id: number; date: string; debit: number; credit: number }

function postedLines(db: SqliteDb, account: number, withOpening: boolean): Line[] {
  // A credit goes before a debit on the same day: a decision and its payment can share a date.
  return db
    .all<{ tosite: number; pvm: string; debit: number | null; credit: number | null }>(
      `SELECT Vienti.tosite AS tosite, Vienti.pvm AS pvm, Vienti.debetsnt AS debit, Vienti.kreditsnt AS credit
       FROM Vienti JOIN Tosite ON Tosite.id = Vienti.tosite
       WHERE Vienti.tili = ? AND ${SQL_POSTED} ${withOpening ? '' : `AND Tosite.tyyppi <> ${TYPE_OPENING}`}
       ORDER BY Vienti.pvm, COALESCE(Vienti.kreditsnt, 0) > 0 DESC, Vienti.id`,
      [account],
    )
    .map((r) => ({ voucher_id: Number(r.tosite), date: String(r.pvm), debit: Number(r.debit ?? 0), credit: Number(r.credit ?? 0) }))
}

/** By `Tilikausi.loppuu` of the period whose profit is distributed: the last one ended before the decision. */
export function dividendsByPeriod(db: SqliteDb, periods: PeriodRange[]): Map<string, PeriodDividend> {
  const all: Dividend[] = []
  const byDecision = new Map<number, Dividend>()
  const sourceOf = new Map<Dividend, string>()
  for (const line of postedLines(db, DISTRIBUTION_ACCOUNT, false)) {
    if (line.credit > 0) {
      const known = byDecision.get(line.voucher_id)
      if (known) {
        known.decision.amount_snt += line.credit
        continue
      }
      const ends = lastEndedBefore(periods, line.date)
      if (ends == null) continue
      const dividend: Dividend = {
        decision: { voucher_id: line.voucher_id, date: line.date, amount_snt: line.credit },
        payments: [],
        paid_snt: 0,
        withheld_snt: 0,
        remitted_snt: 0,
        remittances: [],
        withholding_due: null,
      }
      all.push(dividend)
      byDecision.set(line.voucher_id, dividend)
      sourceOf.set(dividend, ends)
    } else if (line.debit > 0) {
      payDecisions(all, line)
    }
  }
  readPaymentVouchers(db, all)
  remitWithholding(db, all)

  const out = new Map<string, PeriodDividend>()
  for (const dividend of all) {
    const ends = sourceOf.get(dividend)!
    const entry = out.get(ends) ?? { dividends: [], paid: null, withholding: null }
    entry.dividends.push(dividend)
    out.set(ends, entry)
  }
  for (const entry of out.values()) {
    entry.paid = entry.dividends.flatMap((d) => d.payments.map((p) => p.date)).sort()[0] ?? null
    entry.withholding = periodWithholding(entry.dividends)
  }
  return out
}

/** The oldest decision with something unpaid first. What no decision is open for goes on the latest, as a difference. */
function payDecisions(all: Dividend[], line: Line): void {
  let left = line.debit
  const pay = (dividend: Dividend, amount: number) => {
    const same = dividend.payments.find((p) => p.voucher_id === line.voucher_id)
    if (same) same.amount_snt += amount
    else dividend.payments.push({ voucher_id: line.voucher_id, date: line.date, amount_snt: amount, withheld_snt: 0, debt: false })
    dividend.paid_snt += amount
    left -= amount
  }
  for (const dividend of all) {
    if (left <= 0) break
    const open = dividend.decision.amount_snt - dividend.paid_snt
    if (open > 0 && dividend.decision.date <= line.date) pay(dividend, Math.min(open, left))
  }
  const latest = all.filter((d) => d.decision.date <= line.date).at(-1)
  if (left > 0 && latest) pay(latest, left)
}

/** Withheld amounts, and whether a payment left a debt behind. A voucher paying two decisions withholds for the first. */
function readPaymentVouchers(db: SqliteDb, all: Dividend[]): void {
  const ids = [...new Set(all.flatMap((d) => d.payments.map((p) => p.voucher_id)))].filter(Number.isSafeInteger)
  if (!ids.length) return
  const lines = db.all<{ tosite: number; tili: number; credit: number | null }>(
    `SELECT tosite, tili, kreditsnt AS credit FROM Vienti WHERE tosite IN (${ids.join(',')})`,
  )
  const counted = new Set<number>()
  for (const dividend of all) {
    for (const payment of dividend.payments) {
      const own = lines.filter((l) => Number(l.tosite) === payment.voucher_id && Number(l.credit ?? 0) > 0)
      // A liability, not the withholding and not Osingonjako itself: the dividend was left owing.
      payment.debt = own.some((l) => String(l.tili).startsWith('2') && ![WITHHOLDING_ACCOUNT, DISTRIBUTION_ACCOUNT].includes(Number(l.tili)))
      if (counted.has(payment.voucher_id)) continue
      counted.add(payment.voucher_id)
      payment.withheld_snt = own.filter((l) => Number(l.tili) === WITHHOLDING_ACCOUNT).reduce((sum, l) => sum + Number(l.credit), 0)
      dividend.withheld_snt += payment.withheld_snt
    }
  }
}

/** Every credit on the withholding account waits its turn, oldest first, whatever it came from. */
function remitWithholding(db: SqliteDb, all: Dividend[]): void {
  const owner = new Map<number, Dividend>()
  for (const dividend of all) for (const p of dividend.payments) if (p.withheld_snt > 0 && !owner.has(p.voucher_id)) owner.set(p.voucher_id, dividend)
  if (!owner.size) return
  const queue: { open: number; date: string; dividend: Dividend | undefined }[] = []
  for (const line of postedLines(db, WITHHOLDING_ACCOUNT, true)) {
    if (line.credit > 0) {
      queue.push({ open: line.credit, date: line.date, dividend: owner.get(line.voucher_id) })
      continue
    }
    let left = line.debit
    for (const item of queue) {
      if (left <= 0) break
      if (item.open <= 0) continue
      const amount = Math.min(item.open, left)
      item.open -= amount
      left -= amount
      if (!item.dividend) continue
      item.dividend.remitted_snt += amount
      const same = item.dividend.remittances.find((r) => r.voucher_id === line.voucher_id)
      if (same) same.amount_snt += amount
      else item.dividend.remittances.push({ voucher_id: line.voucher_id, date: line.date, amount_snt: amount })
    }
  }
  for (const dividend of all) {
    const own = queue.filter((item) => item.dividend === dividend)
    const due = (own.find((item) => item.open > 0) ?? own.at(-1))?.date
    dividend.withholding_due = due ? withholdingDue(due) : null
  }
}

function periodWithholding(dividends: Dividend[]): PeriodDividend['withholding'] {
  const withheld = dividends.filter((d) => d.withheld_snt > 0 && d.withholding_due)
  if (!withheld.length) return null
  const open = withheld.filter((d) => d.remitted_snt < d.withheld_snt)
  const due = (open.length ? open : withheld).map((d) => d.withholding_due!).sort()[open.length ? 0 : withheld.length - 1]
  return { due, open_snt: open.reduce((sum, d) => sum + d.withheld_snt - d.remitted_snt, 0) }
}
