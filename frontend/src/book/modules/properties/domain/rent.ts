/** Leases (vuokrasuhteet): which one runs on a date and the rent in effect. Pure. */
import type { VoucherRef } from './ledger'
import type { Lease, LeaseRent, LeaseState, LeaseView, LeaseVoucher } from './types'

export function leaseState(lease: Lease, date: string): LeaseState {
  if (date < lease.starts) return 'upcoming'
  if (lease.ends && date > lease.ends) return 'ended'
  return 'current'
}

/** The rent step in effect on `date`; none outside the lease or before its first step. */
export function rentAt(lease: Lease, date: string): LeaseRent | null {
  if (leaseState(lease, date) !== 'current') return null
  let found: LeaseRent | null = null
  for (const step of lease.rents) if (step.from <= date) found = step
  return found
}

/** The lease running on `date`; the latest started when several run (a handover). */
export function currentLease(leases: Lease[], date: string): Lease | null {
  let found: Lease | null = null
  for (const lease of leases) {
    if (leaseState(lease, date) === 'current' && (!found || lease.starts >= found.starts)) found = lease
  }
  return found
}

/** Every voucher id a lease links to: the contract and the rent steps' notices. */
export function leaseVoucherIds(leases: Lease[]): number[] {
  const ids = new Set<number>()
  for (const lease of leases) {
    if (lease.doc_voucher_id != null) ids.add(lease.doc_voucher_id)
    for (const step of lease.rents) if (step.voucher_id != null) ids.add(step.voucher_id)
  }
  return [...ids]
}

export function leasePartnerIds(leases: Lease[]): number[] {
  return [...new Set(leases.flatMap((l) => (l.tenant_partner_id != null ? [l.tenant_partner_id] : [])))]
}

function voucherOf(refs: Map<number, VoucherRef>, id: number | undefined): LeaseVoucher | null {
  const ref = id != null ? refs.get(id) : undefined
  if (!ref) return null
  return { voucher_id: ref.id, date: ref.date, doc_number: ref.doc_number, series: ref.series, title: ref.title }
}

/** A lease as the object page shows it on `asOf`, with names and voucher labels resolved. */
export function leaseView(
  lease: Lease,
  asOf: string,
  names: Map<number, string>,
  refs: Map<number, VoucherRef>,
): LeaseView {
  const state = leaseState(lease, asOf)
  const rent =
    state === 'current'
      ? rentAt(lease, asOf)
      : state === 'upcoming'
        ? (lease.rents[0] ?? null)
        : (lease.rents[lease.rents.length - 1] ?? null)
  return {
    key: lease.key,
    tenant: (lease.tenant_partner_id != null ? names.get(lease.tenant_partner_id) : undefined) ?? lease.tenant_name ?? null,
    tenant_partner_id: lease.tenant_partner_id ?? null,
    starts: lease.starts,
    ends: lease.ends ?? null,
    state,
    rent,
    due_day: lease.due_day ?? null,
    notice_months: lease.notice_months ?? null,
    increase: lease.increase ?? null,
    contract: voucherOf(refs, lease.doc_voucher_id),
    steps: lease.rents.map((step) => ({ ...step, voucher: voucherOf(refs, step.voucher_id) })),
    note: lease.note ?? null,
  }
}
