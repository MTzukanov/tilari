/**
 * Lease reminders (ADR-030): what the owner should act on soon, read from the stored leases and
 * water settlements on the as-of date. Computed every time, never stored. Pure.
 */
import { addDays, addMonths, dayCount, monthEnd } from '../../../months'
import { leaseState, termsAt } from './rent'
import type { DocumentSkip, Lease, PropertyDoc, Warning, WaterSettlement, WaterSettlementView } from './types'

/** A lease ending this soon without a next one is a reminder. */
export const LEASE_ENDING_DAYS = 90
/** How long before the anniversary an increase is a reminder. */
export const INCREASE_AHEAD_DAYS = 60
/** An increase is due when the last change of rent is at least this long before the anniversary. */
export const INCREASE_GAP_MONTHS = 11
/** After the company's settlement, a share with no letter is a reminder. */
export const WATER_LETTER_DAYS = 30
/** After the company's settlement, a share not settled to the cent is a reminder. */
export const WATER_OPEN_DAYS = 60
/** Water advances with no settlement period ending in this time are a reminder. */
export const WATER_SETTLEMENT_MONTHS = 15

/**
 * Notes, not things to act on: the setup's sale costs, and how a sale shared with another object
 * was counted. The object page lists them; the portfolio does not mark a row for them.
 */
export const NOTE_CODES = new Set(['sale_costs_unset', 'sale_carried', 'sale_line_split'])

/** The warnings to act on: all but the notes. */
export function actionable<T extends { code: string }>(warnings: T[]): T[] {
  return warnings.filter((w) => !NOTE_CODES.has(w.code))
}

/**
 * What a portfolio row has to act on, as the list, its marks and the header count it: none for a
 * cost centre not set up yet - the setup banner asks about those.
 */
export function rowAlerts<T extends { code: string }>(row: { configured: boolean; warnings: T[] }): T[] {
  return row.configured ? actionable(row.warnings) : []
}

/** What the book has that the owner has not defined on the object yet. */
export type Pending = {
  /** Suggested leases whose days no stored lease covers. */
  leases: number
  /** Water settlements the booked lines suggest. */
  water: number
  /** Deposits still held, booked on the object, linked to no lease. */
  deposits: { count: number; amount_snt: number }
}

/** The same day `months` earlier, or the month's last day when it has fewer days. */
export function monthsBefore(date: string, months: number): string {
  const key = addMonths(date.slice(0, 7), -months)
  const last = monthEnd(key)
  return date.slice(8, 10) > last.slice(8, 10) ? last : `${key}-${date.slice(8, 10)}`
}

export type ReminderInput = {
  leases: Lease[]
  /** The stored settlements, and their views with the lines booked up to the as-of date. */
  settlements: WaterSettlement[]
  views: WaterSettlementView[]
  asOf: string
  /** Still held (not sold): only then are vacancy, endings, increases and missing settlements reminders. */
  held: boolean
  /** The first day the owner's rent counts (ADR-026): water advances before it are not the owner's to settle. */
  rentFrom: string
  /** The tenant's name for the texts; '' when unknown. */
  tenant: (lease: Lease) => string
  pending?: Pending
}

export function reminders(input: ReminderInput): Warning[] {
  const out: Warning[] = []
  if (input.held && input.leases.length) {
    out.push(...vacancy(input.leases, input.asOf))
    for (const lease of input.leases) {
      if (leaseState(lease, input.asOf) !== 'current') continue
      const ending = leaseEnding(lease, input.leases, input.asOf)
      if (ending) out.push({ code: 'lease_ending', params: { tenant: input.tenant(lease), ends_date: ending } })
      const due = increaseDue(lease, input.asOf)
      if (due) out.push({ code: 'increase_due', params: { tenant: input.tenant(lease), from_date: due } })
    }
    const missing = settlementMissing(input.leases, input.settlements, input.asOf, input.rentFrom)
    if (missing) out.push(missing)
  }
  out.push(...waterShares(input.views, input.asOf))
  const pending = input.pending
  if (pending?.leases) out.push({ code: 'lease_suggestions', params: { count: pending.leases } })
  if (pending?.water) out.push({ code: 'water_suggestions', params: { count: pending.water } })
  if (pending?.deposits.count) out.push({ code: 'deposits_unlinked', params: { count: pending.deposits.count, amount_snt: pending.deposits.amount_snt } })
  if (input.held) out.push(...missingDocuments(input.leases, input.settlements, input.tenant))
  return out
}

