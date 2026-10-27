/**
 * Periods of an object that may not share days: its leases, and its water settlement periods. A
 * day in two leases would expect rent twice, a day in two settlements count the tenants' water
 * twice. A lease's agreed exceptions are checked with the lease (`doc.ts`). Pure.
 */
import type { Lease, WaterSettlement } from './types'

/** A stretch of days, both ends included; `to` null runs on. */
type Span = { from: string; to: string | null }

/**
 * Pairs of items whose days meet, in start order: each item that starts on or before the end of
 * an earlier one, with the earlier one reaching furthest.
 */
export function overlaps<T>(items: T[], span: (item: T) => Span): [T, T][] {
  const sorted = items.map((item) => ({ item, ...span(item) })).sort((a, b) => a.from.localeCompare(b.from))
  const out: [T, T][] = []
  let reach: (typeof sorted)[number] | null = null
  for (const x of sorted) {
    if (reach && (reach.to == null || x.from <= reach.to)) out.push([reach.item, x.item])
    if (!reach || (reach.to != null && (x.to == null || x.to > reach.to))) reach = x
  }
  return out
}

export const leaseOverlaps = (leases: Lease[]) => overlaps(leases, (l) => ({ from: l.starts, to: l.ends ?? null }))

export const settlementOverlaps = (settlements: WaterSettlement[]) => overlaps(settlements, (s) => ({ from: s.from, to: s.to }))
