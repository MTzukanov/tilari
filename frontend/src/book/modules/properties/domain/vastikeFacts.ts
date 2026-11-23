/**
 * The vastike invoices behind the object's payments to its housing company (ADR-034 step 4e): the
 * rows tilari-bank-import lists in the payment voucher's notes (`loadVastikeFacts`). Their
 * rahoitus rows say what each payment paid for the loans, which the path then follows instead of
 * the charge in force; a row that differs from the charge in force suggests a new one. Pure.
 */
import { monthEnd } from '../../../months'
import { chargeAt, loanRunning } from './housingLoan'
import type { PnlRow } from './ledger'
import type { HousingLoan, InvoicedCharge, LoanChargeSuggestion, VastikeFact, Warning } from './types'

/** An extra charge (ylimääräinen rahoitusvastike): paid on the loan, but no new monthly charge. */
const EXTRA = /ylim[äa][äa]r[äa]i/i

/** A row's name for matching: case, spacing and "ylimääräinen" do not count. */
const labelKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/ylim[äa][äa]r[äa]inen/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The invoices the object paid, from its expense lines' facts (lines a correction moved away left
 * out): every row, each with the month it was paid in.
 */
export function objectInvoices(rows: PnlRow[], facts: Map<number, VastikeFact[]>, reversed: ReadonlySet<number> = new Set()): InvoicedCharge[] {
  return rows.flatMap((r) =>
    reversed.has(r.id) ? [] : (facts.get(r.id) ?? []).map((f) => ({ ...f, paid_month: r.date.slice(0, 7), extra: EXTRA.test(f.label) })),
  )
}

/** One invoice: a line's rows of one period. */
const invoiceOf = (c: VastikeFact) => `${c.line_id}:${c.month}`

/** How many invoices the object paid each month (any rows): the payments they account for. */
export function invoicesByMonth(invoiced: InvoicedCharge[]): Map<string, number> {
  const seen = new Map<string, Set<string>>()
  for (const c of invoiced) seen.set(c.paid_month, (seen.get(c.paid_month) ?? new Set()).add(invoiceOf(c)))
  return new Map([...seen].map(([month, ids]) => [month, ids.size]))
}

export type AssignedCharges = { byLoan: Map<string, InvoicedCharge[]>; unmatched: InvoicedCharge[] }

/**
 * Each invoice's rahoitus rows to the loans running in its month: a row named as a loan's
 * `invoice_label`; else the only row to the only loan left; else a row to the only loan whose
 * charge in force is its amount. An extra charge goes with the loan of its name, or the only loan.
 * A loan takes one regular row of an invoice; rows no loan takes are `unmatched`.
 */
export function assignCharges(loans: HousingLoan[], invoiced: InvoicedCharge[]): AssignedCharges {
  const byLoan = new Map<string, InvoicedCharge[]>()
  const unmatched: InvoicedCharge[] = []
  const invoices = new Map<string, InvoicedCharge[]>()
  for (const c of invoiced) if (c.kind === 'rahoitus') invoices.set(invoiceOf(c), [...(invoices.get(invoiceOf(c)) ?? []), c])
  const give = (loan: HousingLoan, c: InvoicedCharge) => byLoan.set(loan.key, [...(byLoan.get(loan.key) ?? []), c])
  for (const rows of invoices.values()) {
    const day = monthEnd(rows[0].month)
    const running = loans.filter((l) => loanRunning(l, day))
    const taken = new Map<InvoicedCharge, HousingLoan>()
    const free = () => running.filter((l) => ![...taken.values()].includes(l))
    const regular = rows.filter((c) => !c.extra)
    for (const c of regular) {
      const named = free().filter((l) => l.invoice_label && labelKey(l.invoice_label) === labelKey(c.label))
      if (named.length === 1) taken.set(c, named[0])
    }
    const left = () => regular.filter((c) => !taken.has(c))
    if (left().length === 1 && free().length === 1) taken.set(left()[0], free()[0])
    for (const c of left()) {
      const due = free().filter((l) => chargeAt(l, day)?.amount_snt === c.amount_snt)
      if (due.length === 1) taken.set(c, due[0])
    }
    for (const c of rows.filter((r) => r.extra)) {
      const named = [...taken].find(([r]) => labelKey(r.label) === labelKey(c.label))?.[1]
      const loan = named ?? running.find((l) => l.invoice_label && labelKey(l.invoice_label) === labelKey(c.label)) ?? (running.length === 1 ? running[0] : null)
      if (loan) taken.set(c, loan)
    }
    for (const c of rows) {
      const loan = taken.get(c)
      if (loan) give(loan, c)
      else unmatched.push(c)
    }
  }
  return { byLoan, unmatched }
}

