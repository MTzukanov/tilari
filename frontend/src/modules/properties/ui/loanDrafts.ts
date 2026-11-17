/** Housing-company loan form drafts (ADR-034): strings while editing, the stored loan on save. */
import { copyGroup } from '../../../book/modules/properties/domain/housingLoan'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPcmInput, parsePcmInput } from '../../../shared/percent'
import type { DocCandidate, HousingCopySource, HousingLoan, HousingLoanType, LeaseVoucher, LoanEventKind, RateReference } from '../api'

type T = (key: string, vars?: Record<string, string | number>) => string

export type RateDraft = { from: string; rate: string; voucherId: string }
export type GraceDraft = { from: string; to: string }
export type CertificateDraft = { date: string; share: string; voucherId: string; noDocument: boolean }
export type ChargeDraft = { from: string; amount: string; rahastoitu: boolean; voucherId: string; noDocument: boolean }
export type EventDraft = { date: string; kind: LoanEventKind; amount: string; voucherId: string; note: string }

/** A loan being edited; `base` keeps the stored one and its unknown keys. */
export type LoanDraft = {
  base: HousingLoan | null
  group: string
  name: string
  lender: string
  starts: string
  ends: string
  type: HousingLoanType
  total: string
  reference: RateReference
  margin: string
  resetMonths: string
  rates: RateDraft[]
  grace: GraceDraft[]
  certificates: CertificateDraft[]
  charges: ChargeDraft[]
  events: EventDraft[]
}

const idText = (id: number | undefined) => (id != null ? String(id) : '')

/** A linked voucher as a document to pick. */
export function voucherDoc(v: LeaseVoucher): DocCandidate {
  return { ...v, attachments: v.files.length, linked_to: [], suggestion: null }
}
const eurText = (snt: number | undefined) => (snt != null ? formatEurInput(snt) : '')

export function newLoanDraft(): LoanDraft {
  return {
    base: null,
    group: '',
    name: '',
    lender: '',
    starts: '',
    ends: '',
    type: 'annuity',
    total: '',
    reference: 'euribor_12m',
    margin: '',
    resetMonths: '12',
    rates: [],
    grace: [],
    certificates: [],
    charges: [],
    events: [],
  }
}

export function loanDraft(loan: HousingLoan): LoanDraft {
  return {
    ...terms(loan),
    base: loan,
    group: loan.group ?? '',
    certificates: (loan.certificates ?? []).map((c) => ({
      date: c.date,
      share: formatEurInput(c.share_snt),
      voucherId: idText(c.voucher_id),
      noDocument: Boolean(c.no_document),
    })),
    charges: (loan.charges ?? []).map((c) => ({
      from: c.from,
      amount: formatEurInput(c.amount_snt),
      rahastoitu: Boolean(c.rahastoitu),
      voucherId: idText(c.voucher_id),
      noDocument: Boolean(c.no_document),
    })),
    events: (loan.events ?? []).map((e) => ({ date: e.date, kind: e.kind, amount: eurText(e.amount_snt), voucherId: idText(e.voucher_id), note: e.note ?? '' })),
  }
}

/** The loan's terms, rates and grace periods: what objects of one housing company share. */
function terms(loan: HousingLoan): Omit<LoanDraft, 'base' | 'group' | 'certificates' | 'charges' | 'events'> {
  return {
    name: loan.name,
    lender: loan.lender ?? '',
    starts: loan.starts,
    ends: loan.ends ?? '',
    type: loan.type,
    total: eurText(loan.total_snt),
    reference: loan.reference,
    margin: formatPcmInput(loan.margin_pcm),
    resetMonths: loan.reset_months != null ? String(loan.reset_months) : '',
    rates: (loan.rates ?? []).map((r) => ({ from: r.from, rate: formatPcmInput(r.reference_pcm), voucherId: idText(r.voucher_id) })),
    grace: (loan.grace ?? []).map((g) => ({ from: g.from, to: g.to })),
  }
}

/**
 * A new loan copied from another object's: its terms, rates and grace, in the original's group.
 * The share, the rahoitusvastike and the events are the object's own, so they start empty, and so
 * do the rates' documents, which are the other object's.
 */
export function copiedLoanDraft(source: HousingCopySource): LoanDraft {
  const copied = terms(source.loan)
  return {
    ...newLoanDraft(),
    ...copied,
    rates: copied.rates.map((r) => ({ ...r, voucherId: '' })),
    group: copyGroup(source.loan, source.object_id),
  }
}

/** Whether a row holds nothing typed: such rows are left out on save. */
const blank = (row: Record<string, unknown>) => Object.values(row).every((v) => v === '' || v === false || v == null)

const amountOf = (text: string) => (text.trim() ? Math.abs(parseEurInput(text)) : null)
const okDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)

/**
 * The stored loan, or a message naming the first field to check: a section's rows by their
 * number. Rows left empty are dropped; a row is kept on the base's unknown keys.
 */
