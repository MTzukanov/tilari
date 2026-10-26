/** The rent increase notice (vuokrankorotusilmoitus) a landlord sends the tenant, as a PDF letter. */
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import { A4, textPdf, wrapText, type PdfText } from '../../../shared/textPdf'

type T = (key: string, vars?: Record<string, string | number>) => string

export type NoticeAmounts = { rent: number; water: number; parking: number }

export type NoticeInput = {
  company: { name: string; business_id: string; street: string; postcode: string; city: string; email: string; phone: string }
  tenant: { name: string; address: string[] }
  /** The rental object: the cost centre's name. */
  object: string
  /** The contract's title, when one is linked. */
  contract: string | null
  lease_starts: string
  due_day: number | null
  /** The increase clause in words, e.g. "3 % vuodessa"; empty when none is set. */
  clause: string
  /** The day the notice is written, and the day the new rent applies from. */
  date: string
  from: string
  before: NoticeAmounts
  after: NoticeAmounts
}

/** The voucher title: names the object, so Kitsas search finds it (Liitetieto). */
export function noticeTitle(t: T, object: string, from: string): string {
  return t('properties.notice.voucherTitle', { object, date: formatDate(from) })
}

const LEFT = 56
const RIGHT = A4.width - 56
const WIDTH = RIGHT - LEFT

export function noticeLayout(t: T, n: NoticeInput): PdfText[] {
  const out: PdfText[] = []
  let y = A4.height - 64
  const line = (text: string, opts: Partial<PdfText> = {}) => {
    out.push({ x: LEFT, y, text, size: 10, ...opts })
    y -= (opts.size ?? 10) * 1.45
  }
  const paragraph = (text: string) => {
    for (const row of wrapText(text, WIDTH, 10)) line(row)
    y -= 6
  }

  // Sender, and the date on the right.
  out.push({ x: RIGHT, y, text: formatDate(n.date), size: 10, align: 'right' })
  line(n.company.name, { bold: true, size: 11 })
  if (n.company.street) line(n.company.street)
  const town = [n.company.postcode, n.company.city].filter(Boolean).join(' ')
  if (town) line(town)
  const contact = [n.company.email, n.company.phone].filter(Boolean).join(' · ')
  if (contact) line(contact)
  if (n.company.business_id) line(t('properties.notice.businessId', { id: n.company.business_id }))

  // Recipient.
  y -= 28
  line(n.tenant.name)
  for (const row of n.tenant.address) line(row)

  y -= 30
  line(t('properties.notice.heading'), { bold: true, size: 14 })
  y -= 6
  paragraph(t('properties.notice.object', { object: n.object }))
  paragraph(
    n.contract
      ? t('properties.notice.contract', { contract: n.contract })
      : t('properties.notice.contractSince', { date: formatDate(n.lease_starts) }),
  )
  paragraph(
    n.clause
      ? t('properties.notice.changesClause', { date: formatDate(n.from), clause: n.clause })
      : t('properties.notice.changes', { date: formatDate(n.from) }),
  )

  // Old and new amounts, euros right-aligned in two columns.
  y -= 4
  const col1 = RIGHT - 130
  const col2 = RIGHT
  out.push({ x: col1, y, text: t('properties.notice.current'), size: 10, bold: true, align: 'right' })
  out.push({ x: col2, y, text: t('properties.notice.newFrom', { date: formatDate(n.from) }), size: 10, bold: true, align: 'right' })
  y -= 16
  const row = (label: string, a: number, b: number, bold = false) => {
    out.push({ x: LEFT, y, text: label, size: 10, bold })
    out.push({ x: col1, y, text: formatCents(a), size: 10, bold, align: 'right' })
    out.push({ x: col2, y, text: formatCents(b), size: 10, bold, align: 'right' })
    y -= 15
  }
  row(t('properties.notice.rent'), n.before.rent, n.after.rent)
  if (n.before.water || n.after.water) row(t('properties.notice.water'), n.before.water, n.after.water)
  if (n.before.parking || n.after.parking) row(t('properties.notice.parking'), n.before.parking, n.after.parking)
  const total = (a: NoticeAmounts) => a.rent + a.water + a.parking
  row(t('properties.notice.total'), total(n.before), total(n.after), true)

  y -= 14
  if (n.due_day) paragraph(t('properties.notice.due', { day: n.due_day }))
  y -= 14
  line(t('properties.notice.regards'))
  y -= 20
  line(n.company.name)
  return out
}

export function increaseNoticePdf(t: T, n: NoticeInput): Uint8Array {
  return textPdf([noticeLayout(t, n)], noticeTitle(t, n.object, n.from))
}
