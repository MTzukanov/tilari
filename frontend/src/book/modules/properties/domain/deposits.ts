/**
 * Rent deposits (vuokravakuudet) per lease (ADR-029): the booked receipts and returns on a
 * liability account, what a return kept for rent or costs, the balance, and the deposits the edit
 * page offers. Pure; the lines come from `ledger.ts`.
 */
import { addDays } from '../../../months'
import type { DeductionLine, DepositLine, VoucherRef } from './ledger'
import { pickBest, type TextScorer } from './suggest'
import type { BookedLine, DepositCandidate, DepositMovement, DepositView, Lease, LeaseDeposit, Warning } from './types'
import { bookedLine } from './water'

/**
 * Words that name a deposit in an account's name or a line's text: vakuus in any form (vakuuden,
 * vakuutta), but not insurance (vakuutus, vakuutettu, vakuuttaa).
 */
export const DEPOSIT_WORDS = /vakuu(?!tu|tet|tta\p{L})|takuu|pantti|deposit|säkerhet|kaution/iu

/** A deposit received this many days before or after a lease starts is suggested for it. */
export const DEPOSIT_START_DAYS = 60

/** A deposit still held this many days after its lease ended is flagged. */
export const DEPOSIT_OPEN_DAYS = 60

type LineContext = { partnerName: (id: number | null) => string | null; refs: Map<number, VoucherRef> }

/** `e:{eraid}` for an item, `l:{line id}` for a loose line: one deposit, one lease. */
export function depositKeys(deposit: LeaseDeposit | undefined): string[] {
  return [...(deposit?.eraids ?? []).map((id) => `e:${id}`), ...(deposit?.line_ids ?? []).map((id) => `l:${id}`)]
}

/** Every item and loose line the leases link as deposits. */
export function depositIds(leases: Lease[]): { eraids: number[]; lineIds: number[] } {
  const eraids = new Set<number>()
  const lineIds = new Set<number>()
  for (const lease of leases) {
    for (const id of lease.deposit?.eraids ?? []) eraids.add(id)
    for (const id of lease.deposit?.line_ids ?? []) lineIds.add(id)
  }
  return { eraids: [...eraids], lineIds: [...lineIds] }
}

/** A lease's deposit lines, oldest first: every line of its items and its loose lines; `missing` counts links the book lacks. */
export function depositLinesOf(deposit: LeaseDeposit, lines: DepositLine[]): { lines: DepositLine[]; missing: number } {
  const eraids = new Set(deposit.eraids ?? [])
  const lineIds = new Set(deposit.line_ids ?? [])
  const own = lines.filter((l) => (l.eraid != null && eraids.has(l.eraid)) || lineIds.has(l.id))
  const found = new Set(own.map((l) => l.id))
  const missing = [...eraids].filter((id) => !found.has(id)).length + [...lineIds].filter((id) => !found.has(id)).length
  return { lines: own, missing }
}

function booked(line: Pick<DepositLine, 'id' | 'date' | 'voucher_id' | 'partner_id' | 'text'>, amount: number, ctx: LineContext): BookedLine {
  return bookedLine({ ...line, net_snt: amount }, amount, ctx)
}

/**
 * The deposit up to the as-of date, exact: each receipt and return as booked; a return's
 * deduction is what its payment booked as income or cost (`deductions` keyed by return line id).
 */
export function depositView(
  linked: { lines: DepositLine[]; missing: number },
  deductions: Map<number, DeductionLine[]>,
  asOf: string,
  ctx: LineContext,
): DepositView {
  let received = 0
  let returned = 0
  let deducted = 0
  const movements: DepositMovement[] = []
  for (const line of linked.lines) {
    if (line.date > asOf) continue
    const kept = line.signed_snt < 0 ? (deductions.get(line.id) ?? []) : []
    const keptSnt = kept.reduce((s, d) => s + d.amount_snt, 0)
    if (line.signed_snt < 0) {
      returned -= line.signed_snt
      deducted += keptSnt
    } else {
      received += line.signed_snt
    }
    movements.push({
      ...booked(line, line.signed_snt, ctx),
      kind: line.signed_snt < 0 ? 'returned' : 'received',
      deducted_snt: keptSnt,
      deductions: kept.map((d) => booked(d, d.amount_snt, ctx)),
    })
  }
  return { received_snt: received, returned_snt: returned, deducted_snt: deducted, balance_snt: received - returned, movements, missing: linked.missing }
}

/**
 * `deposit_open`: a lease that ended over `DEPOSIT_OPEN_DAYS` days ago still holds a deposit;
 * `deposit_over`: more was returned than received (a receipt not linked, or booked elsewhere).
 */
export function depositWarnings(lease: Lease, view: DepositView, asOf: string): Warning[] {
  if (view.balance_snt < 0) return [{ code: 'deposit_over', params: { amount_snt: -view.balance_snt } }]
  if (view.balance_snt > 0 && lease.ends && addDays(lease.ends, DEPOSIT_OPEN_DAYS) < asOf) {
    return [{ code: 'deposit_open', params: { amount_snt: view.balance_snt } }]
  }
  return []
}

