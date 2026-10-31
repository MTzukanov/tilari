/**
 * Suggestions from what the book already holds: which voucher file is which document of which
 * period. Nothing is stored until the owner accepts it. Pure; `candidates.ts` loads the rows.
 *
 * Words are matched after folding (case, ä/ö/å, separators), on word starts so that a stem does not
 * hit inside another word, and loosely enough for inflection and the odd typo. Purchases, sales and
 * statements are left out: the same words there are invoices about the documents, not documents.
 */
import { TYPE_ATTACHMENT_NOTE, TYPE_OTHER, TYPE_TRANSFER } from '../../../vouchers'
import type { CompanyKind, DocCandidate, PeriodKind, Suggestion } from './types'

/** Only here do documents sit: no purchases, sales, statements or VAT returns. */
const DOCUMENT_TYPES: ReadonlySet<number> = new Set([TYPE_ATTACHMENT_NOTE, TYPE_OTHER, TYPE_TRANSFER])

/** Lowercase, no diacritics, separators as spaces, dates removed. A file's extension goes too. */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\.[a-z][a-z0-9]{1,4}$/, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[.-]\d{1,2}[.-]\d{2,4}\b/g, ' ')
    .replace(/ä|å/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
}

/** A generated file name (a hash) says nothing about the document. */
function isOpaqueName(name: string): boolean {
  const stem = name.replace(/\.[a-zA-Z][a-zA-Z0-9]{1,4}$/, '')
  if (/^[0-9a-f-]{16,}$/i.test(stem)) return true
  // Base64-like: one long run mixing case and digits, with no stretch of letters long enough to be a word.
  return stem.split(/[_-]/).some((part) => part.length >= 12 && /\d/.test(part) && /[A-Z]/.test(part) && /[a-z]/.test(part) && !/[a-z]{6,}/.test(part))
}

/** Taxes that have returns of their own; "veroilmoitus" in them is not the 6B. */
const OTHER_TAX = /arvonlisavero|varainsiirtovero|\balv\b/

/** An extraordinary meeting is not the AGM, and must not answer its deadline. */
const EXTRAORDINARY = /\bylim+a+r/

const PERIOD_RULES: { kind: PeriodKind; pattern: RegExp }[] = [
  { kind: 'financial_statements', pattern: /\btilinpaatos\b|\btilinpaatoks/ },
  { kind: 'balance_sheet_specs', pattern: /\btase ?eritte/ },
  { kind: 'annual_report', pattern: /\btoimintakertomu/ },
  { kind: 'audit_report', pattern: /\btilintarkastuskertomu|\btt ?kertomu/ },
  { kind: 'agm_minutes', pattern: /\byhtio ?kokou/ },
  { kind: 'board_minutes', pattern: /\bhallitu\w*kokou|\bhallitu\w* (?:\w+ )?(?:kokou|poytakirj)/ },
  { kind: 'prh_filing_receipt', pattern: /\bprh\b/ },
  { kind: 'tax_return_6b', pattern: /\b6b\b|\b(?:yhteiso|tulo)?veroilmoitu/ },
  { kind: 'tax_decision', pattern: /\bverotuspaat/ },
]

const COMPANY_RULES: { kind: CompanyKind; pattern: RegExp }[] = [
  { kind: 'articles', pattern: /\byhtiojarjesty|\byhteisosaanno/ },
  { kind: 'trade_register_extract', pattern: /\bkaupparekisteriot/ },
  { kind: 'shareholder_register', pattern: /\bosakasluettelo|\bosakeluettelo/ },
  { kind: 'shareholder_agreement', pattern: /osakassopimu/ },
]

/** Kinds read from one text, the company's and the period's. */
export function kindsIn(text: string): { period: PeriodKind[]; company: CompanyKind[]; extraordinary: boolean } {
  const folded = foldText(text)
  if (OTHER_TAX.test(folded)) return { period: [], company: [], extraordinary: false }
  const company = COMPANY_RULES.filter((r) => r.pattern.test(folded)).map((r) => r.kind)
  if (company.length) return { period: [], company, extraordinary: false }
  const extraordinary = EXTRAORDINARY.test(folded)
  const found = PERIOD_RULES.filter((r) => r.pattern.test(folded)).map((r) => r.kind)
  // A receipt names what it is for, and is not the statements itself.
  const receipt = found.includes('prh_filing_receipt')
  const period = found.filter((kind) => !(extraordinary && kind === 'agm_minutes') && !(receipt && kind === 'financial_statements'))
  return { period, company: [], extraordinary }
}