/**
 * Documents the stored data has a place for but no voucher in: each lease's contract, each
 * increase's notice (the steps after the starting rent), each agreed exception's agreement, and
 * each water settlement's statement from the company. The water letter to a tenant is
 * `water_letter_missing`, and only while the share is open. All but the contract carry `skip`:
 * the owner may say there is none (`no_document`), and then it is not asked for.
 */
export function missingDocuments(leases: Lease[], settlements: WaterSettlement[], tenant: (lease: Lease) => string): Warning[] {
  const out: Warning[] = []
  for (const lease of leases) {
    const name = tenant(lease)
    if (lease.doc_voucher_id == null) out.push({ code: 'lease_contract_missing', params: { tenant: name, starts_date: lease.starts } })
    for (const step of lease.rents.slice(1)) {
      if (step.voucher_id != null || step.no_document) continue
      out.push({
        code: 'increase_notice_missing',
        params: { tenant: name, from_date: step.from },
        skip: { kind: 'increase_notice', lease_key: lease.key, from: step.from },
      })
    }
    for (const e of lease.exceptions ?? []) {
      if (e.voucher_id != null || e.no_document) continue
      out.push({
        code: 'exception_agreement_missing',
        params: { tenant: name, from_date: e.from, to_date: e.to },
        skip: { kind: 'exception_agreement', lease_key: lease.key, from: e.from },
      })
    }
  }
  for (const s of settlements) {
    if (s.voucher_id != null || s.no_document) continue
    out.push({ code: 'water_statement_missing', params: { from_date: s.from, to_date: s.to }, skip: { kind: 'water_statement', key: s.key } })
  }
  return out
}

/** The document with the owner's word that the skipped item has no document; unchanged when the item is gone. */
export function skipDocument(doc: PropertyDoc, skip: DocumentSkip): PropertyDoc {
  if (skip.kind === 'water_statement') {
    const settlements = (doc.water_settlements ?? []).map((s) => (s.key === skip.key ? { ...s, no_document: true as const } : s))
    return { ...doc, water_settlements: settlements }
  }
  const leases = (doc.leases ?? []).map((lease) => {
    if (lease.key !== skip.lease_key) return lease
    if (skip.kind === 'increase_notice') {
      return { ...lease, rents: lease.rents.map((r) => (r.from === skip.from ? { ...r, no_document: true as const } : r)) }
    }
    return { ...lease, exceptions: (lease.exceptions ?? []).map((e) => (e.from === skip.from ? { ...e, no_document: true as const } : e)) }
  })
  return { ...doc, leases }
}

/**
 * Suggested leases still to define: those no stored lease shares a day with. One that a stored
 * lease covers is answered, though its payer differs (a care company paying for the tenant).
 */
export function openSuggestions(suggested: Lease[], stored: Lease[], asOf: string): number {
  const overlaps = (a: Lease, b: Lease) => a.starts <= (b.ends ?? asOf) && b.starts <= (a.ends ?? asOf)
  return suggested.filter((s) => !stored.some((l) => overlaps(s, l))).length
}

/**
 * No lease runs on the as-of date: since the last one ended, or until the next one starts. Only
 * an object with stored leases; without them, the book's suggestions show instead.
 */
export function vacancy(leases: Lease[], asOf: string): Warning[] {
  if (!leases.length || leases.some((l) => leaseState(l, asOf) === 'current')) return []
  const next = leases.filter((l) => l.starts > asOf).sort((a, b) => a.starts.localeCompare(b.starts))[0]
  if (next) return [{ code: 'vacant_until', params: { starts_date: next.starts } }]
  const ended = leases.flatMap((l) => (l.ends && l.ends < asOf ? [l.ends] : [])).sort()
  const last = ended[ended.length - 1]
  return last ? [{ code: 'vacant', params: { from_date: addDays(last, 1) } }] : []
}

