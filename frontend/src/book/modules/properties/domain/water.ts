/**
 * Water advances and settlements (vesitasaukset). The housing company settles the apartment's
 * water against actual use once a year or more often; the owner settles each tenant's share in
 * turn. Shares are computed from the leases: the period's use (or, without it, the company's
 * difference) split by the lease's days, less the advances the lease agreed. Pure (ADR-025).
 */
import { addMonths, monthEnd } from '../../../months'
import type { PnlRow, VoucherRef } from './ledger'
import { isWaterSettlementText, mentionsRent, titlePeriod } from './leaseSuggest'
import { leaseState, rentAt, rentTotal } from './rent'
import { isIncome } from './series'
import type {
  BookedLine,
  Lease,
  LeaseVoucher,
  WaterSettlement,
  WaterSettlementView,
  WaterShareStatus,
  WaterShareView,
} from './types'

const DAY = 86_400_000
const ms = (date: string) => Date.parse(`${date}T00:00:00Z`)
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Days from `from` to `to`, both counted. */
export function dayCount(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / DAY) + 1
}

function addDays(date: string, days: number): string {
  return isoOf(ms(date) + days * DAY)
}

function daysInMonth(date: string): number {
  return Number(monthEnd(date).slice(8, 10))
}

function daysApart(a: string, b: string): number {
  return Math.abs(ms(a) - ms(b)) / DAY
}

/** The year up to `to`: 31.10.2023 gives 1.11.2022-31.10.2023, 29.2.2024 gives 1.3.2023-29.2.2024. */
export function yearBefore(to: string): { from: string; to: string } {
  const key = `${Number(to.slice(0, 4)) - 1}-${to.slice(5, 7)}`
  const day = Math.min(Number(to.slice(8, 10)), daysInMonth(key))
  return { from: addDays(`${key}-${String(day).padStart(2, '0')}`, 1), to }
}

/** The lease's part of a period, or null when it does not overlap. */
export function leaseSpan(lease: Lease, from: string, to: string): { from: string; to: string } | null {
  const start = lease.starts > from ? lease.starts : from
  const end = lease.ends && lease.ends < to ? lease.ends : to
  return start <= end ? { from: start, to: end } : null
}

/** Water advances the lease agreed from `from` to `to`: each month's amount over its days. */
export function advanceBetween(lease: Lease, from: string, to: string): number {
  let total = 0
  for (let t = ms(from); t <= ms(to); t += DAY) {
    const day = isoOf(t)
    let water = 0
    for (const step of lease.rents) if (step.from <= day) water = step.water_snt ?? 0
    if (water) total += water / daysInMonth(day)
  }
  return Math.round(total)
}

/** A tenant's share as computed from the settlement and the leases. */
export type ShareResult = {
  lease: Lease
  from: string
  to: string
  days: number
  advance_snt: number
  usage_snt: number | null
  computed_snt: number
  balance_snt: number
  own: boolean
  voucher_id?: number
}

/**
 * The tenants' shares of a settlement: every lease in the period whose water is an advance (the
 * default; not a flat fee), and every lease the settlement stores a share for. A share is the
 * period's use by the lease's days less its advances; without the use, the company's difference
 * by days. The period's days count, so vacant days stay the owner's.
 */
export function settlementShares(settlement: WaterSettlement, leases: Lease[]): ShareResult[] {
  const periodDays = dayCount(settlement.from, settlement.to)
  const stored = new Map((settlement.shares ?? []).map((s) => [s.lease_key, s]))
  const out: ShareResult[] = []
  for (const lease of leases) {
    const share = stored.get(lease.key)
    const span = leaseSpan(lease, settlement.from, settlement.to)
    const advance = span ? advanceBetween(lease, span.from, span.to) : 0
    if (!share && (lease.water === 'flat' || !span)) continue
    const days = span ? dayCount(span.from, span.to) : 0
    const usage = settlement.usage_snt != null ? Math.round((settlement.usage_snt * days) / periodDays) : null
    const computed = usage != null ? usage - advance : Math.round((settlement.difference_snt * days) / periodDays)
    const own = share?.balance_snt != null
    out.push({
      lease,
      from: span?.from ?? settlement.from,
      to: span?.to ?? settlement.to,
      days,
      advance_snt: advance,
      usage_snt: usage,
      computed_snt: computed,
      balance_snt: own ? share.balance_snt! : computed,
      own,
      voucher_id: share?.voucher_id,
    })
  }
  return out
}

/** A booked line on the object about a water settlement. */
export type WaterLine = {
  id: number
  date: string
  voucher_id: number
  /** credit - debit without VAT. */
  net_snt: number
  /** On an income account (a tenant's payment or refund), else an expense account (the company). */
  income: boolean
  text: string
  partner_id: number | null
}

