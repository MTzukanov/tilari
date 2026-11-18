/**
 * Housing-company loans (yhtiölainat) of a rental object (ADR-034): what a stored loan holds on a
 * day, the documents it links, its share month by month, and the reminders it gives. Computed every
 * time, never stored. Pure.
 */
import { addMonths, monthEnd, monthKeys } from '../../../months'
import { monthsBefore } from './reminders'
import type { HousingLoan, LoanCertificate, LoanCharge, LoanMonth, LoanPath, LoanRate, Warning } from './types'

/** A share older than this on the as-of date asks for a new isännöitsijäntodistus. */
export const CERTIFICATE_STALE_MONTHS = 12

/** The row in force on `date`: the last one from that day or before; rows are oldest first. */
export function rowAt<T extends { from: string }>(rows: T[] | undefined, date: string): T | null {
  let found: T | null = null
  for (const row of rows ?? []) {
    if (row.from > date) break
    found = row
  }
  return found
}

/** The newest certificate on `date` or before. */
export function latestCertificate(loan: HousingLoan, date: string): LoanCertificate | null {
  const dated = (loan.certificates ?? []).filter((c) => c.date <= date)
  return dated.length ? dated[dated.length - 1] : null
}

export function chargeAt(loan: HousingLoan, date: string): LoanCharge | null {
  return rowAt(loan.charges, date)
}

export function rateAt(loan: HousingLoan, date: string): LoanRate | null {
  return rowAt(loan.rates, date)
}

/**
 * The day a loan's rows are read on: the later of the page's as-of date and the book's day. The rows
 * are the owner's inputs, not bookings, so one dated after the last booked month still counts.
 */
export function loanDay(asOf: string, today: string): string {
  return today > asOf ? today : asOf
}

/**
 * What a loan's card shows on `on`: the newest share by then (else its newest), and the
 * rahoitusvastike and rate in force (else the first one to come).
 */
export function loanNow(loan: HousingLoan, on: string): { certificate: LoanCertificate | null; charge: LoanCharge | null; rate: LoanRate | null } {
  return {
    certificate: latestCertificate(loan, on) ?? loan.certificates?.at(-1) ?? null,
    charge: chargeAt(loan, on) ?? loan.charges?.[0] ?? null,
    rate: rateAt(loan, on) ?? loan.rates?.[0] ?? null,
  }
}

/** The day the object's share was paid off (kertasuoritus), if it was. */
export function paidOffOn(loan: HousingLoan): string | null {
  return (loan.events ?? []).find((e) => e.kind === 'paid_off')?.date ?? null
}

/** Drawn, not past its last due date, and not paid off on `date`. */
export function loanRunning(loan: HousingLoan, date: string): boolean {
  const paidOff = paidOffOn(loan)
  return loan.starts <= date && (!loan.ends || loan.ends >= date) && (!paidOff || paidOff > date)
}

/** Every voucher a loan links: rate notices, certificates, charge notices and events' documents. */
export function housingVoucherIds(loans: HousingLoan[]): number[] {
  const ids = new Set<number>()
  for (const loan of loans) {
    for (const row of [...(loan.rates ?? []), ...(loan.certificates ?? []), ...(loan.charges ?? []), ...(loan.events ?? [])]) {
      if (row.voucher_id != null) ids.add(row.voucher_id)
    }
  }
  return [...ids]
}

/** The object's payments to its housing company: whole payments by month (`housingPayments`), and whether any were found. */
export type PaymentUnits = { units: (month: string) => number; known: boolean }

const monthOf = (date: string) => date.slice(0, 7)

/** The rate in force at a month's end: the reference rate (the first row before any) plus the margin; a fixed rate has none. */
function rateIn(loan: HousingLoan, month: string): number {
  const reference = (rateAt(loan, monthEnd(month)) ?? loan.rates?.[0])?.reference_pcm ?? 0
  return reference + (loan.reference === 'fixed' ? 0 : loan.margin_pcm)
}

