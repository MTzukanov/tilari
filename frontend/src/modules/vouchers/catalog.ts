import {
  TYPE_ACCRUAL,
  TYPE_ATTACHMENT_NOTE,
  TYPE_BANK_STATEMENT,
  TYPE_DEPRECIATION,
  TYPE_EXPENSE,
  TYPE_INCOME,
  TYPE_INCOME_TAX,
  TYPE_OPENING,
  TYPE_OTHER,
  TYPE_TRANSFER,
  TYPE_VAT_RETURN,
} from '../../book/vouchers'

/** Glyph ids shared by browse (`VoucherKind`) and the editor type combo. */
export type VoucherIconId =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'statement'
  | 'attachment'
  | 'vat'
  | 'yearend'
  | 'other'
  | 'memo'
  | 'payroll'
  | 'opening'
  | 'import'
  | 'invoice'

/** Which Kirjaa body the editor mounts for this type. */
export type EditorLayout = 'expense' | 'income' | 'transfer' | 'statement' | 'lines' | 'attachment'

export type VoucherTypeDef = {
  type: number
  icon: VoucherIconId
  kindClass: string
  layout: EditorLayout
  creatable: boolean
}

const TYPES: VoucherTypeDef[] = [
  { type: TYPE_EXPENSE, icon: 'expense', kindClass: 'kind-expense', layout: 'expense', creatable: true },
  { type: TYPE_INCOME, icon: 'income', kindClass: 'kind-income', layout: 'income', creatable: true },
  { type: TYPE_TRANSFER, icon: 'transfer', kindClass: 'kind-transfer', layout: 'transfer', creatable: true },
  { type: TYPE_OTHER, icon: 'other', kindClass: 'kind-other', layout: 'lines', creatable: true },
  { type: TYPE_BANK_STATEMENT, icon: 'statement', kindClass: 'kind-bank-statement', layout: 'statement', creatable: true },
  { type: TYPE_ATTACHMENT_NOTE, icon: 'attachment', kindClass: 'kind-attachment', layout: 'attachment', creatable: true },
  { type: 90, icon: 'import', kindClass: 'kind-other', layout: 'lines', creatable: false },
  { type: 110, icon: 'invoice', kindClass: 'kind-expense', layout: 'expense', creatable: false },
  { type: 120, icon: 'expense', kindClass: 'kind-expense', layout: 'expense', creatable: false },
  { type: 210, icon: 'invoice', kindClass: 'kind-income', layout: 'lines', creatable: false },
  { type: 214, icon: 'invoice', kindClass: 'kind-income', layout: 'lines', creatable: false },
  { type: 216, icon: 'invoice', kindClass: 'kind-income', layout: 'lines', creatable: false },
  { type: 500, icon: 'payroll', kindClass: 'kind-other', layout: 'lines', creatable: false },
  { type: 700, icon: 'memo', kindClass: 'kind-other', layout: 'lines', creatable: false },
  { type: TYPE_OPENING, icon: 'opening', kindClass: 'kind-other', layout: 'lines', creatable: false },
  { type: TYPE_VAT_RETURN, icon: 'vat', kindClass: 'kind-vat', layout: 'lines', creatable: false },
  { type: TYPE_DEPRECIATION, icon: 'yearend', kindClass: 'kind-yearend', layout: 'lines', creatable: false },
  { type: TYPE_ACCRUAL, icon: 'yearend', kindClass: 'kind-yearend', layout: 'lines', creatable: false },
  { type: TYPE_INCOME_TAX, icon: 'yearend', kindClass: 'kind-yearend', layout: 'lines', creatable: false },
]

const BY_TYPE = new Map(TYPES.map((d) => [d.type, d]))

const FALLBACK: VoucherTypeDef = {
  type: TYPE_OTHER,
  icon: 'other',
  kindClass: 'kind-other',
  layout: 'lines',
  creatable: false,
}

export function voucherTypeDef(type: number): VoucherTypeDef {
  return BY_TYPE.get(type) ?? { ...FALLBACK, type }
}

export function creatableVoucherTypes(): VoucherTypeDef[] {
  return TYPES.filter((d) => d.creatable)
}

export function browseFilterTypes(): VoucherTypeDef[] {
  return [
    voucherTypeDef(TYPE_EXPENSE),
    voucherTypeDef(TYPE_INCOME),
    voucherTypeDef(TYPE_TRANSFER),
    voucherTypeDef(TYPE_BANK_STATEMENT),
    voucherTypeDef(TYPE_ATTACHMENT_NOTE),
    voucherTypeDef(TYPE_OTHER),
    voucherTypeDef(TYPE_VAT_RETURN),
    voucherTypeDef(TYPE_ACCRUAL),
  ]
}

export function hasBookTab(type: number): boolean {
  const layout = voucherTypeDef(type).layout
  return layout === 'expense' || layout === 'income' || layout === 'transfer' || layout === 'statement'
}

export function defaultEditorTab(type: number): EditorTab {
  const layout = voucherTypeDef(type).layout
  if (layout === 'attachment') return 'attachments'
  if (layout === 'lines') return 'entries'
  return 'book'
}

export type EditorTab = 'book' | 'entries' | 'notes' | 'attachments' | 'log'

export const EDITOR_TABS: { id: EditorTab; labelKey: string }[] = [
  { id: 'book', labelKey: 'editor.tabEntry' },
  { id: 'entries', labelKey: 'editor.tabLines' },
  { id: 'notes', labelKey: 'editor.tabNotes' },
  { id: 'attachments', labelKey: 'editor.tabAttachments' },
  { id: 'log', labelKey: 'editor.tabLog' },
]
