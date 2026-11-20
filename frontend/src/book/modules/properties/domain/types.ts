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
 * `no_document`: the owner says the increase has no notice, so none is asked for (ADR-030).
 */
export type LeaseRent = {
  from: string
  rent_snt: number
  water_snt?: number
  parking_snt?: number
  voucher_id?: number
  no_document?: true
}

/**
 * The contract's increase clause: `pct_bp` (percent) or `amount_snt` (euros) a year on the
 * anniversary `month`, or an index. Prefills the next increase and drives reminders; Tilari
 * never changes rent on its own (ADR-025).
 */
export type LeaseIncrease = { kind: LeaseIncreaseKind; pct_bp?: number; amount_snt?: number; month?: number }

/**
 * An agreed exception to the rent (poikkeava vuokra) from `from` to `to`: a discount, a free
 * month, a temporary rent. Its amounts stand for the steps' on those days; the steps stay as they
 * are. `note` is the owner's reason, `voucher_id` the agreement (a type-800 voucher);
 * `no_document` the owner's word that there is none to ask for (ADR-030).
 */
export type LeaseException = {
  from: string
  to: string
  rent_snt: number
  water_snt?: number
  parking_snt?: number
  note?: string
  voucher_id?: number
  no_document?: true
}

/**
 * The lease's water: an advance (vesimaksuennakko) settled against actual use, the default and
 * not stored, or a flat fee that is never settled.
 */
export const LEASE_WATER_KINDS = ['advance', 'flat'] as const
export type LeaseWaterKind = (typeof LEASE_WATER_KINDS)[number]

/**
 * The lease's rent deposit (vuokravakuus) as booked on a liability account: its items (tase-erät,
 * by root line id) and lines booked without an item (ADR-029).
 */
export type LeaseDeposit = { eraids?: number[]; line_ids?: number[] }

/**
 * A rental relationship (vuokrasuhde). The tenant is a Kitsas partner; `tenant_name` only when
 * they are not one yet. `ends` is a fixed term's end or the move-out. An object's leases never
 * share days (saving checks it). Unknown keys are kept.
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
  deposit?: LeaseDeposit
  /**
   * VAT is added to everything the lease's tenant pays (ADR-033): its amounts stay without VAT,
   * the general rate of each day applies. Only `true` is stored.
   */
  vat?: true
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
 * Settlements of an object never share days (saving checks it).
 */
export type WaterSettlement = {
  key: string
  from: string
  to: string
  difference_snt: number
  usage_snt?: number
  /**
   * The company's statement: a Liitetieto document, or its invoice, whose expense lines on the
   * object are then the settlement's company lines (ADR-025).
   */
  voucher_id?: number
  /** The owner's word that there is no statement to ask for (ADR-030). */
  no_document?: true
  shares?: WaterShare[]
  [key: string]: unknown
}

/** A housing-company loan's kind: annuiteetti, tasalyhennys, kiinteä tasaerä (the payment stays, the term moves). */
export const HOUSING_LOAN_TYPES = ['annuity', 'equal_principal', 'fixed_payment'] as const
export type HousingLoanType = (typeof HOUSING_LOAN_TYPES)[number]

/** The reference rate (viitekorko) a loan's interest follows; `fixed` is a fixed rate, typed in its rate rows. */
export const RATE_REFERENCES = ['euribor_12m', 'euribor_6m', 'euribor_3m', 'prime', 'fixed', 'other'] as const
export type RateReference = (typeof RATE_REFERENCES)[number]

/** What happened to a loan besides its payments: the share paid off (kertasuoritus), an extra payment, new terms, a note. */
export const LOAN_EVENT_KINDS = ['paid_off', 'extra_payment', 'terms', 'note'] as const
export type LoanEventKind = (typeof LOAN_EVENT_KINDS)[number]

/**
 * The reference rate from `from` on, as the company or its bank gave it. Rates are in 1/1000 %
 * (`*_pcm`, 1000 = 1 %): Euribor is quoted to three decimals and can be negative.
 */
export type LoanRate = { from: string; reference_pcm: number; voucher_id?: number }

/**
 * The object's share of the loan (velkaosuus) on `date`, as an isännöitsijäntodistus or the
 * purchase deed gives it: an anchor the share is followed from (ADR-034).
 */
export type LoanCertificate = { date: string; share_snt: number; voucher_id?: number; no_document?: true }

/**
 * The rahoitusvastike a month for this loan from `from` on, as the company's invoice or notice gives
 * it. `rahastoitu`: the company puts it into its equity rather than its income (tuloutettu, the
 * default), which matters for the shareholder's tax.
 */
export type LoanCharge = { from: string; amount_snt: number; rahastoitu?: true; voucher_id?: number; no_document?: true }

export type LoanEvent = { date: string; kind: LoanEventKind; amount_snt?: number; voucher_id?: number; note?: string }

