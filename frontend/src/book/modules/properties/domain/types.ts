/**
 * Rental objects (vuokrakohteet). A rental object is a Kitsas cost centre (Kohdennus tyyppi 1).
 * Tilari keeps links and inputs - never computed figures - in its own `TilariData` table
 * (ADR-023): `property/{kohdennusId}` and `portfolio`. Money in integer cents (`*_snt`),
 * percentages in basis points (`*_bp`, 100 bp = 1 %).
 */

export const PROPERTY_KEY_PREFIX = 'property/'
export const PORTFOLIO_KEY = 'portfolio'
export const PROPERTY_DOC_VERSION = 1

export const PROPERTY_KINDS = ['apartment', 'parking', 'garage', 'commercial', 'storage', 'other'] as const
export type PropertyKind = (typeof PROPERTY_KINDS)[number]

/** Selling costs: broker fee etc. `pct_bp` of the price plus a fixed amount. */
export type SaleCosts = { pct_bp: number; fixed_snt: number }

/** A balance-sheet item (tase-erä) holding the acquisition cost: root `Vienti.id` = `eraid`. */
export type EraLink = { eraid: number; account: number }

/** Capital put in outside linked era items (+ = invested), e.g. a non-itemized opening balance. */
export type CapitalEntry = { date: string; amount_snt: number; note?: string }

/** Owner's estimate of the selling price (myyntihinta, without the housing-company loan share). */
export type Valuation = {
  date: string
  price_snt: number
  debt_free_price_snt?: number
  source?: string
}

export type Financing = { loan_accounts: number[]; interest_accounts: number[] }

export type PropertyDoc = {
  v: number
  rev: number
  updated_at?: string
  /** Cost centre is not a rental object (kept so setup does not ask again). */
  excluded?: boolean
  kind?: PropertyKind
  eras: EraLink[]
  manual_capital?: CapitalEntry[]
  /** Extra vouchers whose lines on this object belong to the sale (e.g. broker invoice). */
  sale_voucher_ids?: number[]
  /** Linked document vouchers (usually type 800 Liitetieto). */
  doc_voucher_ids?: number[]
  financing?: Financing
  valuations?: Valuation[]
  sale_costs?: SaleCosts
  target_return_bp?: number
  note?: string
  [key: string]: unknown
}

export type PortfolioSettings = {
  v: number
  rev: number
  sale_costs?: SaleCosts
  target_return_bp?: number
  /** Dismissed setup suggestions: `era:{eraid}` or `doc:{voucherId}:{costCentreId}`. */
  dismissed?: string[]
  [key: string]: unknown
}

export type PropertyStatus = 'active' | 'partly_sold' | 'sold' | 'unlinked' | 'excluded'

export type Warning = { code: string; params?: Record<string, string | number> }

export type OperatingTotals = { income_snt: number; expense_snt: number; net_snt: number }

export type ObjectSummary = {
  status: PropertyStatus
  acquired_on: string | null
  sold_on: string | null
  /** Capital put in: era movements outside sales + manual capital. */
  invested_snt: number
  /** Book value B: linked era items' balance at the as-of date. */
  book_value_snt: number
  operating: OperatingTotals
  interest_snt: number | null
  proceeds_snt: number
  /** Gross selling price of sales so far; sale costs = price - proceeds. */
  sale_price_snt: number
  /** Book value of what was sold (the items' credits on sale vouchers). */
  disposed_cost_snt: number
  /** Money not yet recovered: -(capital + operating + interest + proceeds flows). */
  unrecovered_snt: number
}

export type Trailing12 = {
  from: string
  to: string
  months: number
  annualized: boolean
  income_snt: number
  expense_snt: number
  net_snt: number
  gross_yield_bp: number | null
  net_yield_bp: number | null
}

export type MonthPoint = {
  key: string
  income_snt: number
  expense_snt: number
  net_snt: number
  interest_snt: number
  capex_snt: number
  proceeds_snt: number
  /** Unrecovered money at the end of the month. */
  unrecovered_snt: number
}

export type YearRow = {
  starts: string
  ends: string
  income_snt: number
  expense_snt: number
  net_snt: number
  interest_snt: number
  capex_snt: number
  proceeds_snt: number
  /** Every posted P&L line of the cost centre in the year, as Kitsas reports it. */
  kitsas_result_snt: number
}

export type Disposal = {
  voucher_id: number
  date: string
  /** Gross selling price: the sale's income lines. */
  price_snt: number
  /** Cash from the sale: price minus sale costs. */
  proceeds_snt: number
  eras: { eraid: number; credit_snt: number }[]
}