export function waterLines(rows: PnlRow[]): WaterLine[] {
  return rows
    .filter((r) => isWaterSettlementText(r.text))
    .map((r) => ({
      id: r.id,
      date: r.date,
      voucher_id: r.voucher_id,
      net_snt: r.net_snt,
      income: isIncome(r),
      text: r.text ?? '',
      partner_id: r.partner_id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
}

/** How long after a period's end its settlement lines are looked for. */
const AFTER_DAYS = 270

/** The period end a line's text names: "Vesitasaus 31.10.2023", "vesitasaus 1.11.2022-31.10.2023". */
function namedEnd(text: string): string | undefined {
  const period = titlePeriod(text)
  return period.ends ?? period.starts
}

/**
 * The settlement a line belongs to: the one whose end its text names, else the latest that ended
 * before it (within nine months). A text naming another end belongs to none.
 */
export function settlementFor(line: WaterLine, settlements: WaterSettlement[]): WaterSettlement | undefined {
  const named = namedEnd(line.text)
  if (named) return settlements.find((s) => daysApart(s.to, named) <= 31)
  let best: WaterSettlement | undefined
  for (const s of settlements) {
    if (s.to < line.date && dayCount(s.to, line.date) <= AFTER_DAYS && (!best || s.to > best.to)) best = s
  }
  return best
}

/**
 * The company's lines and the tenants'. The company's are on expense accounts with the
 * settlement's sign (a debit for an extra charge, a credit for a refund); a refund passed on to
 * the tenant on the same account has the other sign.
 */
function splitLines(difference: number, lines: WaterLine[]): { company: WaterLine[]; tenant: WaterLine[] } {
  const sign = -Math.sign(difference)
  const isCompany = (l: WaterLine) => !l.income && (sign === 0 || Math.sign(l.net_snt) === sign)
  return { company: lines.filter(isCompany), tenant: lines.filter((l) => !isCompany(l)) }
}

/** The lease a tenant's line is about: the payer's, else the one running then, else the last ended. */
function leaseOf<T extends { lease: Lease }>(line: WaterLine, items: T[]): T | undefined {
  if (line.partner_id != null) {
    const own = items.find((i) => i.lease.tenant_partner_id === line.partner_id)
    if (own) return own
  }
  const running = items.filter((i) => leaseState(i.lease, line.date) === 'current')
  if (running.length) return running[running.length - 1]
  const ended = items.filter((i) => i.lease.ends && i.lease.ends < line.date)
  ended.sort((a, b) => a.lease.ends!.localeCompare(b.lease.ends!))
  return ended[ended.length - 1] ?? items[items.length - 1]
}

/** "40e puuttuvaa vesimaksua", "40 euroa puuttuvista vesimaksuista": the euros a text names for water. */
const NAMED_WATER = /(\d+(?:[.,]\d{1,2})?)\s*(?:e|€|eur|euroa)?\s+(?:puuttu|vesi)/

/**
 * What a tenant's line settles. A rent payment that also pays a settlement ("vuokra 630e / 40e
 * puuttuvaa vesimaksua") settles the euros it names, else what it has on top of the rent then;
 * other lines settle in full.
 */
function tenantPart(line: WaterLine, leases: Lease[]): number {
  if (!line.income || !mentionsRent(line.text)) return line.net_snt
  const named = NAMED_WATER.exec(line.text.toLowerCase())
  if (named) return Math.round(Number(named[1].replace(',', '.')) * 100)
  const lease = leaseOf(line, leases.map((l) => ({ lease: l })))?.lease
  const step = lease ? rentAt(lease, line.date) : null
  return step ? Math.max(0, line.net_snt - rentTotal(step)) : 0
}

/**
 * Exact to the cent, with no tolerance: settled only when the lines add up to the balance; less
 * of it is partial, anything else (more, or the other way) is `over`.
 */
export function shareStatus(balance: number, settled: number): WaterShareStatus {
  if (settled === balance) return balance === 0 ? 'none' : 'settled'
  if (settled === 0) return 'open'
  if (Math.sign(settled) === Math.sign(balance) && Math.abs(settled) < Math.abs(balance)) return 'partial'
  return 'over'
}

export type WaterViewContext = {
  tenantName: (lease: Lease) => string | null
  partnerName: (partnerId: number | null) => string | null
  /** Labels of the lines' vouchers and of the linked documents. */
  refs: Map<number, VoucherRef>
}

function voucherOf(refs: Map<number, VoucherRef>, id: number | undefined): LeaseVoucher | null {
  const ref = id != null ? refs.get(id) : undefined
  return ref ? { voucher_id: ref.id, date: ref.date, doc_number: ref.doc_number, series: ref.series, title: ref.title } : null
}

/** A line to show and open: `amount` is the part that counts. */
export function bookedLine(
  line: Pick<WaterLine, 'id' | 'date' | 'voucher_id' | 'net_snt' | 'partner_id'> & { text?: string },
  amount: number,
  ctx: Pick<WaterViewContext, 'partnerName' | 'refs'>,
): BookedLine {
  return {
    line_id: line.id,
    date: line.date,
    amount_snt: amount,
    line_snt: line.net_snt,
    text: line.text ?? '',
    partner: ctx.partnerName(line.partner_id),
    voucher: voucherOf(ctx.refs, line.voucher_id) ?? { voucher_id: line.voucher_id, date: line.date, doc_number: null, series: null, title: '' },
  }
}

/** A settlement as the object page shows it, with its booked lines (those `settlementFor` gives it). */
export function settlementView(
  settlement: WaterSettlement,
  lines: WaterLine[],
  leases: Lease[],
  ctx: WaterViewContext,
): WaterSettlementView {
  const { company, tenant } = splitLines(settlement.difference_snt, lines)
  const shares = settlementShares(settlement, leases)
  const moves = new Map<ShareResult, BookedLine[]>(shares.map((s) => [s, []]))
  const other: BookedLine[] = []
  for (const line of tenant) {
    const part = tenantPart(line, leases)
    if (!part) continue
    const share = leaseOf(line, shares)
    if (share) moves.get(share)!.push(bookedLine(line, part, ctx))
    else other.push(bookedLine(line, part, ctx))
  }
  const views: WaterShareView[] = shares.map((s) => {
    const movements = moves.get(s)!
    const settled = movements.reduce((sum, m) => sum + m.amount_snt, 0)
    return {
      lease_key: s.lease.key,
      tenant: ctx.tenantName(s.lease),
      tenant_partner_id: s.lease.tenant_partner_id ?? null,
      from: s.from,
      to: s.to,
      days: s.days,
      advance_snt: s.advance_snt,
      usage_snt: s.usage_snt,
      computed_snt: s.computed_snt,
      balance_snt: s.balance_snt,
      own: s.own,
      letter: voucherOf(ctx.refs, s.voucher_id),
      movements,
      settled_snt: settled,
      status: shareStatus(s.balance_snt, settled),
    }
  })
  const usage = settlement.usage_snt ?? null
  return {
    key: settlement.key,
    from: settlement.from,
    to: settlement.to,
    days: dayCount(settlement.from, settlement.to),
    difference_snt: settlement.difference_snt,
    usage_snt: usage,
    advance_snt: usage != null ? usage - settlement.difference_snt : null,
    statement: voucherOf(ctx.refs, settlement.voucher_id),
    booked: company.map((l) => bookedLine(l, l.net_snt, ctx)),
    shares: views,
    owner_snt: views.reduce((sum, v) => sum + v.balance_snt, 0) - settlement.difference_snt,
    other,
  }
}

export type SettlementSuggestion = { settlement: WaterSettlement; lines: WaterLine[]; source: 'company' | 'tenant' }

/**
 * Settlements from booked lines that no stored settlement takes. Lines within 100 days of each
 * other (and naming the same period end, if they name one) make one settlement:
 * - its period is the one a text names, a year up to the end a text names, or the year up to
 *   the end of the month before the first line;
 * - its difference is the company's line; with none, what the tenant paid or got back, as if
 *   passed on. The owner checks both against the company's statement.
 */
export function suggestSettlements(lines: WaterLine[], stored: WaterSettlement[], leases: Lease[]): SettlementSuggestion[] {
  const free = lines.filter((l) => !settlementFor(l, stored))
  const groups: { end?: string; lines: WaterLine[] }[] = []
  for (const line of free) {
    const named = namedEnd(line.text)
    const group = groups[groups.length - 1]
    const last = group?.lines[group.lines.length - 1]
    const near = last != null && dayCount(last.date, line.date) <= 100
    const sameEnd = !named || !group?.end || daysApart(group.end, named) <= 31
    if (group && near && sameEnd) {
      group.lines.push(line)
      group.end ??= named
    } else {
      groups.push({ end: named, lines: [line] })
    }
  }
  const out: SettlementSuggestion[] = []
  for (const group of groups) {
    const full = group.lines.map((l) => titlePeriod(l.text)).find((p) => p.starts && p.ends && p.starts < p.ends)
    const period = full
      ? { from: full.starts!, to: full.ends! }
      : yearBefore(group.end ?? monthEnd(addMonths(group.lines[0].date.slice(0, 7), -1)))
    const expense = group.lines.find((l) => !l.income)
    let difference: number
    if (expense) {
      // The first expense line's sign is the company's.
      difference = -splitLines(-expense.net_snt, group.lines).company.reduce((s, l) => s + l.net_snt, 0)
    } else {
      difference = group.lines.reduce((s, l) => s + tenantPart(l, leases), 0)
    }
    if (!difference) continue
    out.push({
      settlement: { key: '', from: period.from, to: period.to, difference_snt: difference },
      lines: group.lines,
      source: expense ? 'company' : 'tenant',
    })
  }
  return out
}

/** Every voucher id the settlements link to: statements and letters. */
export function waterVoucherIds(settlements: WaterSettlement[]): number[] {
  const ids = new Set<number>()
  for (const s of settlements) {
    if (s.voucher_id != null) ids.add(s.voucher_id)
    for (const share of s.shares ?? []) if (share.voucher_id != null) ids.add(share.voucher_id)
  }
  return [...ids]
}