/** The year a text names: the end of a range ("2024/25"), else the first year. */
export function yearIn(text: string): number | null {
  const folded = foldText(text)
  const range = /\b(20\d{2})\/(\d{2})\b/.exec(folded)
  if (range) return Number(`${range[1].slice(0, 2)}${range[2]}`)
  const year = /\b(20\d{2})\b/.exec(folded)
  return year ? Number(year[1]) : null
}

export type PeriodRange = { starts: string; ends: string }

function lastEndedBefore(periods: PeriodRange[], date: string): string | null {
  let found: string | null = null
  for (const p of periods) if (p.ends < date && (found == null || p.ends > found)) found = p.ends
  return found
}

function periodNamed(periods: PeriodRange[], year: number | null): string | null {
  if (year == null) return null
  return periods.find((p) => p.ends.startsWith(`${year}-`))?.ends ?? null
}

/** Minutes name the meeting's year, not the period's: only the date tells. */
const BY_DATE_ONLY: ReadonlySet<string> = new Set<PeriodKind>(['agm_minutes', 'board_minutes', 'other'])

function periodFor(kind: string, years: (number | null)[], periods: PeriodRange[], date: string): string | null {
  if (!BY_DATE_ONLY.has(kind)) {
    for (const year of years) {
      const named = periodNamed(periods, year)
      if (named) return named
    }
  }
  return lastEndedBefore(periods, date)
}

export function suggestionKey(row: Pick<DocCandidate, 'voucher_id' | 'attachment_id'>, kind: string): string {
  return `${row.voucher_id}:${row.attachment_id ?? ''}:${kind}`
}

export type SuggestInput = {
  /** Every posted voucher's user files, one row per file. */
  rows: DocCandidate[]
  periods: PeriodRange[]
  /** Vouchers that are another module's documents (rental objects). */
  excludedVouchers: ReadonlySet<number>
  dismissed: ReadonlySet<string>
}

/** `linked` rows are skipped. The same file on two vouchers is suggested once, the type-800 one first. */
export function suggestDocuments({ rows, periods, excludedVouchers, dismissed }: SuggestInput): Suggestion[] {
  const fileCount = new Map<number, number>()
  for (const row of rows) fileCount.set(row.voucher_id, (fileCount.get(row.voucher_id) ?? 0) + 1)

  const usable = rows
    .filter((r) => !r.linked && DOCUMENT_TYPES.has(r.type) && !excludedVouchers.has(r.voucher_id))
    .sort((a, b) => Number(b.type === TYPE_ATTACHMENT_NOTE) - Number(a.type === TYPE_ATTACHMENT_NOTE) || a.voucher_id - b.voucher_id)

  // A file already linked, on any voucher, is not offered again from another voucher.
  const linkedNames = new Set(rows.filter((r) => r.linked && r.file_name).map((r) => r.file_name.toLowerCase()))
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const row of usable) {
    if (linkedNames.has(row.file_name.toLowerCase())) continue
    const opaque = isOpaqueName(row.file_name)
    const fromName = kindsIn(opaque ? '' : row.file_name)
    // The title speaks for the file only when the voucher holds no other, or the name says nothing.
    const fromTitle = fileCount.get(row.voucher_id) === 1 || opaque ? kindsIn(row.title) : { period: [], company: [], extraordinary: false }
    const extraordinary = fromName.extraordinary || fromTitle.extraordinary

    const add = (kind: string, periodEnds: string | null) => {
      const dedupe = `${row.file_name.toLowerCase() || row.voucher_id}|${kind}|${periodEnds ?? ''}`
      const key = suggestionKey(row, kind)
      if (seen.has(dedupe)) return
      seen.add(dedupe)
      if (!dismissed.has(key)) out.push({ ...row, key, kind, period_ends: periodEnds })
    }

    for (const kind of new Set([...fromName.company, ...fromTitle.company])) add(kind, null)

    const kinds = [...new Set([...fromName.period, ...fromTitle.period])]
    // A file name decides for itself: a voucher's title can name its booking year instead.
    const years = (kind: PeriodKind) =>
      fromName.period.includes(kind) ? [yearIn(row.file_name), yearIn(row.title)] : [yearIn(row.title), yearIn(row.file_name)]
    for (const kind of kinds) {
      if (extraordinary && kind === 'agm_minutes') continue
      const ends = periodFor(kind, years(kind), periods, row.date)
      if (ends) add(kind, ends)
    }
    if (extraordinary) {
      const ends = periodFor('other', [], periods, row.date)
      if (ends) add('other', ends)
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.voucher_id - b.voucher_id || a.kind.localeCompare(b.kind))
}
