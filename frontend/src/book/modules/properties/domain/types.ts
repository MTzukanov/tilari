/**
 * Rental objects (vuokrakohteet). A rental object is a Kitsas cost centre (Kohdennus tyyppi 1).
 * Tilari keeps links and inputs - never computed figures - in its own `TilariData` table
 * (ADR-023): `property/{kohdennusId}` and `portfolio`. Money in integer cents (`*_snt`),
 * percentages in basis points (`*_bp`, 100 bp = 1 %).
 */

import type { BrowseEntry } from '../../../types'

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

export const LEASE_INCREASE_KINDS = ['none', 'percent', 'amount', 'index'] as const
export type LeaseIncreaseKind = (typeof LEASE_INCREASE_KINDS)[number]

/**
 * What the tenant pays a month from `from` on: rent, water and a parking space. The first is the
 * lease's starting rent; each later one is an increase (korotus), with its notice voucher.
 */
export type LeaseRent = { from: string; rent_snt: number; water_snt?: number; parking_snt?: number; voucher_id?: number }

/**
 * The contract's increase clause: `pct_bp` (percent) or `amount_snt` (euros) a year on the
 * anniversary `month`, or an index. Prefills the next increase and drives reminders; Tilari
 * never changes rent on its own (ADR-025).
 */
export type LeaseIncrease = { kind: LeaseIncreaseKind; pct_bp?: number; amount_snt?: number; month?: number }

/**
 * An agreed exception to the rent (poikkeava vuokra) from `from` to `to`: a discount, a free
 * month, a temporary rent. Its amounts stand for the steps' on those days; the steps stay as they
 * are. `note` is the owner's reason, `voucher_id` the agreement (a type-800 voucher).
 */
export type LeaseException = {
  from: string
  to: string
  rent_snt: number
  water_snt?: number
  parking_snt?: number
  note?: string
  voucher_id?: number
}

/**
 * The lease's water: an advance (vesimaksuennakko) settled against actual use, the default and
 * not stored, or a flat fee that is never settled.
 */
export const LEASE_WATER_KINDS = ['advance', 'flat'] as const
export type LeaseWaterKind = (typeof LEASE_WATER_KINDS)[number]

/**
 * A rental relationship (vuokrasuhde). The tenant is a Kitsas partner; `tenant_name` only when
 * they are not one yet. `ends` is a fixed term's end or the move-out. Unknown keys are kept.
 */
export type Lease = {
  /** Stable within the document, for form rows and warnings. */
  key: string
  tenant_partner_id?: number
  tenant_name?: string
  starts: string
  ends?: string
  /** Day of the month the rent is due. */
  due_day?: number
  /** The starting rent, then each increase, oldest first. */
  rents: LeaseRent[]
  /** Agreed exceptions to the rent, oldest first, never overlapping. */
  exceptions?: LeaseException[]
  increase?: LeaseIncrease
  /** The contract (a type-800 voucher). */
  doc_voucher_id?: number
  /** Only `flat` is stored; missing means an advance. */
  water?: LeaseWaterKind
  [key: string]: unknown
}

/**
 * A tenant's part of a water settlement, stored only when it carries something: the owner's own
 * amount instead of the computed one (+ the tenant pays, - refunded), or the letter sent.
 */
export type WaterShare = { lease_key: string; balance_snt?: number; voucher_id?: number; [key: string]: unknown }

/**
 * The housing company's water settlement (vesitasaus) for one period, as on its statement:
 * `difference_snt` + when the owner pays more, - for a refund; `usage_snt` the apartment's
 * actual water cost, when known. Each tenant's share is computed from the leases (ADR-025).
 */
