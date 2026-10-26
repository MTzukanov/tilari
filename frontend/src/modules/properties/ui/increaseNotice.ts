/** The rent increase notice (vuokrankorotusilmoitus) a landlord sends the tenant, as a PDF letter. */
import { formatDate } from '../../../shared/dates'
import { textPdf, type PdfText } from '../../../shared/textPdf'
import { letter, type LetterCompany } from './letter'

type T = (key: string, vars?: Record<string, string | number>) => string

export type NoticeAmounts = { rent: number; water: number; parking: number }

export type NoticeInput = {
  company: LetterCompany
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

export function noticeLayout(t: T, n: NoticeInput): PdfText[] {
  const l = letter(t, { company: n.company, tenant: n.tenant, date: n.date })
  l.heading(t('properties.notice.heading'))
  l.paragraph(t('properties.notice.object', { object: n.object }))
  l.paragraph(
    n.contract
      ? t('properties.notice.contract', { contract: n.contract })
      : t('properties.notice.contractSince', { date: formatDate(n.lease_starts) }),
  )
  l.paragraph(
    n.clause
      ? t('properties.notice.changesClause', { date: formatDate(n.from), clause: n.clause })
      : t('properties.notice.changes', { date: formatDate(n.from) }),
  )

  // Old and new amounts.
  const total = (a: NoticeAmounts) => a.rent + a.water + a.parking
  const rows = [{ label: t('properties.notice.rent'), amounts: [n.before.rent, n.after.rent] }]
  if (n.before.water || n.after.water) rows.push({ label: t('properties.notice.water'), amounts: [n.before.water, n.after.water] })
  if (n.before.parking || n.after.parking) rows.push({ label: t('properties.notice.parking'), amounts: [n.before.parking, n.after.parking] })
  l.table(
    [t('properties.notice.current'), t('properties.notice.newFrom', { date: formatDate(n.from) })],
    [...rows, { label: t('properties.notice.total'), amounts: [total(n.before), total(n.after)], bold: true }],
  )

  l.space(14)
  if (n.due_day) l.paragraph(t('properties.notice.due', { day: n.due_day }))
  l.space(14)
  return l.close()
}

export function increaseNoticePdf(t: T, n: NoticeInput): Uint8Array {
  return textPdf([noticeLayout(t, n)], noticeTitle(t, n.object, n.from))
}
