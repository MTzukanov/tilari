/** Housing-company loan form drafts (ADR-034): strings while editing, the stored loan on save. */
import { copyGroup } from '../../../book/modules/properties/domain/housingLoan'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPcmInput, parsePcmInput } from '../../../shared/percent'
import { issueCollector, type FormIssue, type RowAt } from './formIssues'
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

export const emptyCertificate = (): CertificateDraft => ({ date: '', share: '', voucherId: '', noDocument: false })
export const emptyCharge = (): ChargeDraft => ({ from: '', amount: '', rahastoitu: false, voucherId: '', noDocument: false })
export const emptyRate = (): RateDraft => ({ from: '', rate: '', voucherId: '' })

/** A new loan: an empty row in each section a loan needs one of (share, rahoitusvastike, rate). */
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
    rates: [emptyRate()],
    grace: [],
    certificates: [emptyCertificate()],
    charges: [emptyCharge()],
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
    rates: copied.rates.length ? copied.rates.map((r) => ({ ...r, voucherId: '' })) : [emptyRate()],
    group: copyGroup(source.loan, source.object_id),
  }
}

/** Whether a row holds nothing typed: such rows are left out on save. */
const blank = (row: Record<string, unknown>) => Object.values(row).every((v) => v === '' || v === false || v == null)

const amountOf = (text: string) => (text.trim() ? Math.abs(parseEurInput(text)) : null)
const okDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)

/**
 * The stored loan, or every field to fix, in the form's order. Rows left empty are dropped; the loan
 * keeps the base's unknown keys.
 */
