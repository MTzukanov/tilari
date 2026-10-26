/** Lease form drafts: strings while editing, the stored leases on save. */
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPercentInput, parsePercentInput } from '../../../shared/percent'
import type { Lease, LeaseIncreaseKind } from '../api'
import { saveErrorText } from './format'

export type Partner = { id: number; name: string }
export type RentDraft = { from: string; rent: string; charges: string; voucherId: string }

/** A lease being edited: strings until save; `base` keeps the stored lease and its unknown keys. */
export type LeaseDraft = {
  base: Lease | null
  tenant: string
  starts: string
  ends: string
  dueDay: string
  notice: string
  rents: RentDraft[]
  increaseKind: LeaseIncreaseKind
  increasePct: string
  increaseMonth: string
  contractId: string
  note: string
}

type T = (key: string, vars?: Record<string, string | number>) => string

const OPTIONAL_KEYS = ['tenant_partner_id', 'tenant_name', 'ends', 'due_day', 'notice_months', 'increase', 'doc_voucher_id', 'note']

export const emptyRent = (from = ''): RentDraft => ({ from, rent: '', charges: '', voucherId: '' })

export function leaseDrafts(leases: Lease[] | undefined, partners: Partner[]): LeaseDraft[] {
  const names = new Map(partners.map((p) => [p.id, p.name]))
  return (leases ?? []).map((l) => ({
    base: l,
    tenant: (l.tenant_partner_id != null ? names.get(l.tenant_partner_id) : undefined) ?? l.tenant_name ?? '',
    starts: l.starts,
    ends: l.ends ?? '',
    dueDay: l.due_day != null ? String(l.due_day) : '',
    notice: l.notice_months != null ? String(l.notice_months) : '',
    rents: l.rents.map((r) => ({
      from: r.from,
      rent: formatEurInput(r.rent_snt),
      charges: r.charges_snt ? formatEurInput(r.charges_snt) : '',
      voucherId: r.voucher_id != null ? String(r.voucher_id) : '',
    })),
    increaseKind: l.increase?.kind ?? 'none',
    increasePct: formatPercentInput(l.increase?.pct_bp),
    increaseMonth: l.increase?.month != null ? String(l.increase.month) : '',
    contractId: l.doc_voucher_id != null ? String(l.doc_voucher_id) : '',
    note: l.note ?? '',
  }))
}

export function newLease(): LeaseDraft {
  return {
    base: null,
    tenant: '',
    starts: '',
    ends: '',
    dueDay: '',
    notice: '',
    rents: [emptyRent()],
    increaseKind: 'none',
    increasePct: '',
    increaseMonth: '',
    contractId: '',
    note: '',
  }
}

/** The stored leases, or an error text naming the first bad field. Rows without a start or tenant are dropped. */
export function buildLeases(t: T, drafts: LeaseDraft[], partners: Partner[]): Lease[] | string {
  const byName = new Map(partners.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const out: Lease[] = []
  for (const [i, d] of drafts.entries()) {
    const tenant = d.tenant.trim()
    if (!d.starts && !tenant) continue
    const bad = (field: string) => saveErrorText(t, `invalid_field:leases[${i}].${field}`)
    const lease: Lease = { ...(d.base ?? {}), key: d.base?.key ?? '', starts: d.starts, rents: [] }
    for (const key of OPTIONAL_KEYS) delete lease[key]
    const partnerId = byName.get(tenant.toLowerCase())
    if (partnerId != null) lease.tenant_partner_id = partnerId
    else if (tenant) lease.tenant_name = tenant
    if (d.ends) lease.ends = d.ends
    for (const [field, raw] of [['due_day', d.dueDay], ['notice_months', d.notice]] as const) {
      if (!raw.trim()) continue
      if (!/^\d+$/.test(raw.trim())) return bad(field)
      lease[field] = Number(raw.trim())
    }
    lease.rents = d.rents
      .filter((r) => r.from || r.rent)
      .map((r) => ({
        from: r.from,
        rent_snt: parseEurInput(r.rent),
        ...(r.charges ? { charges_snt: parseEurInput(r.charges) } : {}),
        ...(r.voucherId ? { voucher_id: Number(r.voucherId) } : {}),
      }))
    const pct = parsePercentInput(d.increasePct)
    if (Number.isNaN(pct)) return bad('increase.pct_bp')
    if (d.increaseKind !== 'none' || pct != null || d.increaseMonth) {
      lease.increase = {
        kind: d.increaseKind,
        ...(pct != null ? { pct_bp: pct } : {}),
        ...(d.increaseMonth ? { month: Number(d.increaseMonth) } : {}),
      }
    }
    if (d.contractId) lease.doc_voucher_id = Number(d.contractId)
    if (d.note.trim()) lease.note = d.note.trim()
    out.push(lease)
  }
  return out
}
