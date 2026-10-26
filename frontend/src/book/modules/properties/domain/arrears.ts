/**
 * Rent accounts per lease (vuokrarästi), exact to the cent (ADR-026): what each stored lease
 * expects month by month - rent, water advance, parking, agreed exceptions and its water
 * settlement shares - what was paid for it, and the running balance. Each lease has its own balance: a new tenant starts
 * at zero, and an ended lease keeps what it left. Pure.
 */
import { addDays, addMonths, dayCount, monthEnd, monthKeys } from '../../../months'
import { leaseState, rentSegments, rentTotal, termsAt } from './rent'
import type { Lease, LeaseException, LeaseRentAccount, RentAccount, RentBalance, RentMonth, WaterSettlement } from './types'
import { bookedLine, settlementShares } from './water'

/** A booked line paid for rent (income) or a water refund passed on; `lease_key` when already known. */
export type RentLine = {
  id: number
  date: string
  voucher_id: number
  net_snt: number
  partner_id: number | null
  text: string
  lease_key?: string
}

/** A water settlement share due from (+) or to (-) a lease's tenant. */
export type WaterCharge = { lease_key: string; date: string; amount_snt: number }

const monthOf = (date: string) => date.slice(0, 7)

/**
 * What the lease expects per month from `from` to `until`: a full month at one set of amounts is
 * its total exactly; a part month (the start, the end, a step or an agreed exception from
 * mid-month) is each stretch's total by days, rounded once per stretch. Days before the first
 * step expect nothing.
 */
export function expectedRent(lease: Lease, from: string, until: string): Map<string, number> {
  const out = new Map<string, number>()
  const start = lease.starts > from ? lease.starts : from
  const end = lease.ends && lease.ends < until ? lease.ends : until
  if (end < start) return out
  for (const key of monthKeys(start, end)) {
    const first = `${key}-01`
    const last = monthEnd(key)
    let amount = 0
    for (const part of rentSegments(lease, start > first ? start : first, end < last ? end : last)) {
      const total = rentTotal(part.terms)
      amount += part.from === first && part.to === last ? total : Math.round((total * dayCount(part.from, part.to)) / dayCount(first, last))
    }
    out.set(key, amount)
  }
  return out
}

/** The agreed exceptions that fall in month `key` between `from` and `until`. */
function exceptionsIn(lease: Lease, key: string, from: string, until: string) {
  const first = `${key}-01` > from ? `${key}-01` : from
  const last = monthEnd(key) < until ? monthEnd(key) : until
  return (lease.exceptions ?? []).filter((e) => e.from <= last && e.to >= first)
}

/**
 * An exception for month `key` that makes it expect `target` exactly (what was paid, less any
 * water settlement due then): the lease's counted days in the month at one monthly total, kept
 * water and parking, the difference taken from the rent (then the water, then the parking when
 * less was paid than those). Null when the month has no counted lease days, is not over yet, already
 * has an exception, or no monthly total gives `target` to the cent on a part month.
 */
export function exceptionPrefill(lease: Lease, key: string, target: number, window: RentWindow): LeaseException | null {
  if (target < 0) return null
  const first = `${key}-01`
  const last = monthEnd(key)
  const from = [first, lease.starts, window.from].reduce((a, b) => (a > b ? a : b))
  const to = lease.ends && lease.ends < last ? lease.ends : last
  if (from > to || window.until < to) return null
  if ((lease.exceptions ?? []).some((e) => e.from <= to && e.to >= from)) return null
  const days = dayCount(from, to)
  const monthDays = dayCount(first, last)
  let total: number | null = target
  if (days !== monthDays) {
    const guess = Math.round((target * monthDays) / days)
    total = [0, -1, 1, -2, 2].map((d) => guess + d).find((t) => t >= 0 && Math.round((t * days) / monthDays) === target) ?? null
  }
  if (total == null) return null
  const step = termsAt({ ...lease, exceptions: [] }, from)
  const parking = Math.min(step?.parking_snt ?? 0, total)
  const water = Math.min(step?.water_snt ?? 0, total - parking)
  const out: LeaseException = { from, to, rent_snt: total - parking - water }
  if (water) out.water_snt = water
  if (parking) out.parking_snt = parking
  return out
}

/**
 * The first day the owner's rent counts: the acquisition, else the books' start. Rent received on
 * the object before a later-dated acquisition (an asset re-booked as a balance item, say) shows
 * the owner had it already: counting then starts from that payment's month.
 */
export function rentCountedFrom(owned: string, payments: Pick<RentLine, 'date'>[]): string {
  const first = payments.reduce<string | null>((min, p) => (min == null || p.date < min ? p.date : min), null)
  return first != null && first < owned ? `${monthOf(first)}-01` : owned
}

/**
 * Each tenant's water settlement share as a charge on their lease: due on the letter's date,
 * else in the month after the period's end.
 */
export function waterCharges(settlements: WaterSettlement[], leases: Lease[], letterDate: (voucherId: number) => string | null): WaterCharge[] {
  const out: WaterCharge[] = []
  for (const settlement of settlements) {
    for (const share of settlementShares(settlement, leases)) {
      if (!share.balance_snt) continue
      const date = (share.voucher_id != null ? letterDate(share.voucher_id) : null) ?? `${addMonths(monthOf(settlement.to), 1)}-01`
      out.push({ lease_key: share.lease.key, date, amount_snt: share.balance_snt })
    }
  }
  return out
}

