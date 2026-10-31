/**
 * Company documents and deadlines (Yhtiö). Documents stay normal Kitsas vouchers: type 800
 * (Liitetieto) or the voucher they already sit on. Tilari keeps only links and inputs - never
 * computed figures - in its `TilariData` table (ADR-023, ADR-031), key `company`.
 */

export const COMPANY_KEY = 'company'
export const COMPANY_DOC_VERSION = 1

/** A period's documents, in the order the page lists them. */
export const PERIOD_KINDS = [
  'financial_statements',
  'balance_sheet_specs',
  'annual_report',
  'audit_report',
  'agm_minutes',
  'board_minutes',
  'prh_filing_receipt',
  'tax_return_6b',
  'tax_decision',
  'other',
] as const
export type PeriodKind = (typeof PERIOD_KINDS)[number]

/** Documents of the company itself, not of a period. */
export const COMPANY_KINDS = ['articles', 'trade_register_extract', 'shareholder_register', 'shareholder_agreement', 'other'] as const
export type CompanyKind = (typeof COMPANY_KINDS)[number]

export type CompanySettings = {
  /** The company is audited: the audit report is required. */
  audited?: boolean
  /** The company writes an annual report (toimintakertomus): it is required. */
  annual_report?: boolean
}

/** A link to a voucher, or to one file of it. Kitsas stays the source of the document. */
export type CompanyDocument = {
  /** Stable within the doc ("d12"), for rows and removal. */
  key: string
  kind: string
  /** `Tilikausi.loppuu` of the period it belongs to (not its date); null = the company's. */
  period_ends: string | null
  /** `Tosite.id`. */
  voucher_id: number
  /** `Liite.id`, when only one file of the voucher is meant. */
  attachment_id?: number
  /** The document's own date, when the voucher's differs (a closed year cannot carry it). */
  doc_date?: string
  note?: string
  [extra: string]: unknown
}

export type NotNeeded = { period_ends: string; kind: string }

export type CompanyDoc = {
  v: number
  rev: number
  updated_at?: string
  settings?: CompanySettings
  documents: CompanyDocument[]
  /** The owner's word that a slot needs no document for that period. */
  not_needed?: NotNeeded[]
  /** Suggestions the owner rejected (`Suggestion.key`). */
  dismissed?: string[]
  [extra: string]: unknown
}

/** `POST /api/company/changes`: applied together in one write. */
export type CompanyChanges = {
  add?: {
    kind: string
    period_ends: string | null
    voucher_id: number
    attachment_id?: number | null
    doc_date?: string | null
    note?: string | null
  }[]
  /** `CompanyDocument.key`s to unlink; the vouchers stay. */
  remove?: string[]
  not_needed?: { period_ends: string; kind: string; value: boolean }[]
  /** Suggestion keys to reject. */
  dismissed?: string[]
  settings?: CompanySettings
}

/** `ok`; `missing` no voucher or a deleted one; `draft` does not fill a slot; `file_missing` the linked file is gone. */
export type LinkState = 'ok' | 'missing' | 'draft' | 'file_missing'

export type DocumentFile = { id: number; name: string; type: string }

export type DocumentView = {
  key: string
  kind: string
  period_ends: string | null
  voucher_id: number
  attachment_id: number | null
  /** `doc_date`, else the voucher's date. */
  date: string | null
  /** The voucher's date, for its number. */
  voucher_date: string | null
  title: string
  type: number | null
  doc_number: number | null
  series: string
  note: string | null
  state: LinkState
  /** The linked file, or the voucher's files. */
  files: DocumentFile[]
}

/** One file of a voucher, or a voucher without files, offered for a link. */
export type DocCandidate = {
  voucher_id: number
  /** To send in a link: null means the whole voucher (its only file, or no files). */
  attachment_id: number | null
  /** The file to open. */
  file_id: number | null
  file_name: string
  date: string
  title: string
  type: number
  doc_number: number | null
  series: string
  /** Already linked here. */
  linked: boolean
}

export type Suggestion = DocCandidate & {
  /** Stable across sessions: voucher, file and kind. */
  key: string
  kind: string
  period_ends: string | null
}

export type SlotStatus =
  /** Required and filled. */
  | 'complete'
  /** Required, the period has ended, nothing linked. */
  | 'missing'
  /** Required but not expected yet: the period is running, or a tax decision has not come. */
  | 'waiting'
  /** Not required and empty. */
  | 'optional'
  /** Not required and filled. */
  | 'filled'
  | 'not_needed'

export type SlotView = {
  kind: string
  required: boolean
  status: SlotStatus
  documents: DocumentView[]
  suggestions: Suggestion[]
}

export type DeadlineKey = 'statements_prepared' | 'agm' | 'tax_return' | 'prh_filing'
export type DeadlineState = 'done' | 'not_needed' | 'overdue' | 'upcoming' | 'later'

export type DeadlineView = {
  key: DeadlineKey
  /** The slot that answers it. */
  kind: PeriodKind
  due: string
  state: DeadlineState
  /** Days from the as-of date to the due date; negative when past. */
  days: number
}

/** Kitsas's own statement PDF: `Liite` with `tosite = 0`, role `TP_{loppuu}`. */
export type KitsasStatement = { attachment_id: number; created: string | null }

export type PeriodView = {
  starts: string
  ends: string
  locked: boolean
  /** The day someone pressed confirm in the statement (`vahvistettu`), not the AGM's date. */
  confirmed_at: string | null
  /** The period has ended on the as-of date. */
  ended: boolean
  docs: { done: number; required: number }
  /** Links that are not `ok`. */
  problems: number
  kitsas_statement: KitsasStatement | null
  deadlines: DeadlineView[]
  slots: SlotView[]
  /** Posted type-800 vouchers dated in the year after the period's end, linked nowhere. */
  unlinked: DocCandidate[]
}

export type CompanySlotView = { kind: string; documents: DocumentView[]; suggestions: Suggestion[] }

export type NextDeadline = DeadlineView & { period_ends: string }

export type CompanyOverview = {
  as_of: string
  read_only: boolean
  corrupt: boolean
  settings: CompanySettings
  /** `Asetus.TilitPaatetty`: vouchers cannot be dated on or before this day. */
  lock_date: string | null
  /** Newest first. */
  periods: PeriodView[]
  company_slots: CompanySlotView[]
  /** Links whose period no longer exists (its dates were changed). */
  orphans: DocumentView[]
  next_deadlines: NextDeadline[]
  suggestion_count: number
  /** Every linked document, for the search page. */
  documents: DocumentView[]
  /** Every posted type-800 voucher linked nowhere. */
  unlinked: DocCandidate[]
}

/** `applicable`: the book is a limited company's, so the menu item shows. */
export type CompanyAlerts = { applicable: boolean; deadlines: number }