/** A loan's rahoitus rows by the month they were paid in, summed: what the path takes as paid. */
export function paidByMonth(own: InvoicedCharge[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of own) out.set(c.paid_month, (out.get(c.paid_month) ?? 0) + c.amount_snt)
  return out
}

/**
 * New rahoitusvastike rows the invoices give (4e): walking the loan's regular rows by the invoice's
 * month, an amount that is not the charge in force starts a suggestion from that month, with that
 * invoice as its document; the next invoices of the same amount add to it, and one that meets the
 * charge in force ends it. Extra charges suggest nothing.
 */
export function chargeSuggestions(loan: HousingLoan, own: InvoicedCharge[]): LoanChargeSuggestion[] {
  const months = new Map<string, InvoicedCharge[]>()
  for (const c of own) if (!c.extra) months.set(c.month, [...(months.get(c.month) ?? []), c])
  const out: LoanChargeSuggestion[] = []
  /** The last suggestion still runs: no invoice has met the charge in force since. */
  let open = false
  for (const [month, rows] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    const amount = rows.reduce((sum, c) => sum + c.amount_snt, 0)
    const last = out.at(-1)
    if (amount === (chargeAt(loan, monthEnd(month))?.amount_snt ?? 0)) open = false
    else if (open && last?.amount_snt === amount) last.invoices += 1
    else {
      out.push({ loan_key: loan.key, from: `${month}-01`, amount_snt: amount, voucher_id: rows[0].voucher_id, label: rows[0].label, invoices: 1 })
      open = true
    }
  }
  return out
}

/**
 * What the invoices ask of the owner while the object is held: each suggestion
 * (`loan_charge_invoiced`), and each name of a rahoitus row no loan takes, from its first month -
 * a loan not entered yet, or several loans the rows cannot tell apart (`loan_invoice_unmatched`).
 */
export function invoiceWarnings(loans: HousingLoan[], suggestions: LoanChargeSuggestion[], unmatched: InvoicedCharge[], held: boolean): Warning[] {
  if (!held) return []
  const out: Warning[] = suggestions.map((s) => ({
    code: 'loan_charge_invoiced',
    params: { loan: loans.find((l) => l.key === s.loan_key)?.name ?? '', amount_snt: s.amount_snt, from_date: s.from },
  }))
  const first = new Map<string, InvoicedCharge>()
  for (const c of [...unmatched].sort((a, b) => a.month.localeCompare(b.month))) if (!first.has(labelKey(c.label))) first.set(labelKey(c.label), c)
  for (const c of first.values()) {
    out.push({ code: 'loan_invoice_unmatched', params: { label: c.label, amount_snt: c.amount_snt, from_date: `${c.month}-01` } })
  }
  return out
}

/** How the object's invoices name their rahoitus rows, first seen first. */
export function invoiceLabels(invoiced: InvoicedCharge[]): string[] {
  return [...new Set([...invoiced].filter((c) => c.kind === 'rahoitus').sort((a, b) => a.month.localeCompare(b.month)).map((c) => c.label))]
}
