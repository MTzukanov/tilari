/** Water settlement form drafts: strings while editing, the stored settlements on save. */
import { settlementOverlaps } from '../../../book/modules/properties/domain/ranges'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import type { WaterSettlement, WaterShare } from '../api'
import { periodText, saveErrorText } from './format'

type T = (key: string, vars?: Record<string, string | number>) => string

/** A tenant's share as the owner set it: the computed amount, or their own refund or charge. */
export type ShareDraft = {
  base: WaterShare | null
  leaseKey: string
  mode: 'computed' | 'refund' | 'charge'
  amount: string
  /** The letter to the tenant. */
  voucherId: string
}

/** A settlement being edited; `base` keeps the stored one and its unknown keys. */
export type SettlementDraft = {
  base: WaterSettlement | null
  from: string
  to: string
  /** The company's result for the owner: a refund, or an extra charge. */
  direction: 'refund' | 'charge'
  amount: string
  /** The apartment's actual water cost, when the statement gives it. */
  usage: string
  /** The company's statement. */
  voucherId: string
  shares: ShareDraft[]
}

const idText = (id: number | undefined) => (id != null ? String(id) : '')

export function shareDraft(leaseKey: string, base: WaterShare | null = null): ShareDraft {
  const balance = base?.balance_snt
  return {
    base,
    leaseKey,
    mode: balance == null ? 'computed' : balance < 0 ? 'refund' : 'charge',
    amount: balance != null ? formatEurInput(Math.abs(balance)) : '',
    voucherId: idText(base?.voucher_id),
  }
}

/** The shares with `leaseKey`'s changed, adding its draft on the first change. */
export function withShare(shares: ShareDraft[], leaseKey: string, patch: Partial<ShareDraft>): ShareDraft[] {
  const list = shares.some((s) => s.leaseKey === leaseKey) ? shares : [...shares, shareDraft(leaseKey)]
  return list.map((s) => (s.leaseKey === leaseKey ? { ...s, ...patch } : s))
}

export function settlementDrafts(list: WaterSettlement[] | undefined): SettlementDraft[] {
  return (list ?? []).map((s) => ({
    base: s,
    from: s.from,
    to: s.to,
    direction: s.difference_snt > 0 ? 'charge' : 'refund',
    amount: formatEurInput(Math.abs(s.difference_snt)),
    usage: s.usage_snt != null ? formatEurInput(s.usage_snt) : '',
    voucherId: idText(s.voucher_id),
    shares: (s.shares ?? []).map((share) => shareDraft(share.lease_key, share)),
  }))
}

export function newSettlement(): SettlementDraft {
  return { base: null, from: '', to: '', direction: 'refund', amount: '', usage: '', voucherId: '', shares: [] }
}

/** The company's difference: + an extra charge to the owner, - a refund. */
export function draftDifference(d: Pick<SettlementDraft, 'direction' | 'amount'>): number {
  const amount = Math.abs(parseEurInput(d.amount))
  return d.direction === 'charge' ? amount : -amount
}

const SHARE_KEYS = ['lease_key', 'balance_snt', 'voucher_id']

function buildShare(d: ShareDraft): WaterShare | null {
  const share: WaterShare = { ...(d.base ?? {}), lease_key: d.leaseKey }
  for (const key of SHARE_KEYS.slice(1)) delete share[key]
  if (d.mode !== 'computed') {
    const amount = Math.abs(parseEurInput(d.amount))
    share.balance_snt = d.mode === 'charge' ? amount : -amount
  }
  if (d.voucherId) share.voucher_id = Number(d.voucherId)
  // A share with nothing set is the computed one: not stored.
  return Object.keys(share).length > 1 ? share : null
}

/** The settlement as the shares are computed from it while editing; null until it has a period. */
export function draftSettlement(d: SettlementDraft): WaterSettlement | null {
  if (!d.from || !d.to || d.to < d.from) return null
  const out: WaterSettlement = { key: d.base?.key ?? '', from: d.from, to: d.to, difference_snt: draftDifference(d) }
  if (d.usage.trim()) out.usage_snt = Math.abs(parseEurInput(d.usage))
  const shares = d.shares.flatMap((s) => buildShare(s) ?? [])
  if (shares.length) out.shares = shares
  return out
}

/**
 * The stored settlements, or an error text naming the first bad field or two periods on the same
 * days (they would settle those days twice). Empty rows are dropped, and so are shares of leases
 * no longer in the form.
 */
export function buildSettlements(t: T, drafts: SettlementDraft[], leaseKeys: Set<string>): WaterSettlement[] | string {
  const out: WaterSettlement[] = []
  for (const [i, d] of drafts.entries()) {
    if (!d.from && !d.to && !d.amount && !d.usage && !d.voucherId) continue
    const bad = (field: string) => saveErrorText(t, `invalid_field:water_settlements[${i}].${field}`)
    if (!d.from) return bad('from')
    if (!d.to || d.to < d.from) return bad('to')
    const settlement: WaterSettlement = { ...(d.base ?? {}), ...draftSettlement(d)! }
    if (!d.usage.trim()) delete settlement.usage_snt
    if (d.voucherId) settlement.voucher_id = Number(d.voucherId)
    else delete settlement.voucher_id
    const shares = d.shares.filter((s) => leaseKeys.has(s.leaseKey)).flatMap((s) => buildShare(s) ?? [])
    if (shares.length) settlement.shares = shares
    else delete settlement.shares
    out.push(settlement)
  }
  const [both] = settlementOverlaps(out)
  if (!both) return out
  const [a, b] = both.map((s) => periodText(t, s.from, s.to))
  return t('properties.error.waterOverlap', { a, b })
}