/**
 * A housing-company loan (yhtiölaina) the object has a share of, entered by hand (ADR-034). The
 * loan is the object's own; a copy from another object of the same housing company keeps the
 * original's `group`, so later steps can treat them as one company loan.
 */
export type HousingLoan = {
  /** Stable within the document, for cards and warnings. */
  key: string
  group?: string
  /** What it is for: "Putkiremontti 2019". */
  name: string
  lender?: string
  starts: string
  /** The last due date in the loan's terms. */
  ends?: string
  type: HousingLoanType
  /** The company's whole loan, for information. */
  total_snt?: number
  reference: RateReference
  margin_pcm: number
  /** How often the reference rate is reset (koronmuutosväli), in months. */
  reset_months?: number
  /** The actual reference rate, oldest first, entered by hand. */
  rates?: LoanRate[]
  /** Periods with no repayment (lyhennysvapaa), oldest first. */
  grace?: { from: string; to: string }[]
  certificates?: LoanCertificate[]
  charges?: LoanCharge[]
  events?: LoanEvent[]
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
  /**
   * The first day the owner's rent counts, when agreed otherwise than the default (ADR-026): e.g.
   * a purchase that gave the buyer the month's rent. Missing: the first whole month owned.
   */
  rent_from?: string
  /**
   * The last day the owner's rent counts, when agreed otherwise than the default (ADR-026): e.g.
   * a sale that gave the buyer the month's rent. Missing: to the end of the month of the sale.
   */
  rent_until?: string
  water_settlements?: WaterSettlement[]
  /** The housing company's loans the object has a share of (ADR-034). */
  housing_loans?: HousingLoan[]
  /** The housing company's documents on the Taloyhtiö tab (certificates, meeting minutes, notices). */
  housing_doc_voucher_ids?: number[]
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

/** A missing document the owner may say there is none of (ADR-030); never the lease's contract. */
export type DocumentSkip =
  | { kind: 'increase_notice'; lease_key: string; from: string }
  | { kind: 'exception_agreement'; lease_key: string; from: string }
  | { kind: 'water_statement'; key: string }
  | { kind: 'loan_certificate'; loan_key: string; date: string }
  | { kind: 'loan_charge'; loan_key: string; from: string }

/**
 * `skip`: a missing document's reminder the owner can end by saying there is none. `lease_key`: the
 * lease a dated reminder is about, whose card the edit page opens.
 */
export type Warning = { code: string; params?: Record<string, string | number>; skip?: DocumentSkip; lease_key?: string }

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
  /**
   * The object's share of its housing-company loans at the as-of month's end (ADR-034); null without
   * loans, once sold, or when a loan's share is not known then.
   */
  housing_share_snt: number | null
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
  /** The rahoitusvastike paid in the year split by the loans' paths (ADR-034): only on an object with loans. */
  housing_interest_snt?: number
  housing_principal_snt?: number
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
  /** When agreed exceptions fall in the month: what the steps alone would expect, and the exceptions as stored. */
  exception?: { normal_snt: number; agreed: LeaseException[] }
  /** Water settlement shares due in the month: + the tenant pays, - refunded. */
  water_snt: number
  /** A VAT lease (ADR-033): the VAT expected on the month's rent and water, and the VAT of its payments. */
  vat_snt?: number
  received_vat_snt?: number
  /** What was paid; with VAT for a VAT lease. */
  received_snt: number
  /** At the month's end: + the tenant owes, - paid ahead. */
  balance_snt: number
  lines: BookedLine[]
  /** When the month moved the balance: an exception that would make it expect what was paid, for the owner to confirm. */
  exception_prefill?: LeaseException
}

/** A lease's own rent account (ADR-026): a new tenant starts at zero, an ended lease keeps what it left. */
export type LeaseRentAccount = {
  lease_key: string
  /** The first day that counts: the lease's start, or a later acquisition (or the books' start). */
  counted_from: string
  /** The last day that counts: the lease's end, the owner's last day of rent (a sale), or the as-of date. */
  counted_until: string
  months: RentMonth[]
  /** With VAT for a VAT lease (ADR-033), like the balance. */
  expected_snt: number
  received_snt: number
  /** On the as-of date: + the tenant owes, - paid ahead. */
  balance_snt: number
  /** A VAT lease: its account counts with VAT; the VAT within the expected and received totals. */
  vat?: true
  expected_vat_snt?: number
  received_vat_snt?: number
  /** Rent lines whose VAT does not fit the lease (ADR-033). */
  vat_issues?: VatIssue[]
}

/**
 * A rent line's VAT against its lease (ADR-033): booked without VAT on a VAT lease (`missing`),
 * with VAT on a lease without (`unexpected`), at another rate than the general one of its day
 * (`rate`), or netto-coded without its VAT row (`row_missing`).
 */
