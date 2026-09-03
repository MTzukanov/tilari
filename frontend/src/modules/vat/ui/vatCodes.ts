import { t } from '../../../i18n'
import { vatCodeTitle } from '../../../book/modules/vat/domain/vatLabels'

/** Named ALV choices for the editor (codes from docs/DATA_MODEL.md). */

export type VatChoice = {
  key: string
  code: number
  percent: number
  label: string
}

const VAT_DEFS: { key: string; code: number; percent: number }[] = [
  { key: '0:0', code: 0, percent: 0 },
  { key: '21:25.5', code: 21, percent: 25.5 },
  { key: '21:24', code: 21, percent: 24 },
  { key: '11:25.5', code: 11, percent: 25.5 },
  { key: '11:24', code: 11, percent: 24 },
  { key: '28:25.5', code: 28, percent: 25.5 },
  { key: '18:25.5', code: 18, percent: 25.5 },
  { key: '29:25.5', code: 29, percent: 25.5 },
  { key: '12:25.5', code: 12, percent: 25.5 },
  { key: '19:0', code: 19, percent: 0 },
  { key: '25:25.5', code: 25, percent: 25.5 },
]

export function vatChoices(): VatChoice[] {
  return VAT_DEFS.map((c) => ({ ...c, label: t(`vat.choices.${c.key}`) }))
}

export function vatKey(code: number, percent: number | null | undefined): string {
  const pct = percent || 0
  const exact = VAT_DEFS.find((c) => c.code === code && c.percent === pct)
  if (exact) return exact.key
  const byCode = VAT_DEFS.find((c) => c.code === code)
  return byCode?.key ?? '0:0'
}

export function vatFromKey(key: string): VatChoice {
  const found = vatChoices().find((c) => c.key === key)
  return found ?? vatChoices()[0]
}

export function vatName(code: number, percent?: number | null): string {
  const found = vatChoices().find(
    (c) => c.code === code && (percent == null || c.percent === percent),
  )
  if (found) return found.label
  const title = vatCodeTitle(code)
  if (percent) return `${title} ${percent} %`
  return title
}

/** Kitsas VerotyyppiModel::kuvakeKoodilla — letter/glyph by ALV type. */
export type VatIconKind =
  | 'none'
  | 'sales-netto'
  | 'purchase-netto'
  | 'sales-brutto'
  | 'purchase-brutto'
  | 'cash'
  | 'zero'
  | 'eu'
  | 'eu-goods'
  | 'globe'
  | 'ship'
  | 'hammer'
  | 'margin'
  | 'invoice'
  | 'tax'

const ALV_SETTLEMENT = 900

export function vatBaseCode(code: number): number {
  return code < ALV_SETTLEMENT ? code % 100 : code
}

export function vatIconKind(code: number): VatIconKind {
  switch (vatBaseCode(code)) {
    case 11:
      return 'sales-netto'
    case 21:
      return 'purchase-netto'
    case 12:
      return 'sales-brutto'
    case 22:
      return 'purchase-brutto'
    case 18:
    case 28:
      return 'cash'
    case 19:
      return 'zero'
    case 13:
    case 23:
      return 'margin'
    case 14:
    case 24:
      return 'eu-goods'
    case 15:
    case 25:
      return 'eu'
    case 16:
    case 26:
      return 'hammer'
    case 27:
      return 'ship'
    case 29:
      return 'globe'
    case 51:
      return 'invoice'
    default:
      return code >= ALV_SETTLEMENT ? 'tax' : 'none'
  }
}

export function vatPercentLabel(percent: number): string {
  if (!percent) return ''
  return `${String(percent).replace('.', ',')} %`
}