export type WaterSettlement = {
  key: string
  from: string
  to: string
  difference_snt: number
  usage_snt?: number
  /** The company's statement (a type-800 voucher). */
  voucher_id?: number
  shares?: WaterShare[]
  [key: string]: unknown
}

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
  /** Document vouchers Tilari created from this object's forms (uploads, increase notices): deletable from there. */
  created_voucher_ids?: number[]
  financing?: Financing
  valuations?: Valuation[]
  sale_costs?: SaleCosts
  target_return_bp?: number
  note?: string
  leases?: Lease[]
  water_settlements?: WaterSettlement[]
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
  /** The sale voucher's Kitsas number, series and title: filled for the object page, empty in the figures. */
  doc_number: number | null
  series: string | null
  title: string
  /** Gross selling price: the sale's income lines. */
  price_snt: number
  /** Cash from the sale: price minus sale costs. */
  proceeds_snt: number
  eras: { eraid: number; credit_snt: number }[]
  /** Other vouchers whose lines counted as this sale's costs: listed, or the same cost account near it. */
  cost_vouchers: SaleCostVoucher[]
}

export type SaleCostVoucher = {
  voucher_id: number
  date: string
  /** What its lines added to the sale costs (a refund is negative). */
  amount_snt: number
  /** Kitsas number, series and title: filled for the object page, empty in the figures. */
  doc_number: number | null
  series: string | null
  title: string
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
  /** The lease running on the as-of date (the latest started when several run); a suggested one when none is stored. */
  lease: LeaseView | null
  /** Rent balances from the stored leases; null without any. */
  rent: RentBalance | null
  warnings: Warning[]
}

/** The rent balances on the as-of date, exact: + the tenant owes (vuokrarästi), - paid ahead. */
export type RentBalance = {
  /** The running lease's own balance; null when none runs. */
  current_snt: number | null
  /** What the other leases (mostly ended ones) left, together. */
  others_snt: number
}

/** One month of a lease's rent account, exact to the cent. */
export type RentMonth = {
  key: string
  /** Rent, water advance and parking for the lease's days in the month, agreed exceptions included. */
  rent_snt: number
  /** When an agreed exception falls in the month: what the steps alone would expect, and its reasons. */
  exception?: { normal_snt: number; notes: string[] }
  /** Water settlement shares due in the month: + the tenant pays, - refunded. */
  water_snt: number
  received_snt: number
  /** At the month's end: + the tenant owes, - paid ahead. */
  balance_snt: number
  lines: BookedLine[]
}

/** A lease's own rent account (ADR-026): a new tenant starts at zero, an ended lease keeps what it left. */
export type LeaseRentAccount = {
  lease_key: string
  /** The first day that counts: the lease's start, or a later acquisition (or the books' start). */
  counted_from: string
  months: RentMonth[]
  expected_snt: number
  received_snt: number
  /** On the as-of date: + the tenant owes, - paid ahead. */
  balance_snt: number
}

export type RentAccount = {
  leases: LeaseRentAccount[]
  /** Income on the object that no lease takes (before the first lease, a non-tenant's advance). */
  unassigned: BookedLine[]
}

export type LeaseState = 'upcoming' | 'current' | 'ended'

/** A voucher a lease links to, as the object page shows it. */
export type LeaseVoucher = { voucher_id: number; date: string; doc_number: number | null; series: string | null; title: string }

/** A lease as the object page shows it, on the as-of date. */
export type LeaseView = {
  key: string
  /** The partner's name, or the stored `tenant_name`. */
  tenant: string | null
  tenant_partner_id: number | null
  starts: string
  ends: string | null
  state: LeaseState
  /** The step in effect (the first for an upcoming lease, the last for an ended one). */
  rent: LeaseRent | null
  /** The tenant's postal address from the partner, for letters. */
  tenant_address: string[]
  due_day: number | null
  increase: LeaseIncrease | null
  contract: LeaseVoucher | null
  steps: (LeaseRent & { voucher: LeaseVoucher | null })[]
  /** Agreed exceptions, oldest first; `normal_snt` is the step's total on the exception's first day. */
  exceptions: (LeaseException & { voucher: LeaseVoucher | null; normal_snt: number })[]
  water: LeaseWaterKind
  /** The latest water settlement with a share for this lease (object page only). */
  water_latest?: { from: string; to: string; balance_snt: number; settled_snt: number; status: WaterShareStatus } | null
  /** Suggested from the book (not stored): from a contract document, or from payments alone. */
  suggested?: 'contract' | 'payments'
  /** A suggestion's rent payments: the lines its rent was read from (object page only). */
  sources?: BookedLine[]
}