export type VatIssueKind = 'missing' | 'unexpected' | 'rate' | 'row_missing'

export type VatIssue = { line_id: number; date: string; kind: VatIssueKind; pct: number }

/** Why the owner's rent counts from a day: their own date, the purchase, rent received before it, or the books' start. */
export type RentStartSource = 'own' | 'purchase' | 'payment' | 'books'

export type RentStart = { from: string; source: RentStartSource }

/** Why the owner's rent counts until a day: their own date, or the end of the month of the sale. */
export type RentEndSource = 'own' | 'sale'

export type RentEnd = { until: string; source: RentEndSource }

/** The owner's rent days on the object: from `start`, until `end` (none while held). */
export type RentPeriod = { start: RentStart; end: RentEnd | null }

export type RentAccount = {
  leases: LeaseRentAccount[]
  /** Income on the object that no lease takes (before the first lease, a non-tenant's advance). */
  unassigned: BookedLine[]
}

export type LeaseState = 'upcoming' | 'current' | 'ended'

/** A voucher's own file, to open from the page; Kitsas's system attachments are not listed. */
export type VoucherFile = { id: number; name: string }

/** A voucher a lease links to, as the object page shows it. */
export type LeaseVoucher = { voucher_id: number; date: string; doc_number: number | null; series: string | null; title: string; files: VoucherFile[] }

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
  /** A VAT lease (ADR-033): the general rate on the as-of date and the VAT on `rent`. */
  vat?: { pct: number; snt: number }
  /** The latest water settlement with a share for this lease (object page only). */
  water_latest?: { from: string; to: string; balance_snt: number; settled_snt: number; status: WaterShareStatus } | null
  /** The deposit's movements and balance on the as-of date (object page, stored leases with a deposit). */
  deposit?: DepositView | null
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
  /** A VAT lease's payment (ADR-033): the VAT within `amount_snt`. */
  vat_snt?: number
  /** What is wrong with the line's VAT for its lease. */
  vat_issue?: VatIssueKind
}

/** A deposit's booked line: received (credit) or returned (debit). */
export type DepositMovement = BookedLine & {
  kind: 'received' | 'returned'
  /** On a return: income or cost booked in the same payment (+ kept from the deposit, - paid on top). */
  deducted_snt: number
  deductions: BookedLine[]
}

/** A lease's deposit up to the as-of date, exact (ADR-029). */
export type DepositView = {
  received_snt: number
  returned_snt: number
  /** Kept from the returns: rent, water or costs booked in the same payments. */
  deducted_snt: number
  /** On the as-of date: + still held, - more returned than received. */
  balance_snt: number
  movements: DepositMovement[]
  /** Linked items or lines the book no longer has. */
  missing: number
}

/** A deposit the edit page offers: an item on a liability account, or a line booked without one. */
export type DepositCandidate = {
  kind: 'item' | 'line'
  /** The item's root line id, or the line's id. */
  id: number
  account: number
  account_name: string
  date: string
  voucher_id: number
  text: string
  partner_id: number | null
  partner: string | null
  /** The root line's or the line's own amount: + received, - returned. */
  amount_snt: number
  /** On the as-of date: the item's balance, or the line's amount. */
  balance_snt: number
  /** The item's bookings up to the as-of date, oldest first (the line itself for a loose line): + received, - returned. */
  movements: { line_id: number; date: string; amount_snt: number; voucher_id: number }[]
  /** The lease it belongs to, on this object or another. */
  linked_to: { object_id: number; lease_key: string } | null
  /** Booked on this object: its cost centre, a rent payer or tenant of it, or its name in the text. */
  related: boolean
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
  /** The owner's word that there is no statement (ADR-030). */
  no_document: boolean
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

/** A booked line about a water settlement, with what the edit form needs to share it out again. */
export type WaterBookedLine = BookedLine & {
  income: boolean
  partner_id: number | null
  /** On a settlement's statement voucher: the company's line, though its text may not say so. */
  statement?: true
}

/** A voucher with the object's expense lines that may be a settlement's statement (a housing company's invoice). */
export type WaterStatementCandidate = {
  voucher: LeaseVoucher
  /** Its expense lines on the object: the company's lines of the settlement that links it. */
  lines: WaterBookedLine[]
  /**
   * A payment to the housing company that is not its vastike: with the apartment's reference, or
   * (without one) an amount never repeated. Null for other vouchers.
   */
  suspect: 'reference' | 'amount' | null
}

export type WaterDetail = {
  /** Newest period first. */
  settlements: WaterSettlementView[]
  suggestions: WaterSuggestionView[]
  /** Every water settlement line on the object by its text, oldest first: the edit form gives them to its settlements. */
  lines: WaterBookedLine[]
  /** Vouchers with files (and the stored statements) whose expense lines are on the object, newest first. */
  statement_candidates: WaterStatementCandidate[]
}

export type PortfolioResponse = {
  as_of: string
  data_through: string | null
  settings: PortfolioSettings
  /** Fiscal years up to the as-of date, oldest first. */
  periods: { starts: string; ends: string }[]
  rows: PropertyRow[]
  chart: PortfolioChart
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
    /** The held objects' housing-company loan shares where known; null when none has a loan. */
    housing_share_snt: number | null
  }
}