/** The rahoitusvastike in force for a month: a row from any day of it counts for it. */
const dueIn = (loan: HousingLoan, month: string) => chargeAt(loan, monthEnd(month))?.amount_snt ?? 0

/** A month's interest on `share` at `pcm` (1/1000 % a year), to the cent. */
const interestOn = (share: number, pcm: number) => Math.round((share * pcm) / 1_200_000)

/** `total` split by `weights` in whole cents (largest remainder): the parts add up to it exactly. */
export function splitByWeight(total: number, weights: number[]): number[] {
  const positive = weights.map((w) => Math.max(0, w))
  const sum = positive.reduce((a, b) => a + b, 0)
  const shares = sum > 0 ? positive.map((w) => w / sum) : weights.map(() => 1 / weights.length)
  const sign = total < 0 ? -1 : 1
  const exact = shares.map((w) => w * Math.abs(total))
  const parts = exact.map(Math.floor)
  let left = Math.abs(total) - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    parts[i] += 1
    left -= 1
  }
  return parts.map((p) => p * sign)
}

/**
 * The loan's share month by month (ADR-034), from its certificates and the payments to the housing
 * company: each month pays the rahoitusvastike in force once per payment (each due month when
 * payments are not known), the interest is the share at the month's start times the rate, and what
 * is left of the payment lowers the share, as do extra repayments; a payoff ends it. A certificate
 * gives the share at its month's end. Before the first one the path runs backwards; between two, the
 * computed months are fitted to meet the later one - its gap, computed less certified, is taken from
 * their interest by weight - and the gap and the rate the fitted interest implies are kept on the
 * certificate's month. After the last one it runs on to `to`.
 * `from`: the earliest month the book can follow (the object's purchase, the books' start).
 */
