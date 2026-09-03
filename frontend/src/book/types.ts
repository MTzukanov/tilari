/**
 * Shared ledger DTOs. Domain modules own these; the UI façade (`api.ts`) re-exports.
 */

import type { PaymentMethod } from './paymentMethods'

export type { PaymentMethod }

export type SettingsResponse = {
  company: Record<string, string>
  periods: { starts: string; ends: string }[]
  lock_date: string | null
  payment_methods: {
    expense: PaymentMethod[]
    income: PaymentMethod[]
  }
}

export type Period = {
  starts: string
  ends: string
}

export type Meta = {
  name: string
  business_id: string
  practice: boolean
  /** Book "today": simulated date when practice is on, else wall calendar. */
  book_date: string
  schema_version: string
  kitsas_version: string
  lock_date?: string | null
  db_path: string
  source_name: string
  session_id: string
  periods: Period[]
}

export type Health = {
  ok: boolean
  opened: boolean
  session_id: string
  db_path: string | null
  source_name: string | null
  /** Present when book runs on server (http engine). */
  dirty?: boolean
}

export type BalanceLine = {
  number: number
  name: string
  type: string
  balance_cents: number
  section: 'assets' | 'liabilities' | 'profit'
}

export type BalancesResponse = {
  date: string
  period: Period
  lines: BalanceLine[]
  balances: Record<string, number>
}

export type Entry = {
  id: number
  date: string
  account: number
  account_name?: string
  debit_cents: number | null
  credit_cents: number | null
  balance_cents?: number
  description: string
  vat_percent: number | null
  voucher: {
    id: number
    date: string
    doc_number: number | null
    type: number
    series: string
  }
  partner: { id: number; name: string } | null
}

/** Päiväkirja row — not a pääkirja `Entry` (no running balance / vat_percent). */
export type JournalEntry = {
  id: number
  date: string
  account: number
  account_name: string
  description: string
  debit_cents: number | null
  credit_cents: number | null
  allocation: number
  voucher: {
    id: number
    date: string
    doc_number: number | null
    type: number
    series: string
  }
  partner: { id: number; name: string } | null
}

export type JournalResponse = {
  entries: JournalEntry[]
  count: number
}

/** Selaus Viennit row — one `Vienti` with voucher/status/VAT/allocation for browse. */
export type BrowseEntry = {
  id: number
  date: string
  account: number
  account_name: string
  description: string
  debit_cents: number | null
  credit_cents: number | null
  allocation: number
  allocation_name: string
  vat_code: number | null
  vat_percent: number | null
  attachment_count: number
  voucher: {
    id: number
    date: string
    doc_number: number | null
    type: number
    series: string
    status: number
  }
  partner: { id: number; name: string } | null
  item_id: number | null
  era: {
    id: number
    is_open: boolean
    voucher_id: number
    date: string
    doc_number: number | null
    series: string
    name: string
    balance_cents: number
    paid: boolean
  } | null
}

export type BrowseAccountOption = {
  number: number
  name: string
}

export type FetchBrowseEntriesParams = {
  start_date?: string
  end_date?: string
  status?: string
  q?: string
  huomio?: boolean
  account?: number
}

export type BrowseEntriesResponse = {
  entries: BrowseEntry[]
  accounts: BrowseAccountOption[]
  debit_sum_cents: number
  credit_sum_cents: number
  count: number
}

export type EntriesResponse = {
  account: number
  name: string
  type: string
  start_date: string
  end_date: string
  period: Period
  opening_cents: number
  entries: Entry[]
  debit_sum_cents: number
  credit_sum_cents: number
  closing_cents: number
  count: number
}

export type VoucherEntry = {
  id: number
  line_no: number
  /** Vienti.tyyppi — 99100 poisto, 99210 jaksotus tilinpäätös, 99220 tilinavaus. */
  entry_type?: number
  date: string
  account: number
  account_name: string
  account_type: string
  description: string
  debit_cents: number | null
  credit_cents: number | null
  vat_percent: number | null
  vat_code: number | null
  allocation?: number
  item_id?: number | null
  accrual_starts?: string | null
  accrual_ends?: string | null
  json?: Record<string, unknown>
  archive_id?: string
  partner: { id: number; name: string } | null
}

export type VoucherAttachment = {
  id: number
  name: string
  role_name: string
  type: string
}

export type VoucherDetail = {
  id: number
  date: string
  type: number
  status: number
  doc_number: number | null
  series: string
  title: string
  invoice_date: string | null
  due_date: string | null
  reference: string
  json?: Record<string, unknown>
  bank_statement?: { start_date?: string; end_date?: string; account?: number }
  partner: { id: number; name: string } | null
  entries: VoucherEntry[]
  debit_sum_cents: number
  credit_sum_cents: number
  count: number
  attachments: VoucherAttachment[]
  attachment_count: number
  notes?: string
  log?: VoucherLogEntry[]
}

