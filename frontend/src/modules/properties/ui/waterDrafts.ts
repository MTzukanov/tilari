/** Water settlement form drafts: strings while editing, the stored settlements on save. */
import { overlaps } from '../../../book/modules/properties/domain/ranges'
import { statementPeriod } from '../../../book/modules/properties/domain/water'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import type { DocCandidate, WaterSettlement, WaterShare, WaterStatementCandidate } from '../api'
import { issueCollector, type FormIssue } from './formIssues'
import { periodText } from './format'

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
  /** The owner's word that there is no statement (ADR-030). */
  noDocument: boolean
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
    noDocument: Boolean(s.no_document),
    shares: (s.shares ?? []).map((share) => shareDraft(share.lease_key, share)),
  }))
}

/** A statement candidate (a voucher with the object's lines) as a document to pick. */
export function candidateDoc(c: WaterStatementCandidate): DocCandidate {
  const { voucher } = c
  return { ...voucher, attachments: voucher.files.length, linked_to: [], suggestion: null }
}

/** A statement candidate's lines on the object, credit - debit: - for the company's extra charge. */
export function candidateAmount(c: WaterStatementCandidate): number {
  return c.lines.reduce((sum, l) => sum + l.line_snt, 0)
}

type StatementFill = Pick<SettlementDraft, 'direction' | 'amount' | 'from' | 'to'>

/**
 * What a statement voucher fills: the company's result from its lines (a debit is an extra
 * charge, a credit a refund) and the period estimated from its date and the form's other periods
 * (`statementPeriod`).
 */
export function statementFill(c: WaterStatementCandidate, others: { from: string; to: string }[]): StatementFill {
  const difference = -candidateAmount(c)
  const period = statementPeriod(c.voucher.date, [c.voucher.title, ...c.lines.map((l) => l.text)], others)
  return { direction: difference > 0 ? 'charge' : 'refund', amount: formatEurInput(Math.abs(difference)), ...period }
}

/**
 * The draft with statement `voucherId` picked. A voucher with the object's lines fills the amount
 * and its direction, and the period, where the owner has not given them: a field still empty, or
 * still as the previous pick filled it. Picking none clears what the previous pick filled.
 */
export function pickStatement(
  d: SettlementDraft,
  voucherId: string,
  candidates: WaterStatementCandidate[],
  others: { from: string; to: string }[],
): SettlementDraft {
  const fillOf = (id: string) => {
    const c = id ? candidates.find((x) => String(x.voucher.voucher_id) === id) : undefined
    return c ? statementFill(c, others) : null
  }
  const before = fillOf(d.voucherId)
  const after = fillOf(voucherId)
  const next: SettlementDraft = { ...d, voucherId }
  const amountFree = !d.amount.trim() || (before != null && d.amount === before.amount && d.direction === before.direction)
  const periodFree = (!d.from && !d.to) || (before != null && d.from === before.from && d.to === before.to)
  if (amountFree) {
    next.amount = after?.amount ?? (before ? '' : d.amount)
    if (after) next.direction = after.direction
  }
  if (periodFree) {
    next.from = after?.from ?? (before ? '' : d.from)
    next.to = after?.to ?? (before ? '' : d.to)
  }
  return next
}

export function newSettlement(): SettlementDraft {
  return { base: null, from: '', to: '', direction: 'refund', amount: '', usage: '', voucherId: '', noDocument: false, shares: [] }
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

/**
 * The settlement as the shares are computed from it while editing, with its statement (whose lines
 * are the company's); null until it has a period.
 */
export function draftSettlement(d: SettlementDraft): WaterSettlement | null {
  if (!d.from || !d.to || d.to < d.from) return null
  const out: WaterSettlement = { key: d.base?.key ?? '', from: d.from, to: d.to, difference_snt: draftDifference(d) }
  if (d.usage.trim()) out.usage_snt = Math.abs(parseEurInput(d.usage))
  if (d.voucherId) out.voucher_id = Number(d.voucherId)
  const shares = d.shares.flatMap((s) => buildShare(s) ?? [])
  if (shares.length) out.shares = shares
  return out
}

/** A settlement draft on the form: its stored key, or `new`. */
export const settlementId = (d: SettlementDraft) => d.base?.key || 'new'

/** A settlement draft's fields on the form: `{key}.{field}`, a new one's `new.{field}`. */
export const settlementField = (d: SettlementDraft, field: string) => `${settlementId(d)}.${field}`

/**
 * The stored settlements, or every field to fix: a period with a day missing or ending before it
 * starts, and two periods on the same days (the tenants' water would be settled twice), marked on
 * both. Drafts with nothing typed are dropped. `only`: the settlements on the form (`settlementField`
 * keys); others' issues are left out unless they are all there is.
 */
export function buildSettlements(
  t: T,
  drafts: SettlementDraft[],
  leaseKeys: Set<string>,
  only?: Set<string>,
): WaterSettlement[] | { issues: FormIssue[] } {
  const { issues, issue, has } = issueCollector(t)
  const out: { settlement: WaterSettlement; d: SettlementDraft }[] = []
  for (const d of drafts) {
    if (!d.from && !d.to && !d.amount && !d.usage && !d.voucherId) continue
    const from = settlementField(d, 'from')
    const to = settlementField(d, 'to')
    if (!d.from) issue(from, 'properties.field.waterFrom', 'properties.form.issue.required')
    if (!d.to) issue(to, 'properties.field.waterTo', 'properties.form.issue.required')
    else if (d.from && d.to < d.from) issue(to, 'properties.field.waterTo', 'properties.form.issue.toBeforeFrom')
    if (has(from) || has(to)) continue
    const settlement: WaterSettlement = { ...(d.base ?? {}), ...draftSettlement(d)! }
    if (!d.usage.trim()) delete settlement.usage_snt
    delete settlement.no_document
    if (d.voucherId) settlement.voucher_id = Number(d.voucherId)
    else {
      delete settlement.voucher_id
      if (d.noDocument) settlement.no_document = true
    }
    const shares = d.shares.filter((s) => leaseKeys.has(s.leaseKey)).flatMap((s) => buildShare(s) ?? [])
    if (shares.length) settlement.shares = shares
    else delete settlement.shares
    out.push({ settlement, d })
  }
  for (const [a, b] of overlaps(out, (x) => ({ from: x.settlement.from, to: x.settlement.to }))) {
    const period = (x: typeof a) => periodText(t, x.settlement.from, x.settlement.to)
    issue(settlementField(b.d, 'from'), 'properties.field.waterFrom', 'properties.form.issue.overlapsSettlement', undefined, { period: period(a) })
    issue(settlementField(a.d, 'to'), 'properties.field.waterTo', 'properties.form.issue.overlapsSettlement', undefined, { period: period(b) })
  }
  if (issues.length) {
    const own = only ? issues.filter((x) => only.has(x.field.slice(0, x.field.indexOf('.')))) : issues
    return { issues: own.length ? own : issues }
  }
  return out.map((x) => x.settlement)
}
