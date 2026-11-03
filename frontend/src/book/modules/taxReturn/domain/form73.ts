/**
 * Form 73, received dividends by class. The ledger holds one figure, Saadut osingot ja ylijäämät; how it splits by
 * the payer's country and listing is typed. A class is wholly tax-free or wholly taxable, so its share equals its
 * total. Vero's record description `VSY07326` sets the fields, its form guide the classes; the wording is OmaVero's.
 * Not built: dividends deductible for the payer (by country) and the partly taxable classes of credit and insurance
 * institutions, whose 6B already stops the file.
 */
import type { DividendClass, DividendInput, Form73Input, Form73View } from './types'

export type DividendClassDef = {
  key: DividendClass
  title: string
  taxable: boolean
  /** File codes: the class total, its tax-free or taxable share, and the optional listing flag and ownership. */
  codes: { total: number; share: number; listed?: number; ownership?: number }
}

export const DIVIDEND_CLASSES: DividendClassDef[] = [
  { key: 'taxfree_fi', title: 'Suomesta saadut verovapaat osingot ja ylijäämät', taxable: false, codes: { total: 330, share: 944, listed: 301 } },
  {
    key: 'taxfree_eu',
    title: 'Toisesta EU- tai ETA-valtiosta saadut verovapaat osingot ja ylijäämät',
    taxable: false,
    codes: { total: 333, share: 945, listed: 312, ownership: 311 },
  },
  {
    key: 'taxfree_other',
    title: 'EU:n ja ETAn ulkopuolelta saadut verovapaat osingot ja ylijäämät',
    taxable: false,
    codes: { total: 948, share: 949, listed: 947, ownership: 946 },
  },
  { key: 'taxable_fi', title: 'Suomesta saadut veronalaiset osingot ja ylijäämät', taxable: true, codes: { total: 332, share: 310, listed: 308 } },
  { key: 'taxable_eu', title: 'Toisesta EU- tai ETA-valtiosta saadut veronalaiset osingot ja ylijäämät', taxable: true, codes: { total: 335, share: 321 } },
  {
    key: 'taxable_other',
    title: 'EU:n ja ETAn ulkopuolelta saadut veronalaiset osingot ja ylijäämät',
    taxable: true,
    codes: { total: 336, share: 324, ownership: 322 },
  },
  { key: 'reit', title: 'REIT-yhtiöstä saadut veronalaiset osingot', taxable: true, codes: { total: 952, share: 953, ownership: 951 } },
]

/** Form 73's own codes. Several numbers also exist on the 6B with another meaning, so its figures stay apart. */
export const FORM_73_LISTED_COMPANY = 300
export const FORM_73_TOTAL = 338
export const FORM_73_TAXFREE = 329
export const FORM_73_TAXABLE = 327

/** The 6B field the form's total goes to, and its taxable share's. */
export const DIVIDEND_FIELD = 337
export const DIVIDEND_TAXABLE_FIELD = 338

export function emptyForm73(): Form73Input {
  return { company_listed: null, classes: {} }
}

export function emptyDividend(): DividendInput {
  return { cents: 0, listed: false, ownership: '' }
}

/** `typed`: some class has an amount, so the form's taxable share decides the 6B's. */
export function computeForm73(input: Form73Input, ledgerCents: number): Form73View {
  const classes = DIVIDEND_CLASSES.map((def) => {
    const own = input.classes[def.key] ?? emptyDividend()
    return { ...def, ...own, share_cents: own.cents }
  })
  const total = classes.reduce((sum, row) => sum + row.cents, 0)
  const taxable = classes.filter((row) => row.taxable).reduce((sum, row) => sum + row.cents, 0)
  return {
    company_listed: input.company_listed,
    classes,
    typed: classes.some((row) => row.cents !== 0),
    total_cents: total,
    taxfree_cents: total - taxable,
    taxable_cents: taxable,
    ledger_cents: ledgerCents,
  }
}