export type VoucherLogEntry = {
  id: number
  time: string | null
  user_id: number
  status: number
  data: Record<string, unknown>
}

/** Partner on create/update: id, name (create-on-the-fly), or raw kumppani id. */
export type SavePartnerInput =
  | number
  | string
  | { id?: number; name?: string; vat_id?: string }
  | null

/** One Vienti row for {@link SaveVoucherInput}. Integer cents only. */
export type SaveEntryInput = {
  line_no?: number
  /** Vienti.tyyppi (e.g. 99100 poisto). */
  entry_type?: number
  date?: string
  account: number
  allocation?: number
  description?: string
  debit_cents?: number | null
  credit_cents?: number | null
  vat_code?: number | null
  vat_percent?: number | null
  /** `-1` or `new_era: true` opens a new era (eraid = row id). */
  item_id?: number | null
  new_era?: boolean
  accrual_starts?: string | null
  accrual_ends?: string | null
  archive_id?: string | null
  partner?: SavePartnerInput
  json?: Record<string, unknown>
}

/**
 * Typed write payload for {@link saveVoucher}. Editor, VAT, year-end, and
 * tiliote split all build this; posting is the only writer.
 * On update, omit `entries` to keep existing lines.
 */
export type SaveVoucherInput = {
  date?: string
  type?: number
  status?: number
  title?: string
  series?: string
  doc_number?: number | string | null
  partner?: SavePartnerInput
  invoice_date?: string | null
  due_date?: string | null
  reference?: string
  json?: Record<string, unknown>
  entries?: SaveEntryInput[]
}

/** Create/update kohdennus (settings). */
export type SaveAllocationInput = {
  name: string
  type: number
  parent_id?: number | null
  starts?: string | null
  ends?: string | null
}

export type FetchVouchersParams = {
  start_date?: string
  end_date?: string
  type?: number
  status?: string
  q?: string
  huomio?: boolean
}

export type VoucherListItem = {
  id: number
  date: string
  type: number
  status: number
  doc_number: number | null
  series: string
  title: string
  reference: string
  partner: { id: number; name: string } | null
  debit_cents: number
  credit_cents: number
  attachment_count: number
  huomio: boolean
}

export type Account = {
  number: number
  type: string
  iban: string | null
  name: string
}

export type Allocation = {
  id: number
  type: number
  type_name: string
  parent_id: number | null
  parent_name: string
  name: string
  starts: string | null
  ends: string | null
  count: number
}

export type AllocationBalanceLine = {
  number: number
  name: string
  type: string
  balance_cents: number
}

export type AllocationBalances = Allocation & {
  start_date: string
  end_date: string
  include_projects: boolean
  lines: AllocationBalanceLine[]
  kitsas_profit_cents: number
  income_cents: number
  expense_cents: number
  profit_cents: number
}

export type AllocationSummaryRow = Allocation & {
  kitsas_profit_cents: number
  income_cents: number
  expense_cents: number
  profit_cents: number
}

export type AllocationsSummaryResponse = {
  start_date: string
  end_date: string
  allocations: AllocationSummaryRow[]
}

export type AllocationEntry = {
  id: number
  date: string
  account: number
  account_name: string
  account_type: string
  debit_cents: number | null
  credit_cents: number | null
  description: string
  vat_percent: number | null
  allocation: { id: number; name: string }
  voucher: {
    id: number
    date: string
    doc_number: number | null
    type: number
    series: string
  }
  partner: { id: number; name: string } | null
}

export type AllocationEntries = Allocation & {
  start_date: string
  end_date: string
  include_projects: boolean
  pnl_only: boolean
  entries: AllocationEntry[]
  debit_sum_cents: number
  credit_sum_cents: number
  count: number
}

export type BalanceSheetItemMovement = {
  id: number
  date: string
  entry_date: string
  description: string
  snt: number
  kind?: 'before' | 'opening' | 'change'
  voucher: {
    id: number
    date: string
    doc_number: number | null
    series: string
  }
  partner: { id: number; name: string } | null
}

export type BalanceSheetItem = {
  era: {
    id: number
    date: string
    entry_date: string
    description: string
    snt: number
    voucher: {
      id: number
      date: string
      doc_number: number | null
      series: string
    }
    partner: { id: number; name: string } | null
  }
  before_cents: number
  period_change_cents: number
  closing_cents: number
  movements: BalanceSheetItemMovement[]
}

export type BalanceSheetItemAccount = {
  number: number
  type: string
  name: string
  section: 'assets' | 'liabilities'
  opening_cents: number
  closing_cents: number
  items: BalanceSheetItem[]
  unassigned: {
    before_cents: number
    period_change_cents: number
    closing_cents: number
    movements: BalanceSheetItemMovement[]
  }
}

export type BalanceSheetItemsResponse = {
  start_date: string
  end_date: string
  accounts: BalanceSheetItemAccount[]
  totals: { opening_cents: number; closing_cents: number }
}
