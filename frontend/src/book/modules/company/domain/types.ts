/**
 * Company documents and deadlines (Yhtiö). Documents stay normal Kitsas vouchers: type 800
 * (Liitetieto) or the voucher they already sit on. Tilari keeps only links and inputs - never
 * computed figures - in its `TilariData` table (ADR-023, ADR-031), key `company`.
 */

export const COMPANY_KEY = 'company'
export const COMPANY_DOC_VERSION = 1

/** A period's documents, in the order the page lists them: the order a year's closing produces them, `other` last. */
export const PERIOD_KINDS = [
  'financial_statements',
  'balance_sheet_specs',
  'annual_report',
  'board_minutes',
  'audit_report',
  'tax_return_6b',
  'agm_minutes',
  'extra_agm_minutes',
  'prh_filing_receipt',
  'tax_decision',
  'dividend_annual_report',
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
  /** Keep the balance sheet specifications as a file here; Kitsas's archive holds them anyway. */
  balance_sheet_specs?: boolean
  /** Keep PRH's extract showing the statements as registered; PRH's register has them anyway. */
  prh_receipt?: boolean
}

/**
 * The kinds the owner chooses, each with its setting, in the order the page lists them. Ticked: listed
 * for every period and required. Unticked: not listed, unless a document is already linked to it.
 */
export const KIND_SETTINGS = {
  balance_sheet_specs: 'balance_sheet_specs',
  annual_report: 'annual_report',
  audit_report: 'audited',
  prh_filing_receipt: 'prh_receipt',
} as const satisfies Partial<Record<PeriodKind, keyof CompanySettings>>

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
  /** A calculation behind the slot's document, such as the tax return's: kept with it, does not fill the slot. */
  calculation?: true
  [extra: string]: unknown
}

export type NotNeeded = { period_ends: string; kind: string }

/** Who holds shares, for the dividend split and its withholding. */
export const SHAREHOLDER_KINDS = ['person', 'estate', 'company'] as const
export type ShareholderKind = (typeof SHAREHOLDER_KINDS)[number]

/** A share count from a day on: the latest on or before a day counts, 0 when all were sold. */
export type Shareholding = { from: string; shares: number }

/** A shareholder. The name stays in `Kumppani`; no personal ID numbers are kept. */
export type Shareholder = {
  /** Stable within the doc ("s3"). */
  key: string
  /** `Kumppani.id`. */
  partner_id: number
  kind: ShareholderKind
  /** Taxed in Finland: withholding by Vero's rule. Otherwise source tax, at `rate_bp`. */
  resident: boolean
  /** Withholding in basis points (750 = 7.5 %) when Vero's rule does not apply, such as under a tax treaty. */
  rate_bp?: number
  /** Oldest first. */
  holdings: Shareholding[]
  [extra: string]: unknown
}

/** A shareholder as a change sends it: a new name instead of `partner_id` creates the `Kumppani` row. */
export type ShareholderInput = Omit<Shareholder, 'key' | 'partner_id'> & { key?: string; partner_id?: number; partner_name?: string }

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
  shareholders?: Shareholder[]
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
    calculation?: boolean
  }[]
  /** `CompanyDocument.key`s to unlink; the vouchers stay. */
  remove?: string[]
  not_needed?: { period_ends: string; kind: string; value: boolean }[]
  /** Suggestion keys to reject. */
  dismissed?: string[]
  settings?: CompanySettings
  /** The whole list, replacing the stored one. */
  shareholders?: ShareholderInput[]
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
  /** A calculation kept with the slot's document: listed there, but does not fill the slot. */
  calculation: boolean
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
  /** Required but not expected yet: the period is running, a tax decision has not come, or an annual report is not due. */
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

export type DeadlineKey = 'statements_prepared' | 'agm' | 'tax_return' | 'prh_filing' | 'dividend_withholding' | 'dividend_report'
/** `unverified`: the date has passed, but no document is required, so Tilari cannot tell. */
export type DeadlineState = 'done' | 'not_needed' | 'overdue' | 'unverified' | 'upcoming' | 'later'

export type DeadlineView = {
  key: DeadlineKey
  /** The slot that answers it. None when the ledger does, as for withholding. */
  kind?: PeriodKind
  due: string
  state: DeadlineState
  /** Days from the as-of date to the due date; negative when past. */
  days: number
}