export function loanPath(loan: HousingLoan, opts: { payments: PaymentUnits; from: string | null; to: string }): Omit<LoanPath, 'missing'> {
  const known = opts.payments.known
  const certificates = loan.certificates ?? []
  if (!certificates.length) return { loan_key: loan.key, months: [], payments_known: known }
  // One anchor a month: the latest certificate in it.
  const anchors = [...new Map(certificates.map((c) => [monthOf(c.date), c])).entries()]
  const first = anchors[0][0]
  const paidOff = paidOffOn(loan)
  const floor = [monthOf(loan.starts), opts.from, loan.charges?.[0] ? monthOf(loan.charges[0].from) : null]
    .filter((m): m is string => m != null)
    .sort()
    .at(-1)!
  const start = floor < first ? floor : first
  const ends = [opts.to, loan.ends ? monthOf(loan.ends) : null, paidOff ? monthOf(paidOff) : null].filter((m): m is string => m != null).sort()[0]
  const end = ends > anchors.at(-1)![0] ? ends : anchors.at(-1)![0]
  const keys = monthKeys(`${start}-01`, `${end}-01`)

  const payments = (m: string) => (known ? opts.payments.units(m) : dueIn(loan, m) > 0 ? 1 : 0)
  const extraIn = (m: string) =>
    (loan.events ?? []).filter((e) => e.kind === 'extra_payment' && monthOf(e.date) === m).reduce((sum, e) => sum + (e.amount_snt ?? 0), 0)
  const base = (m: string) => {
    const due = dueIn(loan, m)
    const count = payments(m)
    return { month: m, due_snt: due, payments: count, paid_snt: due * count, rate_pcm: rateIn(loan, m), extra_snt: extraIn(m) }
  }
  const forward = (m: string, opening: number): LoanMonth => {
    const b = base(m)
    const interest = interestOn(opening, b.rate_pcm)
    let extra = b.extra_snt
    let closing = opening - (b.paid_snt - interest) - extra
    // The share paid off: what was left goes with the payoff.
    if (paidOff && monthOf(paidOff) === m) {
      extra += closing
      closing = 0
    }
    return { ...b, opening_snt: opening, interest_snt: interest, principal_snt: b.paid_snt - interest, extra_snt: extra, closing_snt: closing }
  }
  const backward = (m: string, closing: number): LoanMonth => {
    const b = base(m)
    const opening = Math.round((closing + b.paid_snt + b.extra_snt) / (1 + b.rate_pcm / 1_200_000))
    const principal = opening - closing - b.extra_snt
    return { ...b, opening_snt: opening, interest_snt: b.paid_snt - principal, principal_snt: principal, closing_snt: closing }
  }
  /** Re-chains `rows` from `opening` after their interest changed. */
  const rechain = (rows: LoanMonth[], opening: number) => {
    for (const row of rows) {
      row.opening_snt = opening
      row.principal_snt = row.paid_snt - row.interest_snt
      row.closing_snt = opening - row.principal_snt - row.extra_snt
      opening = row.closing_snt
    }
  }

  const rows: LoanMonth[] = []
  const at = (m: string) => keys.indexOf(m)
  // Backwards from the first certificate.
  let closing = anchors[0][1].share_snt
  for (let i = at(first); i >= 0; i--) {
    const row = backward(keys[i], closing)
    if (i < at(first)) row.backward = true
    rows[i] = row
    closing = row.opening_snt
  }
  rows[at(first)].certificate = { date: anchors[0][1].date, share_snt: anchors[0][1].share_snt, gap_snt: null, implied_pcm: null, ...voucherOf(anchors[0][1]) }
  // Forwards, fitted between certificates.
  for (let k = 1; k < anchors.length; k++) {
    const [from, to] = [at(anchors[k - 1][0]), at(anchors[k][0])]
    const span: LoanMonth[] = []
    let opening = rows[from].closing_snt
    for (let i = from + 1; i <= to; i++) {
      const row = forward(keys[i], opening)
      span.push(row)
      opening = row.closing_snt
    }
    const certified = anchors[k][1]
    const gap = span.at(-1)!.closing_snt - certified.share_snt
    const parts = splitByWeight(gap, span.map((r) => r.interest_snt))
    span.forEach((r, i) => (r.interest_snt -= parts[i]))
    rechain(span, rows[from].closing_snt)
    const openings = span.reduce((sum, r) => sum + r.opening_snt, 0)
    const interest = span.reduce((sum, r) => sum + r.interest_snt, 0)
    span.at(-1)!.certificate = {
      date: certified.date,
      share_snt: certified.share_snt,
      gap_snt: gap,
      implied_pcm: openings > 0 ? Math.round((interest * 1_200_000) / openings) : null,
      ...voucherOf(certified),
    }
    span.forEach((r, i) => (rows[from + 1 + i] = r))
  }
  // On from the last certificate.
  let opening = rows[at(anchors.at(-1)![0])].closing_snt
  for (let i = at(anchors.at(-1)![0]) + 1; i < keys.length; i++) {
    rows[i] = forward(keys[i], opening)
    opening = rows[i].closing_snt
  }
  return { loan_key: loan.key, months: rows, payments_known: known }
}

const voucherOf = (c: LoanCertificate) => (c.voucher_id != null ? { voucher_id: c.voucher_id } : {})

/**
 * Due months the payments did not cover by `through` (the last month the book has): counted on from
 * `from` (the first month the book can follow), a payment ahead covering a later month, and a
 * catch-up an earlier one. Null when all are covered or payments are not known.
 */