export type CandidateContext = {
  objectId: number
  /** The object's cost centre and its projects. */
  allocations: Set<number>
  /** Rent payers and stored tenants of the object. */
  partners: Set<number>
  scorer: TextScorer
  /** Deposit key (`depositKeys`) -> the lease linking it, over every stored object. */
  owner: Map<string, { object_id: number; lease_key: string }>
  partnerName: (id: number | null) => string | null
  asOf: string
}

/**
 * Deposits to offer: item roots and loose lines on liability accounts whose account name or text
 * (else the voucher's title) names a deposit (`DEPOSIT_WORDS`), and any linked one. `items` holds the candidate items' lines.
 * The object's own first (its cost centre, a rent payer, its name in the text), newest first.
 */
export function depositCandidates(roots: DepositLine[], items: DepositLine[], ctx: CandidateContext): DepositCandidate[] {
  const linesOf = new Map<number, DepositLine[]>()
  for (const line of items) if (line.eraid != null) linesOf.set(line.eraid, [...(linesOf.get(line.eraid) ?? []), line])
  const out: DepositCandidate[] = []
  for (const root of roots) {
    const item = root.eraid === root.id
    const key = `${item ? 'e' : 'l'}:${root.id}`
    // The voucher's title stands for the line's text only when it has none: a VAT line on a
    // voucher titled for a deposit is no deposit.
    const text = root.text || root.voucher_title
    if (!DEPOSIT_WORDS.test(root.account_name) && !DEPOSIT_WORDS.test(text) && !ctx.owner.has(key)) continue
    const lines = (item ? (linesOf.get(root.id) ?? [root]) : [root]).filter((l) => l.date <= ctx.asOf)
    const related =
      lines.some((l) => ctx.allocations.has(l.allocation) || (l.partner_id != null && ctx.partners.has(l.partner_id))) ||
      pickBest(ctx.scorer(text)).id === ctx.objectId
    out.push({
      kind: item ? 'item' : 'line',
      id: root.id,
      account: root.account,
      account_name: root.account_name,
      date: root.date,
      voucher_id: root.voucher_id,
      text,
      partner_id: root.partner_id,
      partner: ctx.partnerName(root.partner_id),
      amount_snt: root.signed_snt,
      balance_snt: lines.reduce((s, l) => s + l.signed_snt, 0),
      movements: lines.map((l) => ({ line_id: l.id, date: l.date, amount_snt: l.signed_snt, voucher_id: l.voucher_id })),
      linked_to: ctx.owner.get(key) ?? null,
      related,
    })
  }
  return out.sort((a, b) => Number(b.related) - Number(a.related) || b.date.localeCompare(a.date) || b.id - a.id)
}

/** The candidate's key in a lease's deposit (`depositKeys`). */
export function candidateKey(c: Pick<DepositCandidate, 'kind' | 'id'>): string {
  return `${c.kind === 'item' ? 'e' : 'l'}:${c.id}`
}

/**
 * Whether a deposit belongs with a lease, as far as the book says: booked on the object and
 * received from the tenant, or within `DEPOSIT_START_DAYS` days of the lease's start.
 */
export function depositFits(
  c: Pick<DepositCandidate, 'date' | 'partner_id' | 'related' | 'amount_snt'>,
  lease: { starts: string; tenant_partner_id?: number | null },
): boolean {
  if (!c.related || c.amount_snt <= 0) return false
  if (lease.tenant_partner_id != null && c.partner_id === lease.tenant_partner_id) return true
  return Boolean(lease.starts) && c.date >= addDays(lease.starts, -DEPOSIT_START_DAYS) && c.date <= addDays(lease.starts, DEPOSIT_START_DAYS)
}

/**
 * The deposit to suggest with a suggested lease: the tenant's own receipt nearest its start, else
 * the one receipt near its start. None when the book leaves it open; `taken` keys are skipped.
 */
export function suggestDeposit(lease: Lease, candidates: DepositCandidate[], taken: Set<string>): LeaseDeposit | undefined {
  const free = candidates.filter((c) => !c.linked_to && !taken.has(candidateKey(c)) && depositFits(c, lease))
  const nearest = (list: DepositCandidate[]) =>
    [...list].sort((a, b) => Math.abs(dayDiff(a.date, lease.starts)) - Math.abs(dayDiff(b.date, lease.starts)) || a.id - b.id)[0]
  const own = free.filter((c) => lease.tenant_partner_id != null && c.partner_id === lease.tenant_partner_id)
  const pick = own.length ? nearest(own) : free.length === 1 ? free[0] : undefined
  if (!pick) return undefined
  return pick.kind === 'item' ? { eraids: [pick.id] } : { line_ids: [pick.id] }
}

function dayDiff(a: string, b: string): number {
  return (Date.parse(a) - Date.parse(b)) / 86_400_000
}
