/** A letter from the landlord to a tenant, as PDF text: sender and date, recipient, then the body. */
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import { A4, wrapText, type PdfText } from '../../../shared/textPdf'

type T = (key: string, vars?: Record<string, string | number>) => string

export type LetterCompany = { name: string; business_id: string; street: string; postcode: string; city: string; email: string; phone: string }
export type LetterHead = { company: LetterCompany; tenant: { name: string; address: string[] }; date: string }

const LEFT = 56
const RIGHT = A4.width - 56
const WIDTH = RIGHT - LEFT
const COLUMN = 130

export type Letter = {
  line: (text: string, opts?: Partial<PdfText>) => void
  paragraph: (text: string) => void
  space: (points: number) => void
  heading: (text: string) => void
  /** Labelled euro rows, right-aligned in columns; optional column headings above. */
  table: (headings: string[] | null, rows: { label: string; amounts: number[]; bold?: boolean }[]) => void
  /** Regards and the company's name; the finished page. */
  close: () => PdfText[]
}

export function letter(t: T, head: LetterHead): Letter {
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
  const space = (points: number) => {
    y -= points
  }

  // Sender, and the date on the right.
  const { company } = head
  out.push({ x: RIGHT, y, text: formatDate(head.date), size: 10, align: 'right' })
  line(company.name, { bold: true, size: 11 })
  if (company.street) line(company.street)
  const town = [company.postcode, company.city].filter(Boolean).join(' ')
  if (town) line(town)
  const contact = [company.email, company.phone].filter(Boolean).join(' · ')
  if (contact) line(contact)
  if (company.business_id) line(t('properties.notice.businessId', { id: company.business_id }))

  // Recipient.
  y -= 28
  line(head.tenant.name)
  for (const row of head.tenant.address) line(row)
  y -= 30

  return {
    line,
    paragraph,
    space,
    heading(text) {
      line(text, { bold: true, size: 14 })
      y -= 6
    },
    table(headings, rows) {
      const columns = Math.max(headings?.length ?? 0, ...rows.map((r) => r.amounts.length))
      const x = (k: number) => RIGHT - COLUMN * (columns - 1 - k)
      y -= 4
      if (headings) {
        headings.forEach((text, k) => out.push({ x: x(k), y, text, size: 10, bold: true, align: 'right' }))
        y -= 16
      }
      for (const row of rows) {
        out.push({ x: LEFT, y, text: row.label, size: 10, bold: row.bold })
        row.amounts.forEach((a, k) => out.push({ x: x(k), y, text: formatCents(a), size: 10, bold: row.bold, align: 'right' }))
        y -= 15
      }
    },
    close() {
      line(t('properties.notice.regards'))
      y -= 20
      line(company.name)
      return out
    },
  }
}