export function paymentsMissing(loan: HousingLoan, payments: PaymentUnits, from: string | null, through: string): LoanPath['missing'] {
  if (!payments.known || !loan.charges?.length) return null
  const paidOff = paidOffOn(loan)
  const last = [through, loan.ends ? monthOf(loan.ends) : null, paidOff ? monthOf(paidOff) : null].filter((m): m is string => m != null).sort()[0]
  const firstDue = monthOf(loan.charges[0].from)
  const start = [firstDue, monthOf(loan.starts), from].filter((m): m is string => m != null).sort().at(-1)!
  if (start > last) return null
  let deficit = 0
  let since: string | null = null
  for (const m of monthKeys(`${start}-01`, `${last}-01`)) {
    if (dueIn(loan, m) > 0) deficit += 1
    deficit -= payments.units(m)
    if (deficit > 0) since ??= m
    else since = null
  }
  return deficit > 0 && since ? { count: deficit, from: since } : null
}

/** Months from `a` to `b` (`YYYY-MM`): 0 in the same month. */
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

/** A forecast that has not cleared the share in this many months never will: there is none. */
const FORECAST_MAX_MONTHS = 600

/** The level payment that clears `share` in `months` at `pcm` (1/1000 % a year), to the cent. */
export function annuityPayment(share: number, pcm: number, months: number): number {
  const r = pcm / 1_200_000
  if (months <= 1) return share + interestOn(share, pcm)
  if (r === 0) return Math.ceil(share / months)
  return Math.round((share * r) / (1 - (1 + r) ** -months))
}

/**
 * The share's months after the path, to the loan's end (ADR-034): an estimate, at the rates the rows
 * give and the latest one after them (estimates per reference rate come later). The rahoitusvastike in
 * force - or a later row of it, the company's own figure - is paid until the next rate reset (every
 * `reset_months`, 12 when not known, from the latest rate row) or the end of an interest-only period;
 * from there an annuity pays what clears the share by `ends` and a tasalyhennys the share over the
 * months left plus the interest, both worked out again at each reset. A fixed payment stays as it is
 * and runs the share to 0, whatever `ends` says. An interest-only month pays the interest; the last
 * month pays what is left. None without a path, a share left or a rate, once paid off, or when the
 * charge would never clear the share.
 */
export function loanForecast(loan: HousingLoan, path: LoanPath): LoanMonth[] {
  const last = path.months.at(-1)
  if (!last || last.closing_snt <= 0 || paidOffOn(loan) || !loan.rates?.length) return []
  const end = loan.type !== 'fixed_payment' && loan.ends ? monthOf(loan.ends) : null
  if (end && end <= last.month) return []
  const anchor = monthOf(loan.rates.at(-1)!.from)
  const every = loan.reset_months ?? 12
  const inGrace = (m: string) => (loan.grace ?? []).some((g) => monthOf(g.from) <= m && m <= monthOf(g.to))
  const newCharge = (m: string) => (loan.charges ?? []).some((c) => monthOf(c.from) === m)
  const rows: LoanMonth[] = []
  let opening = last.closing_snt
  let worked: { annuity: number; principal: number } | null = null
  for (let m = addMonths(last.month, 1); rows.length < FORECAST_MAX_MONTHS; m = addMonths(m, 1)) {
    const rate = rateIn(loan, m)
    const interest = interestOn(opening, rate)
    const since = monthsBetween(anchor, m)
    const reset = (since >= 0 && since % every === 0) || (rows.length > 0 && inGrace(rows.at(-1)!.month) && !inGrace(m))
    if (newCharge(m)) worked = null
    if (end && loan.type !== 'fixed_payment' && reset && !inGrace(m)) {
      const left = monthsBetween(m, end) + 1
      worked = { annuity: annuityPayment(opening, rate, left), principal: Math.round(opening / left) }
    }
    let pay = inGrace(m)
      ? interest
      : worked
        ? loan.type === 'annuity'
          ? worked.annuity
          : worked.principal + interest
        : dueIn(loan, m)
    if (m === end || pay >= opening + interest) pay = opening + interest
    const closing = opening - (pay - interest)
    rows.push({
      month: m,
      opening_snt: opening,
      due_snt: pay,
      payments: 1,
      paid_snt: pay,
      rate_pcm: rate,
      interest_snt: interest,
      principal_snt: pay - interest,
      extra_snt: 0,
      closing_snt: closing,
      forecast: true,
    })
    if (closing <= 0) return rows
    opening = closing
  }
  return []
}

