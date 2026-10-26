/** Lease form drafts: strings while editing, the stored leases on save. */
import { DEFAULT_DUE_DAY } from '../../../book/modules/properties/domain/leaseSuggest'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPercentInput, parsePercentInput } from '../../../shared/percent'
import type { Lease, LeaseIncreaseKind, LeaseRent } from '../api'
import { saveErrorText } from './format'

export type Partner = { id: number; name: string }

/** What the tenant pays a month, as typed. */
export type AmountsDraft = { rent: string; water: string; parking: string }

/** An increase (korotus): its date, the new amounts and the increase notice voucher. */
export type IncreaseDraft = AmountsDraft & { from: string; voucherId: string }

/** A lease being edited; `base` keeps the stored lease and its unknown keys. */
export type LeaseDraft = {
  base: Lease | null
  /** The lease's key: water settlement shares point at it. A new lease gets one in the form (`withKeys`). */
  key: string
  tenant: string
  starts: string
  ends: string
  dueDay: string
  contractId: string
  /** The starting rent, from the lease's start. */
  initial: AmountsDraft
  /** Extras the tenant pays for: a parking space. Off hides its amounts and drops them on save. */
  parking: boolean
  /** Water is a flat fee, never settled; off (the default) means an advance settled against use. */
  waterFlat: boolean
  increaseKind: LeaseIncreaseKind
  /** Percent for `percent`, euros for `amount`. */
  increaseValue: string
  increaseMonth: string
  increases: IncreaseDraft[]
}

type T = (key: string, vars?: Record<string, string | number>) => string

const OPTIONAL_KEYS = ['tenant_partner_id', 'tenant_name', 'ends', 'due_day', 'increase', 'doc_voucher_id', 'water']

const eur = (snt: number | undefined) => (snt ? formatEurInput(snt) : '')

function amounts(step: LeaseRent | undefined): AmountsDraft {
  return { rent: step ? formatEurInput(step.rent_snt) : '', water: eur(step?.water_snt), parking: eur(step?.parking_snt) }
}

export function leaseDrafts(leases: Lease[] | undefined, partners: Partner[]): LeaseDraft[] {
  const names = new Map(partners.map((p) => [p.id, p.name]))
  return (leases ?? []).map((l) => ({
    base: l,
    key: l.key,
    tenant: (l.tenant_partner_id != null ? names.get(l.tenant_partner_id) : undefined) ?? l.tenant_name ?? '',
    starts: l.starts,
    ends: l.ends ?? '',
    dueDay: String(l.due_day ?? DEFAULT_DUE_DAY),
    contractId: l.doc_voucher_id != null ? String(l.doc_voucher_id) : '',
    initial: amounts(l.rents[0]),
    parking: l.rents.some((r) => Boolean(r.parking_snt)),
    waterFlat: l.water === 'flat',
    increaseKind: l.increase?.kind ?? 'none',
    increaseValue:
      l.increase?.kind === 'percent' ? formatPercentInput(l.increase.pct_bp) : l.increase?.kind === 'amount' ? eur(l.increase.amount_snt) : '',
    increaseMonth: l.increase?.month != null ? String(l.increase.month) : '',
    increases: l.rents.slice(1).map((r) => ({ ...amounts(r), from: r.from, voucherId: r.voucher_id != null ? String(r.voucher_id) : '' })),
  }))
}

export function newLease(): LeaseDraft {
  return {
    base: null,
    key: '',
    tenant: '',
    starts: '',
    ends: '',
    dueDay: String(DEFAULT_DUE_DAY),
    contractId: '',
    initial: { rent: '', water: '', parking: '' },
    parking: false,
    waterFlat: false,
    increaseKind: 'none',
    increaseValue: '',
    increaseMonth: '',
    increases: [],
  }
}

/** Gives leases without a key the first free `l{n}`, as the stored document would. */
export function withKeys(drafts: LeaseDraft[]): LeaseDraft[] {
  const used = new Set(drafts.map((d) => d.key).filter(Boolean))
  let n = 1
  return drafts.map((d) => {
    if (d.key) return d
    while (used.has(`l${n}`)) n += 1
    used.add(`l${n}`)
    return { ...d, key: `l${n}` }
  })
}