export type EraMovementKind = 'acquisition' | 'addition' | 'return' | 'sale' | 'depreciation'

export type EraState = EraLink & {
  date: string | null
  voucher_id: number | null
  description: string
  balance_snt: number
  missing: boolean
  /** Every booked change of the item, oldest first. */
  movements: {
    date: string
    voucher_id: number
    description: string
    amount_snt: number
    kind: EraMovementKind
  }[]
}

/** Cash flow of one fiscal year: operating net and interest (if financing is linked). */
export type YearCashFlow = { starts: string; ends: string; net_snt: number; interest_snt: number }

export type BreakEven = {
  price_snt: number
  unrecovered_snt: number
  sale_costs: SaleCosts
  costs_set: boolean
  already_recovered: boolean
}

export type Returns = {
  /** IRR with the latest valuation (net of sale costs) as the sale. */
  market_bp: number | null
  /** IRR if sold now at book value (net of sale costs). */
  at_cost_bp: number | null
  /** IRR of a sold object (actual flows only). */
  actual_bp: number | null
  multiple_roots: boolean
}

export type PropertyRow = {
  id: number
  name: string
  starts: string | null
  ends: string | null
  configured: boolean
  kind: PropertyKind | null
  status: PropertyStatus
  summary: ObjectSummary
  t12m: Trailing12 | null
  returns: Returns
  break_even: BreakEven | null
  valuation: Valuation | null
  /** Operating cash flow per fiscal year with activity. */
  cash_years: YearCashFlow[]
  warnings: Warning[]
}

export type PortfolioResponse = {
  as_of: string
  data_through: string | null
  settings: PortfolioSettings
  /** Fiscal years up to the as-of date, oldest first. */
  periods: { starts: string; ends: string }[]
  rows: PropertyRow[]
  /** Cost centres with no stored decision yet. */
  undecided: number
  totals: {
    invested_snt: number
    book_value_snt: number
    operating_net_snt: number
    t12m_net_snt: number
    unrecovered_snt: number
    net_yield_bp: number | null
    irr_bp: number | null
    /** IRR of the objects still held, each sold now at its estimate or book value. */
    held_irr_bp: number | null
    /** IRR of the sold objects together (actual flows). */
    sold_irr_bp: number | null
  }
}

export type PropertyDetail = PropertyRow & {
  child_ids: number[]
  doc: PropertyDoc
  read_only: boolean
  as_of: string
  data_through: string | null
  eras: EraState[]
  disposals: Disposal[]
  months: MonthPoint[]
  years: YearRow[]
  target: { rate_bp: number; price_snt: number } | null
  financing: Financing | null
}

export type DocumentGroupKind = 'linked' | 'acquisition' | 'other' | 'bank'

export type DocumentVoucher = {
  voucher_id: number
  date: string
  type: number
  doc_number: number | null
  series: string
  title: string
  missing: boolean
  attachments: { id: number; name: string; type: string }[]
}

export type PropertyDocuments = {
  groups: { kind: DocumentGroupKind; vouchers: DocumentVoucher[] }[]
  bank_hidden: number
}

export type SuggestionSource = 'sale' | 'era_allocation' | 'voucher_allocation' | 'text'

export type EraCandidate = {
  eraid: number
  account: number
  account_name: string
  date: string
  voucher_id: number
  description: string
  balance_snt: number
  linked_to: number | null
  suggestion: { cost_centre_id: number | null; source: SuggestionSource; candidates: number[] } | null
}

export type DocCandidate = {
  voucher_id: number
  date: string
  title: string
  doc_number: number | null
  attachments: number
  linked_to: number[]
  suggestion: { cost_centre_id: number | null; candidates: number[] } | null
}

export type SetupResponse = {
  cost_centres: {
    id: number
    name: string
    starts: string | null
    ends: string | null
    configured: boolean
    excluded: boolean
    kind: PropertyKind | null
    /** Kind guessed from the name (unit designators AP/AH/AK, LH; words). */
    suggested_kind: PropertyKind
    eras: number[]
    docs: number[]
  }[]
  eras: EraCandidate[]
  docs: DocCandidate[]
  dismissed: string[]
}

export type SetupApplyInput = {
  objects: {
    id: number
    excluded?: boolean
    kind?: PropertyKind | null
    add_eras?: number[]
    remove_eras?: number[]
    add_docs?: number[]
    remove_docs?: number[]
  }[]
  dismiss?: string[]
}