/** The next reset of the reference rate after the latest rate row, if its interval is known. */
export function nextReset(loan: HousingLoan): string | null {
  const last = loan.rates?.at(-1)
  if (!last || !loan.reset_months || loan.reference === 'fixed') return null
  const key = addMonths(monthOf(last.from), loan.reset_months)
  const day = last.from.slice(8)
  const lastDay = monthEnd(key).slice(8)
  return `${key}-${day > lastDay ? lastDay : day}`
}

/**
 * What the loans ask of the owner while the object is held, on `on` (the later of the as-of date and
 * the book's day): a running loan with no share, a newest share older than
 * `CERTIFICATE_STALE_MONTHS`, documents the rows have a place for but no voucher in (a
 * certificate's, a rahoitusvastike's notice), each skippable (ADR-030); with the paths
 * (`loanPath` + `paymentsMissing`), payments missing, a rate reset passed with no rate for it, and a
 * rahastoitu charge paid as a cost (a note: the ledger books it so).
 */
export function loanWarnings(loans: HousingLoan[], on: string, held: boolean, paths: LoanPath[] = []): Warning[] {
  if (!held) return []
  const out: Warning[] = []
  for (const loan of loans) {
    const path = paths.find((p) => p.loan_key === loan.key)
    if (path?.missing) {
      out.push({ code: 'loan_payment_missing', params: { loan: loan.name, count: path.missing.count, from_date: `${path.missing.from}-01` } })
    }
    const reset = loanRunning(loan, on) ? nextReset(loan) : null
    if (reset && reset <= on) out.push({ code: 'loan_rate_missing', params: { loan: loan.name, reset_date: reset } })
    if (path?.payments_known) {
      for (const [i, c] of (loan.charges ?? []).entries()) {
        if (!c.rahastoitu) continue
        const until = loan.charges![i + 1] ? monthOf(loan.charges![i + 1].from) : null
        const paid = path.months.some((m) => m.month >= monthOf(c.from) && (!until || m.month < until) && m.paid_snt > 0)
        if (paid) out.push({ code: 'loan_rahastoitu_expensed', params: { loan: loan.name, from_date: c.from } })
      }
    }
    if (loanRunning(loan, on)) {
      const latest = loan.certificates?.at(-1)
      if (!latest) out.push({ code: 'loan_share_missing', params: { loan: loan.name } })
      else if (latest.date < monthsBefore(on, CERTIFICATE_STALE_MONTHS)) {
        out.push({ code: 'loan_certificate_stale', params: { loan: loan.name, certificate_date: latest.date } })
      }
    }
    for (const c of loan.certificates ?? []) {
      if (c.voucher_id != null || c.no_document) continue
      out.push({
        code: 'loan_certificate_missing',
        params: { loan: loan.name, certificate_date: c.date },
        skip: { kind: 'loan_certificate', loan_key: loan.key, date: c.date },
      })
    }
    for (const c of loan.charges ?? []) {
      if (c.voucher_id != null || c.no_document) continue
      out.push({
        code: 'loan_charge_notice_missing',
        params: { loan: loan.name, from_date: c.from, amount_snt: c.amount_snt },
        skip: { kind: 'loan_charge', loan_key: loan.key, from: c.from },
      })
    }
  }
  return out
}

/** The group named after an original loan (`loanKey` on object `objectId`), which its copies join. */
export const groupOf = (objectId: number, loanKey: string) => `o${objectId}-${loanKey}`

/** The group a copy of `loan` (on object `objectId`) joins: the loan's own, else one named after it. */
export function copyGroup(loan: HousingLoan, objectId: number): string {
  return loan.group ?? groupOf(objectId, loan.key)
}