function step(from: string, a: AmountsDraft, withParking: boolean, voucherId = ''): LeaseRent {
  const out: LeaseRent = { from, rent_snt: parseEurInput(a.rent) }
  const water = parseEurInput(a.water)
  const parking = withParking ? parseEurInput(a.parking) : 0
  if (water) out.water_snt = water
  if (parking) out.parking_snt = parking
  if (voucherId) out.voucher_id = Number(voucherId)
  return out
}

const typed = (a: AmountsDraft) => Boolean(a.rent || a.water || a.parking)

/** The stored leases, or an error text naming the first bad field. Rows without a start or tenant are dropped. */
export function buildLeases(t: T, drafts: LeaseDraft[], partners: Partner[]): Lease[] | string {
  const byName = new Map(partners.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const out: Lease[] = []
  for (const [i, d] of drafts.entries()) {
    const tenant = d.tenant.trim()
    if (!d.starts && !tenant) continue
    const bad = (field: string) => saveErrorText(t, `invalid_field:leases[${i}].${field}`)
    const lease: Lease = { ...(d.base ?? {}), key: d.key || d.base?.key || '', starts: d.starts, rents: [] }
    for (const key of OPTIONAL_KEYS) delete lease[key]
    const partnerId = byName.get(tenant.toLowerCase())
    if (partnerId != null) lease.tenant_partner_id = partnerId
    else if (tenant) lease.tenant_name = tenant
    if (d.ends) lease.ends = d.ends
    if (d.dueDay.trim()) {
      if (!/^\d+$/.test(d.dueDay.trim())) return bad('due_day')
      lease.due_day = Number(d.dueDay.trim())
    }
    lease.rents = [
      ...(typed(d.initial) ? [step(d.starts, d.initial, d.parking)] : []),
      ...d.increases.filter((r) => r.from || typed(r)).map((r) => step(r.from, r, d.parking, r.voucherId)),
    ]
    if (d.increaseKind !== 'none' || d.increaseMonth) {
      const increase: Lease['increase'] = { kind: d.increaseKind }
      if (d.increaseKind === 'percent' && d.increaseValue) {
        const pct = parsePercentInput(d.increaseValue)
        if (pct == null || Number.isNaN(pct)) return bad('increase.pct_bp')
        increase.pct_bp = pct
      }
      if (d.increaseKind === 'amount' && d.increaseValue) increase.amount_snt = parseEurInput(d.increaseValue)
      if (d.increaseMonth) increase.month = Number(d.increaseMonth)
      lease.increase = increase
    }
    if (d.contractId) lease.doc_voucher_id = Number(d.contractId)
    if (d.waterFlat) lease.water = 'flat'
    out.push(lease)
  }
  return out
}

/** What the tenant pays a month at a draft step, in cents; parking only when the lease has it. */
export function draftTotal(a: AmountsDraft, withParking = true): number {
  return parseEurInput(a.rent) + parseEurInput(a.water) + (withParking ? parseEurInput(a.parking) : 0)
}

/**
 * The next increase, prefilled from the clause: on the first of the clause's month (else the
 * lease's start month) after today and after the latest step; the rent raised by the percent or
 * the euros. Water and parking stay; an index increase keeps the rent for the owner to type.
 */
export function nextIncrease(d: LeaseDraft, today: string): IncreaseDraft {
  const last = d.increases[d.increases.length - 1] ?? { ...d.initial, from: d.starts, voucherId: '' }
  const month = Number(d.increaseMonth) || Number(d.starts.slice(5, 7)) || Number(today.slice(5, 7))
  let year = Number(today.slice(0, 4))
  const at = (y: number) => `${y}-${String(month).padStart(2, '0')}-01`
  while (at(year) <= today || at(year) <= last.from) year += 1
  const rent = parseEurInput(last.rent)
  let next = rent
  if (d.increaseKind === 'percent') {
    const pct = parsePercentInput(d.increaseValue)
    if (pct != null && !Number.isNaN(pct)) next = Math.round((rent * (10_000 + pct)) / 10_000)
  } else if (d.increaseKind === 'amount') {
    next = rent + parseEurInput(d.increaseValue)
  }
  return { from: at(year), rent: formatEurInput(next), water: last.water, parking: last.parking, voucherId: '' }
}