const within = (date: string, lease: Lease) => leaseState(lease, date) === 'current'

/**
 * The lease a payment is for:
 * 1. the lease whose tenant paid it (from 31 days before its start; after its end too);
 * 2. else the lease running then (the latest started);
 * 3. else the last lease that ended before it (late rent paid by others, e.g. housing allowance);
 * 4. else none (before every lease, or another payer's advance).
 */
export function leaseForLine(line: Pick<RentLine, 'date' | 'partner_id'>, leases: Lease[]): Lease | null {
  const sorted = [...leases].sort((a, b) => a.starts.localeCompare(b.starts) || a.key.localeCompare(b.key))
  if (line.partner_id != null) {
    const own = sorted.filter((l) => l.tenant_partner_id === line.partner_id && line.date >= addDays(l.starts, -31))
    if (own.length) {
      const running = own.filter((l) => within(line.date, l))
      return running[running.length - 1] ?? own.find((l) => l.starts > line.date) ?? own[own.length - 1]
    }
  }
  const running = sorted.filter((l) => within(line.date, l))
  if (running.length) return running[running.length - 1]
  const ended = sorted.filter((l) => l.ends && l.ends < line.date).sort((a, b) => a.ends!.localeCompare(b.ends!))
  return ended[ended.length - 1] ?? null
}

type LineContext = Parameters<typeof bookedLine>[2]

/** The period the owner's rent accounts cover: from `rentCountedFrom`, to the sale or the as-of date. */
export type RentWindow = { from: string; until: string; asOf: string }

function leaseAccount(lease: Lease, lines: RentLine[], charges: WaterCharge[], window: RentWindow, ctx: LineContext): LeaseRentAccount {
  const { asOf } = window
  const rent = expectedRent(lease, window.from, window.until)
  const normal = lease.exceptions?.length ? expectedRent({ ...lease, exceptions: [] }, window.from, window.until) : null
  const water = new Map<string, number>()
  for (const c of charges) if (c.date <= asOf) water.set(monthOf(c.date), (water.get(monthOf(c.date)) ?? 0) + c.amount_snt)
  const paid = new Map<string, RentLine[]>()
  for (const l of lines) paid.set(monthOf(l.date), [...(paid.get(monthOf(l.date)) ?? []), l])
  const keys = [...rent.keys(), ...water.keys(), ...paid.keys()].sort()
  const months: RentMonth[] = []
  let balance = 0
  let expected = 0
  let received = 0
  if (keys.length) {
    for (const key of monthKeys(`${keys[0]}-01`, `${keys[keys.length - 1]}-01`)) {
      const monthRent = rent.get(key) ?? 0
      const monthWater = water.get(key) ?? 0
      const monthLines = (paid.get(key) ?? []).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      const monthPaid = monthLines.reduce((s, l) => s + l.net_snt, 0)
      expected += monthRent + monthWater
      received += monthPaid
      balance += monthRent + monthWater - monthPaid
      const exceptions = normal && rent.has(key) ? exceptionsIn(lease, key, window.from, window.until) : []
      months.push({
        key,
        rent_snt: monthRent,
        ...(exceptions.length
          ? { exception: { normal_snt: normal!.get(key) ?? 0, notes: exceptions.flatMap((e) => (e.note ? [e.note] : [])) } }
          : {}),
        water_snt: monthWater,
        received_snt: monthPaid,
        balance_snt: balance,
        lines: monthLines.map((l) => bookedLine(l, l.net_snt, ctx)),
      })
      const prefill = monthRent + monthWater !== monthPaid ? exceptionPrefill(lease, key, monthPaid - monthWater, window) : null
      if (prefill) months[months.length - 1].exception_prefill = prefill
    }
  }
  return {
    lease_key: lease.key,
    counted_from: lease.starts > window.from ? lease.starts : window.from,
    months,
    expected_snt: expected,
    received_snt: received,
    balance_snt: balance,
  }
}

/** Every started lease's rent account on the as-of date, and the income no lease takes. */
export function rentAccount(input: {
  leases: Lease[]
  lines: RentLine[]
  charges: WaterCharge[]
  window: RentWindow
  ctx: LineContext
}): RentAccount {
  const { leases, window, ctx } = input
  const { asOf } = window
  const keys = new Set(leases.map((l) => l.key))
  const byLease = new Map<string, RentLine[]>()
  const unassigned: RentLine[] = []
  for (const line of input.lines) {
    if (line.date > asOf) continue
    const key = line.lease_key && keys.has(line.lease_key) ? line.lease_key : leaseForLine(line, leases)?.key
    if (key) byLease.set(key, [...(byLease.get(key) ?? []), line])
    else unassigned.push(line)
  }
  return {
    leases: leases
      .filter((l) => l.starts <= asOf || byLease.has(l.key))
      .map((l) => leaseAccount(l, byLease.get(l.key) ?? [], input.charges.filter((c) => c.lease_key === l.key), window, ctx)),
    unassigned: unassigned.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map((l) => bookedLine(l, l.net_snt, ctx)),
  }
}

/** The running lease's balance and what the others left, for the list. */
export function rentBalance(account: RentAccount, running: Lease | null): RentBalance {
  const current = running ? (account.leases.find((a) => a.lease_key === running.key)?.balance_snt ?? 0) : null
  const others = account.leases.filter((a) => a.lease_key !== running?.key).reduce((s, a) => s + a.balance_snt, 0)
  return { current_snt: current, others_snt: others }
}