/** A lease the book suggests: the lease to add on the edit page, and how the page shows it. */
export type LeaseSuggestionView = { lease: Lease; view: LeaseView }

/** A booked line a figure is read from, to open from the page. */
export type BookedLine = {
  line_id: number
  date: string
  /** The part that counts: for a water settlement the whole line, or what a rent payment had on top of the rent. */
  amount_snt: number
  /** credit - debit of the whole line. */
  line_snt: number
  text: string
  /** The line's partner (the payer), when it has one. */
  partner: string | null
  voucher: LeaseVoucher
}

/** `none`: nothing to settle; `partial`: some booked, not all; `over`: more booked than the balance, or the other way. */
export type WaterShareStatus = 'none' | 'open' | 'partial' | 'settled' | 'over'

export type WaterShareView = {
  lease_key: string
  tenant: string | null
  tenant_partner_id: number | null
  /** The lease's part of the period. */
  from: string
  to: string
  days: number
  /** Water advances the lease agreed for those days. */
  advance_snt: number
  /** Share of the actual use; null when the company's difference is passed on by days. */
  usage_snt: number | null
  /** What the lease's figures give: + the tenant pays, - refunded. */
  computed_snt: number
  /** The owner's own amount when set, else `computed_snt`. */
  balance_snt: number
  own: boolean
  letter: LeaseVoucher | null
  movements: BookedLine[]
  /** What the movements settled so far (equal to the balance when settled). */
  settled_snt: number
  status: WaterShareStatus
}

export type WaterSettlementView = {
  key: string
  from: string
  to: string
  days: number
  difference_snt: number
  usage_snt: number | null
  /** The company's advances for the period: use less difference, when the use is known. */
  advance_snt: number | null
  statement: LeaseVoucher | null
  /** The company's settlement as booked on the object (vastike account). */
  booked: BookedLine[]
  shares: WaterShareView[]
  /** What the owner keeps (+) or bears (-): the tenants' balances less the company's difference. */
  owner_snt: number
  /** Tenants' lines with no share to go to (no lease with water advances in the period). */
  other: BookedLine[]
}

/**
 * A settlement the book suggests from booked lines: from the company's line, or the tenant's
 * alone; `lines` are every line it was read from.
 */
export type WaterSuggestionView = { settlement: WaterSettlement; view: WaterSettlementView; source: 'company' | 'tenant'; lines: BookedLine[] }

export type WaterDetail = {
  /** Newest period first. */
  settlements: WaterSettlementView[]
  suggestions: WaterSuggestionView[]
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
  /** The lines behind each month's bars, oldest first. */
  month_lines: MonthLine[]
  years: YearRow[]
  target: { rate_bp: number; price_snt: number } | null
  financing: Financing | null
  /** Every stored lease, newest start first. */
  leases: LeaseView[]
  /** Leases the book suggests that no stored lease stands for yet, newest start first. */
  lease_suggestions: LeaseSuggestionView[]
  water: WaterDetail
  /** Each stored lease's rent account; null without stored leases. */
  rent_account: RentAccount | null
}

export type MonthLineKind = 'income' | 'expense' | 'interest'

/** One ledger line behind a month's bars: rent and other income, an expense, or loan interest. */
export type MonthLine = {
  /** Month it counts in (YYYY-MM). */
  month: string
  kind: MonthLineKind
  /** Booked date, or for a correction the date of the booking it corrects. */
  counted_date: string
  /** credit - debit without VAT, as the bars add it up. */
  amount_snt: number
  /** The account it counts on, when a correction voucher's notes say it belongs there (ADR-024). */
  counted_account?: { account: number; name: string }
  /** The line as Selaa shows it. */
  entry: BrowseEntry
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
  /** The first attachment, to open the document from a form. */
  first_attachment: number | null
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