/** Kitsas's own statement PDF: `Liite` with `tosite = 0`, role `TP_{loppuu}`. */
export type KitsasStatement = { attachment_id: number; created: string | null }

/** A voucher shown as it is in the book. */
export type VoucherRef = {
  voucher_id: number
  date: string
  doc_number: number | null
  series: string
  title: string
  files: DocumentFile[]
}

export type DividendStepKey = 'decided' | 'booked' | 'paid' | 'withheld' | 'reported'
/** `no_minutes`, `difference`, `no_contract`, `overdue` and `missing` are problems. */
export type DividendStepState = 'done' | 'waiting' | 'overdue' | 'missing' | 'no_minutes' | 'difference' | 'no_contract' | 'not_applicable'
export type DividendStep = { key: DividendStepKey; state: DividendStepState; date: string | null }

export type DividendVoucher = VoucherRef & { role: 'decision' | 'payment' | 'remittance'; amount_snt: number }

/** The meeting that decided a dividend: the annual one, or an extraordinary one for an extra dividend. */
export type DividendMeeting = 'agm' | 'extra'

/** A recipient of a dividend, split from the shareholders kept (`domain/recipients.ts`). */
export type RecipientView = {
  key: string
  partner_id: number
  name: string
  kind: ShareholderKind
  shares: number
  gross_snt: number
  /** Null when a non-resident has no rate typed. */
  rate_bp: number | null
  over_limit_snt: number
  withholding_snt: number
  net_snt: number
}

/** Why a dividend has no recipients: none kept, none held shares on the decision day, a non-resident without a rate. */
export type SplitProblem = 'no_shareholders' | 'no_holders' | 'rate_missing'

/** A shareholder with its name from `Kumppani` and its shares on the as-of date. */
export type ShareholderView = Shareholder & { name: string; shares: number }

/** One dividend, read from the ledger on every load (`domain/dividends.ts`). */
export type DividendView = {
  decided_on: string
  meeting: DividendMeeting
  amount_snt: number
  paid_snt: number
  withheld_snt: number
  remitted_snt: number
  withholding_due: string | null
  /** Payment vouchers that left the dividend as a debt but hold no file, such as the contract. */
  no_contract: number[]
  steps: DividendStep[]
  /** Oldest first. */
  vouchers: DividendVoucher[]
  /** The whole amount split by the holdings on the decision day; empty with a `split_problem`. */
  recipients: RecipientView[]
  /** What is still unpaid, split the same way, for the payment draft. */
  open_recipients: RecipientView[]
  split_problem: SplitProblem | null
  /** Draft payments debiting Osingonjako that will pay this dividend once posted. */
  payment_drafts: VoucherRef[]
}

export type PeriodView = {
  starts: string
  ends: string
  locked: boolean
  /** The day someone pressed confirm in the statement (`vahvistettu`), not the AGM's date. */
  confirmed_at: string | null
  /** The period has ended on the as-of date. */
  ended: boolean
  docs: { done: number; required: number }
  /** Links that are not `ok`, and dividends whose figures differ or whose debt has no contract. */
  problems: number
  kitsas_statement: KitsasStatement | null
  deadlines: DeadlineView[]
  slots: SlotView[]
  /** Dividends from this period's profit, oldest first. */
  dividends: DividendView[]
  /** The period's income tax vouchers (type 9930). */
  income_tax: VoucherRef[]
  /** What the income tax booking left to pay or to get back, and what settled it (`domain/incomeTax.ts`). */
  tax_settlements: TaxSettlementView[]
  /** Draft decisions crediting Osingonjako that will count for this period once posted. */
  dividend_drafts: VoucherRef[]
  /** The newest ended period: a decision made now distributes its profit. */
  decide_here: boolean
  /** Posted type-800 vouchers dated in the year after the period's end, linked nowhere. */
  unlinked: DocCandidate[]
}

/** The tax left to pay (`pay`) or to get back (`refund`) after a period's closing, and the vouchers that settled it. */
export type TaxSettlementView = {
  direction: 'pay' | 'refund'
  booked_snt: number
  settled_snt: number
  /** Oldest first, each with the part it settled. */
  vouchers: (VoucherRef & { amount_snt: number })[]
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
  shareholders: ShareholderView[]
}

/** `applicable`: the book is a limited company's, so the menu item shows. */
export type CompanyAlerts = { applicable: boolean; deadlines: number }