export function buildLoan(t: T, d: LoanDraft): HousingLoan | FormIssue[] {
  const { issues, issue, has } = issueCollector(t)
  /** A date the row needs: missing, or not a whole date. */
  const needDate = (field: string, label: string, value: string, at?: RowAt) => {
    if (!value) issue(field, label, 'properties.form.issue.required', at)
    else if (!okDate(value)) issue(field, label, 'properties.form.issue.date', at)
  }
  /** An amount the row needs, as cents; null when missing or unreadable (the issue is noted). */
  const needAmount = (field: string, label: string, value: string, at: RowAt) => {
    const amount = amountOf(value)
    if (amount == null) issue(field, label, 'properties.form.issue.required', at)
    else if (Number.isNaN(amount)) issue(field, label, 'properties.form.issue.amount', at)
    return amount == null || Number.isNaN(amount) ? null : amount
  }
  /** A row's day another row of its section has first (`seen`: the section's days so far, by row). */
  const sameDay = (seen: Map<string, number>, day: string, i: number, field: string, label: string, at: RowAt) => {
    if (!okDate(day)) return
    const before = seen.get(day)
    if (before == null) seen.set(day, i)
    else issue(field, label, 'properties.form.issue.sameDay', at, { n: before + 1 })
  }
  /**
   * A section the loan needs a row of (share, rahoitusvastike, rate): with no row at all the
   * section itself is to fix; with only empty rows, the first row's fields.
   */
  const needRows = (section: 'certificates' | 'charges' | 'rates', rows: Record<string, unknown>[], fields: [string, string][]) => {
    const title = `properties.housing.${section}`
    if (!rows.length) issue(section, title, 'properties.form.issue.atLeastOne')
    else if (rows.every(blank)) {
      for (const [field, label] of fields) issue(`${section}.0.${field}`, label, 'properties.form.issue.required', { section: title, n: 1 })
    }
  }
  const startsOk = okDate(d.starts)
  const endsOk = okDate(d.ends)
  const fixed = d.reference === 'fixed'

  if (!d.name.trim()) issue('name', 'properties.housing.field.name', 'properties.form.issue.required')
  needDate('starts', 'properties.housing.field.starts', d.starts)
  needDate('ends', 'properties.housing.field.ends', d.ends)
  if (startsOk && endsOk && d.ends < d.starts) issue('ends', 'properties.housing.field.ends', 'properties.form.issue.endsBeforeStarts')
  const total = amountOf(d.total)
  if (total != null && Number.isNaN(total)) issue('total', 'properties.housing.field.total', 'properties.form.issue.amount')
  // A fixed rate is all in its rate rows: no margin and no resets.
  const margin = fixed ? 0 : parsePcmInput(d.margin)
  if (margin == null) issue('margin', 'properties.housing.field.margin', 'properties.form.issue.required')
  else if (Number.isNaN(margin) || margin < 0) issue('margin', 'properties.housing.field.margin', 'properties.form.issue.rate')
  const reset = fixed ? null : d.resetMonths.trim() ? Number(d.resetMonths.trim()) : NaN
  if (!fixed && !d.resetMonths.trim()) issue('resetMonths', 'properties.housing.field.resetMonths', 'properties.form.issue.required')
  else if (reset != null && (!Number.isInteger(reset) || reset < 1 || reset > 120)) {
    issue('resetMonths', 'properties.housing.field.resetMonths', 'properties.form.issue.months')
  }

  const certificates: NonNullable<HousingLoan['certificates']> = []
  const certificateDays = new Map<string, number>()
  d.certificates.forEach((c, i) => {
    if (blank(c)) return
    const at = { section: 'properties.housing.certificates', n: i + 1 }
    const dateField = `certificates.${i}.date`
    needDate(dateField, 'properties.housing.field.date', c.date, at)
    if (okDate(c.date) && startsOk && c.date < d.starts) issue(dateField, 'properties.housing.field.date', 'properties.form.issue.beforeStarts', at)
    if (!has(dateField)) sameDay(certificateDays, c.date, i, dateField, 'properties.housing.field.date', at)
    const share = needAmount(`certificates.${i}.share`, 'properties.housing.field.share', c.share, at)
    if (share != null && total != null && !Number.isNaN(total) && share > total) {
      issue(`certificates.${i}.share`, 'properties.housing.field.share', 'properties.form.issue.shareOverTotal', at)
    }
    if (!has(dateField) && !has(`certificates.${i}.share`) && share != null) {
      certificates.push({
        date: c.date,
        share_snt: share,
        ...(c.voucherId ? { voucher_id: Number(c.voucherId) } : c.noDocument ? { no_document: true as const } : {}),
      })
    }
  })
  needRows('certificates', d.certificates, [
    ['date', 'properties.housing.field.date'],
    ['share', 'properties.housing.field.share'],
  ])

  const charges: NonNullable<HousingLoan['charges']> = []
  const chargeDays = new Map<string, number>()
  d.charges.forEach((c, i) => {
    if (blank(c)) return
    const at = { section: 'properties.housing.charges', n: i + 1 }
    needDate(`charges.${i}.from`, 'properties.housing.field.from', c.from, at)
    sameDay(chargeDays, c.from, i, `charges.${i}.from`, 'properties.housing.field.from', at)
    const amount = needAmount(`charges.${i}.amount`, 'properties.housing.field.charge', c.amount, at)
    if (!has(`charges.${i}.from`) && amount != null) {
      charges.push({
        from: c.from,
        amount_snt: amount,
        ...(c.rahastoitu ? { rahastoitu: true as const } : {}),
        ...(c.voucherId ? { voucher_id: Number(c.voucherId) } : c.noDocument ? { no_document: true as const } : {}),
      })
    }
  })
  needRows('charges', d.charges, [
    ['from', 'properties.housing.field.from'],
    ['amount', 'properties.housing.field.charge'],
  ])

  const rates: NonNullable<HousingLoan['rates']> = []
  const rateDays = new Map<string, number>()
  const rateLabel = fixed ? 'properties.housing.field.fixedRate' : 'properties.housing.field.rate'
  d.rates.forEach((r, i) => {
    if (blank(r)) return
    const at = { section: 'properties.housing.rates', n: i + 1 }
    needDate(`rates.${i}.from`, 'properties.housing.field.from', r.from, at)
    sameDay(rateDays, r.from, i, `rates.${i}.from`, 'properties.housing.field.from', at)
    const rate = parsePcmInput(r.rate)
    if (rate == null) issue(`rates.${i}.rate`, rateLabel, 'properties.form.issue.required', at)
    else if (Number.isNaN(rate)) issue(`rates.${i}.rate`, rateLabel, 'properties.form.issue.rate', at)
    else if (!has(`rates.${i}.from`)) rates.push({ from: r.from, reference_pcm: rate, ...(r.voucherId ? { voucher_id: Number(r.voucherId) } : {}) })
  })
  needRows('rates', d.rates, [
    ['from', 'properties.housing.field.from'],
    ['rate', rateLabel],
  ])

  const grace: NonNullable<HousingLoan['grace']> = []
  d.grace.forEach((g, i) => {
    if (blank(g)) return
    const at = { section: 'properties.housing.grace', n: i + 1 }
    needDate(`grace.${i}.from`, 'properties.housing.field.from', g.from, at)
    needDate(`grace.${i}.to`, 'properties.housing.field.to', g.to, at)
    if (okDate(g.from) && startsOk && g.from < d.starts) issue(`grace.${i}.from`, 'properties.housing.field.from', 'properties.form.issue.beforeStarts', at)
    if (okDate(g.from) && okDate(g.to) && g.to < g.from) issue(`grace.${i}.to`, 'properties.housing.field.to', 'properties.form.issue.toBeforeFrom', at)
    else if (okDate(g.to) && endsOk && g.to > d.ends) issue(`grace.${i}.to`, 'properties.housing.field.to', 'properties.form.issue.afterEnds', at)
    if (!has(`grace.${i}.from`) && !has(`grace.${i}.to`)) grace.push({ from: g.from, to: g.to })
  })

  const events: NonNullable<HousingLoan['events']> = []
  d.events.forEach((e, i) => {
    if (!e.date && !e.amount && !e.voucherId && !e.note) return
    const at = { section: 'properties.housing.events', n: i + 1 }
    needDate(`events.${i}.date`, 'properties.housing.field.date', e.date, at)
    const amount = amountOf(e.amount)
    if (amount != null && Number.isNaN(amount)) issue(`events.${i}.amount`, 'properties.housing.field.amount', 'properties.form.issue.amount', at)
    else if (e.kind === 'extra_payment' && !amount) issue(`events.${i}.amount`, 'properties.housing.field.amount', 'properties.form.issue.extraAmount', at)
    else if (okDate(e.date)) {
      events.push({
        date: e.date,
        kind: e.kind,
        ...(amount ? { amount_snt: amount } : {}),
        ...(e.voucherId ? { voucher_id: Number(e.voucherId) } : {}),
        ...(e.note.trim() ? { note: e.note.trim() } : {}),
      })
    }
  })
  if (issues.length) return issues

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
  if (rates.length) loan.rates = rates
  if (grace.length) loan.grace = grace
  if (certificates.length) loan.certificates = certificates
  if (charges.length) loan.charges = charges
  if (events.length) loan.events = events
  return loan
}