/** The running lease's end when it falls within `LEASE_ENDING_DAYS` and no later lease is stored. */
export function leaseEnding(lease: Lease, leases: Lease[], asOf: string): string | null {
  if (!lease.ends || lease.ends > addDays(asOf, LEASE_ENDING_DAYS)) return null
  if (leases.some((l) => l !== lease && l.starts > lease.ends!)) return null
  return lease.ends
}

/**
 * The anniversary an increase is due on: the first of the clause's month (else the lease's start
 * month) from this month on, within `INCREASE_AHEAD_DAYS`, while the lease still runs, when the
 * rent last changed at least `INCREASE_GAP_MONTHS` before it. The increase clause must be set
 * (not `none`); Tilari never raises the rent itself (ADR-025).
 */
export function increaseDue(lease: Lease, asOf: string): string | null {
  const rule = lease.increase
  if (!rule || rule.kind === 'none') return null
  const month = String(rule.month ?? Number(lease.starts.slice(5, 7))).padStart(2, '0')
  let year = Number(asOf.slice(0, 4))
  if (`${year}-${month}` < asOf.slice(0, 7)) year += 1
  const due = `${year}-${month}-01`
  if (due > addDays(asOf, INCREASE_AHEAD_DAYS)) return null
  if (lease.ends && lease.ends < due) return null
  const changed = lease.rents.reduce((last, step) => (step.from > last ? step.from : last), lease.starts)
  return changed <= monthsBefore(due, INCREASE_GAP_MONTHS) ? due : null
}

/** Water advances agreed on `date` (an exception's or the step's). */
function advanceOn(lease: Lease, date: string): number {
  return lease.water === 'flat' ? 0 : (termsAt(lease, date)?.water_snt ?? 0)
}

/**
 * A running lease pays water advances, but no stored settlement period ended in the last
 * `WATER_SETTLEMENT_MONTHS`; with none at all, counted from the first advance the owner had.
 */
export function settlementMissing(leases: Lease[], settlements: WaterSettlement[], asOf: string, rentFrom: string): Warning | null {
  const running = leases.find((l) => leaseState(l, asOf) === 'current' && advanceOn(l, asOf) > 0)
  if (!running) return null
  const limit = monthsBefore(asOf, WATER_SETTLEMENT_MONTHS)
  const ended = settlements.filter((s) => s.to <= asOf).map((s) => s.to).sort()
  const last = ended[ended.length - 1]
  if (last) return last < limit ? { code: 'water_settlement_missing', params: { to_date: last } } : null
  const starts = leases.flatMap((l) => {
    if (l.water === 'flat') return []
    const step = l.rents.find((r) => (r.water_snt ?? 0) > 0)
    return step ? [step.from > l.starts ? step.from : l.starts] : []
  })
  const first = starts.sort()[0]
  if (!first) return null
  const since = first > rentFrom ? first : rentFrom
  return since < limit ? { code: 'water_settlement_none', params: { from_date: since } } : null
}

/**
 * Tenant shares of a stored settlement not settled to the cent (ADR-025, exact): with no letter
 * `WATER_LETTER_DAYS` after the company's settlement, still open `WATER_OPEN_DAYS` after it. The
 * company's settlement is its first booked line, else its statement, else the period's end.
 */
export function waterShares(views: WaterSettlementView[], asOf: string): Warning[] {
  const out: Warning[] = []
  for (const view of views) {
    const booked = view.booked.map((b) => b.date).sort()[0]
    const settledOn = booked ?? view.statement?.date ?? view.to
    if (settledOn > asOf) continue
    const age = dayCount(settledOn, asOf) - 1
    for (const share of view.shares) {
      if (share.status === 'none' || share.status === 'settled') continue
      const name = share.tenant ?? ''
      const period = { from_date: view.from, to_date: view.to }
      // + the tenant still owes, - still to refund (or paid too much).
      const left = share.balance_snt - share.settled_snt
      if (age > WATER_OPEN_DAYS) {
        out.push({ code: left > 0 ? 'water_tenant_owes' : 'water_refund_due', params: { tenant: name, ...period, amount_snt: Math.abs(left) } })
      } else if (age > WATER_LETTER_DAYS && !share.letter) {
        out.push({ code: 'water_letter_missing', params: { tenant: name, ...period } })
      }
    }
  }
  return out
}