export function buildLoan(t: T, d: LoanDraft): HousingLoan | string {
  const check = (field: string, section?: string, n?: number) =>
    t('properties.housing.check', {
      field: section ? t('properties.housing.checkRow', { field: t(field), section: t(section), n: n ?? 1 }) : t(field),
    })
  if (!d.name.trim()) return check('properties.housing.field.name')
  if (!okDate(d.starts)) return check('properties.housing.field.starts')
  if (d.ends && (!okDate(d.ends) || d.ends < d.starts)) return check('properties.housing.field.ends')
  const margin = parsePcmInput(d.margin)
  if (margin != null && (Number.isNaN(margin) || margin < 0)) return check('properties.housing.field.margin')
  const total = amountOf(d.total)
  if (total != null && Number.isNaN(total)) return check('properties.housing.field.total')
  const reset = d.resetMonths.trim() ? Number(d.resetMonths.trim()) : null
  if (reset != null && (!Number.isInteger(reset) || reset < 1 || reset > 120)) return check('properties.housing.field.resetMonths')

  const loan: HousingLoan = {
    ...(d.base ?? {}),
    key: d.base?.key ?? '',
    name: d.name.trim(),
    starts: d.starts,
    type: d.type,
    reference: d.reference,
    margin_pcm: margin ?? 0,
  }
  for (const key of ['group', 'lender', 'ends', 'total_snt', 'reset_months', 'rates', 'grace', 'certificates', 'charges', 'events'] as const) delete loan[key]
  if (d.group) loan.group = d.group
  if (d.lender.trim()) loan.lender = d.lender.trim()
  if (d.ends) loan.ends = d.ends
  if (total != null) loan.total_snt = total
  if (reset != null) loan.reset_months = reset

  const rates: NonNullable<HousingLoan['rates']> = []
  for (const [i, r] of d.rates.entries()) {
    if (blank(r)) continue
    const rate = parsePcmInput(r.rate)
    if (!okDate(r.from)) return check('properties.housing.field.from', 'properties.housing.rates', i + 1)
    if (rate == null || Number.isNaN(rate)) return check('properties.housing.field.rate', 'properties.housing.rates', i + 1)
    rates.push({ from: r.from, reference_pcm: rate, ...(r.voucherId ? { voucher_id: Number(r.voucherId) } : {}) })
  }
  const grace: NonNullable<HousingLoan['grace']> = []
  for (const [i, g] of d.grace.entries()) {
    if (blank(g)) continue
    if (!okDate(g.from)) return check('properties.housing.field.from', 'properties.housing.grace', i + 1)
    if (!okDate(g.to) || g.to < g.from) return check('properties.housing.field.to', 'properties.housing.grace', i + 1)
    grace.push({ from: g.from, to: g.to })
  }
  const certificates: NonNullable<HousingLoan['certificates']> = []
  for (const [i, c] of d.certificates.entries()) {
    if (blank(c)) continue
    const share = amountOf(c.share)
    if (!okDate(c.date)) return check('properties.housing.field.date', 'properties.housing.certificates', i + 1)
    if (share == null || Number.isNaN(share)) return check('properties.housing.field.share', 'properties.housing.certificates', i + 1)
    certificates.push({
      date: c.date,
      share_snt: share,
      ...(c.voucherId ? { voucher_id: Number(c.voucherId) } : c.noDocument ? { no_document: true as const } : {}),
    })
  }
  const charges: NonNullable<HousingLoan['charges']> = []
  for (const [i, c] of d.charges.entries()) {
    if (blank(c)) continue
    const amount = amountOf(c.amount)
    if (!okDate(c.from)) return check('properties.housing.field.from', 'properties.housing.charges', i + 1)
    if (amount == null || Number.isNaN(amount)) return check('properties.housing.field.charge', 'properties.housing.charges', i + 1)
    charges.push({
      from: c.from,
      amount_snt: amount,
      ...(c.rahastoitu ? { rahastoitu: true as const } : {}),
      ...(c.voucherId ? { voucher_id: Number(c.voucherId) } : c.noDocument ? { no_document: true as const } : {}),
    })
  }
  const events: NonNullable<HousingLoan['events']> = []
  for (const [i, e] of d.events.entries()) {
    if (!e.date && !e.amount && !e.voucherId && !e.note) continue
    const amount = amountOf(e.amount)
    if (!okDate(e.date)) return check('properties.housing.field.date', 'properties.housing.events', i + 1)
    if ((amount != null && Number.isNaN(amount)) || (e.kind === 'extra_payment' && !amount)) {
      return check('properties.housing.field.amount', 'properties.housing.events', i + 1)
    }
    events.push({
      date: e.date,
      kind: e.kind,
      ...(amount ? { amount_snt: amount } : {}),
      ...(e.voucherId ? { voucher_id: Number(e.voucherId) } : {}),
      ...(e.note.trim() ? { note: e.note.trim() } : {}),
    })
  }
  const twice = (days: string[]) => days.some((day, i) => days.indexOf(day) !== i)
  if (twice(rates.map((r) => r.from))) return t('properties.housing.sameDay', { section: t('properties.housing.rates') })
  if (twice(certificates.map((c) => c.date))) return t('properties.housing.sameDay', { section: t('properties.housing.certificates') })
  if (twice(charges.map((c) => c.from))) return t('properties.housing.sameDay', { section: t('properties.housing.charges') })
  if (rates.length) loan.rates = rates
  if (grace.length) loan.grace = grace
  if (certificates.length) loan.certificates = certificates
  if (charges.length) loan.charges = charges
  if (events.length) loan.events = events
  return loan
}