/**
 * The Properties page's two line charts, month by month over every object's months: each object's
 * cash flow summed from its first month and its money still to recover (null outside its months,
 * and always on an object with no investment linked), and both together. The cash flow total keeps a sold object's sum; the unrecovered total leaves a
 * sold object out from its sale month, so it ends at `totals.unrecovered_snt`.
 */
export type PortfolioChart = {
  keys: string[]
  objects: { id: number; cash_snt: (number | null)[]; unrecovered_snt: (number | null)[]; share_snt: (number | null)[] }[]
  total_cash_snt: number[]
  total_unrecovered_snt: number[]
  /**
   * The objects the unrecovered total counts (linked to an investment, until their sale): the capital
   * put in so far (refunds lower it), and what has come back - cash flow and sale proceeds. Their
   * difference is the unrecovered total.
   */
  total_invested_snt: number[]
  total_back_snt: number[]
  /** The housing-company loan shares (ADR-034), each object's where known; null where none is. */
  total_share_snt: (number | null)[]
}

/** The header's count of warnings to act on (ADR-030). */
export type PortfolioAlerts = { warnings: number; objects: number }

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
  /** The first day the owner's rent counts on the object, and why. */
  rent_start: RentStart
  /** Where it would count from without the owner's own date (`rent_from`), for the edit page. */
  rent_start_default: RentStart
  /** The last day the owner's rent counts, and why; null while the object is held. */
  rent_end: RentEnd | null
  /** Where it would end without the owner's own date (`rent_until`). */
  rent_end_default: RentEnd | null
  /** Deposits to link to the leases: the object's first, then every other on a deposit account. */
  deposit_candidates: DepositCandidate[]
  housing: HousingDetail
}

/** Another object's loan to copy from (ADR-034); `same_company` when both pay the same housing company. */
export type HousingCopySource = { object_id: number; object_name: string; same_company: boolean; loan: HousingLoan }

/**
 * One month of a loan's share as Tilari follows it (ADR-034), computed every time: what the payments
 * to the housing company paid for the loan, the interest on the share, and the share after them.
 */
export type LoanMonth = {
  /** YYYY-MM. */
  month: string
  opening_snt: number
  /** The rahoitusvastike in force: what one month's payment pays for this loan. */
  due_snt: number
  /** Payments to the housing company booked in the month, as whole payments (`housingPayments`). */
  payments: number
  /** The rahoitusvastike paid: `due` for each payment (each due month when payments are not known). */
  paid_snt: number
  /** Reference rate + margin in force (1/1000 %). */
  rate_pcm: number
  /** Interest on the share; between two certificates, fitted so the path meets the later one. */
  interest_snt: number
  /** What the payments left for the share: paid less interest. */
  principal_snt: number
  /** Extra repayments of the month (events). */
  extra_snt: number
  closing_snt: number
  /** Computed backwards from the first certificate. */
  backward?: true
  /** An estimate after the path (`loanForecast`): the month has not come yet. */
  forecast?: true
  /**
   * A certificate (its share at the month's end): with an earlier one, how far the computed path was
   * from it (computed less certified, to the cent) and the rate the fitted months imply.
   */
  certificate?: { date: string; share_snt: number; voucher_id?: number; gap_snt: number | null; implied_pcm: number | null }
}

/** A loan's share month by month (`loanPath`), and what the payments leave missing. */
export type LoanPath = {
  loan_key: string
  /** Oldest first; empty without a certificate to start from. */
  months: LoanMonth[]
  /** Payments to the housing company were found in the book; without them each due month counts as paid. */
  payments_known: boolean
  /** Due months with no payment by the as-of date that later payments did not make up for: how many, from which month. */
  missing: { count: number; from: string } | null
}

/** What the Taloyhtiö tab shows besides the stored loans. */
export type HousingDetail = {
  /** The tab's documents and every voucher a loan links, posted ones only; a missing id was deleted. */
  vouchers: LeaseVoucher[]
  /** Other objects' loans, those paying the same housing company first. */
  copy_sources: HousingCopySource[]
  /** Each stored loan's share month by month, in the loans' order. */
  paths: LoanPath[]
  /** The object's payments to its housing company by month (YYYY-MM), newest first. */
  payments: { month: string; units: number; lines: BookedLine[] }[]
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
  series: string | null
  attachments: number
  /** Its own files, to open from a form. */
  files: VoucherFile[]
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
