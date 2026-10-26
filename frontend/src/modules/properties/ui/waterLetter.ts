/** The water settlement letter (vesitasauslaskelma) a landlord sends the tenant, as a PDF. */
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import { textPdf, type PdfText } from '../../../shared/textPdf'
import { letter, type LetterCompany } from './letter'

type T = (key: string, vars?: Record<string, string | number>) => string

export type WaterLetterInput = {
  company: LetterCompany
  tenant: { name: string; address: string[] }
  object: string
  /** The day the letter is written. */
  date: string
  /** The company's settlement period, and the tenant's part of it. */
  from: string
  to: string
  stay: { from: string; to: string; days: number }
  advance_snt: number
  /** + the tenant pays, - refunded. */
  balance_snt: number
}

/** The voucher title: names the object, so Kitsas search finds it (Liitetieto). */
export function waterLetterTitle(t: T, object: string, from: string, to: string): string {
  return t('properties.water.letter.voucherTitle', { object, from: formatDate(from), to: formatDate(to) })
}

/** The title of the company's statement when the owner uploads it. */
export function statementTitle(t: T, object: string, from: string, to: string): string {
  return t('properties.water.statementTitle', { object, from: formatDate(from), to: formatDate(to) })
}

export function waterLetterLayout(t: T, n: WaterLetterInput): PdfText[] {
  const l = letter(t, { company: n.company, tenant: n.tenant, date: n.date })
  const period = { from: formatDate(n.from), to: formatDate(n.to) }
  l.heading(t('properties.water.letter.heading'))
  l.paragraph(t('properties.notice.object', { object: n.object }))
  l.paragraph(t('properties.water.letter.period', period))
  if (n.stay.from !== n.from || n.stay.to !== n.to) {
    l.paragraph(t('properties.water.letter.stay', { from: formatDate(n.stay.from), to: formatDate(n.stay.to), days: n.stay.days }))
  }
  const refund = n.balance_snt < 0
  const amount = Math.abs(n.balance_snt)
  l.table(null, [
    { label: t('properties.water.letter.advances'), amounts: [n.advance_snt] },
    { label: t('properties.water.letter.actual'), amounts: [n.advance_snt + n.balance_snt] },
    { label: t(refund ? 'properties.water.letter.refund' : 'properties.water.letter.charge'), amounts: [amount], bold: true },
  ])
  l.space(14)
  l.paragraph(t(refund ? 'properties.water.letter.refundText' : 'properties.water.letter.chargeText', { amount: formatCents(amount) }))
  l.space(14)
  return l.close()
}

export function waterLetterPdf(t: T, n: WaterLetterInput): Uint8Array {
  return textPdf([waterLetterLayout(t, n)], waterLetterTitle(t, n.object, n.from, n.to))
}
