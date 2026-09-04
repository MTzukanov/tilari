import { t } from '../../../i18n'
import { vatCodeTitle } from '../../../book/modules/vat/domain/vatLabels'

/** Named ALV choices for the editor (codes from docs/DATA_MODEL.md). */

export type VatChoice = {
  key: string
  code: number
  percent: number
  label: string
}

export type VatTypeChoice = {
  code: number
  label: string
  /** Kitsas VerotyyppiModel nollalaji — percent box is hidden. */
  zeroRate: boolean
}

/** Kitsas tulomenoapuri / tiliotekirjaaja / muumuokkausdlg alvProssa list. */
export const VAT_RATES = [25.5, 24, 14, 13.5, 10] as const

const VAT_TYPE_DEFS: { code: number; zeroRate?: boolean }[] = [
  { code: 0, zeroRate: true },
  { code: 21 },
  { code: 11 },
  { code: 28 },
  { code: 18 },
  { code: 29 },
  { code: 12 },
  { code: 19, zeroRate: true },
  { code: 25 },
]

function typeLabel(code: number): string {
  return t(`vat.types.${code}`)
}

export function vatTypeChoices(): VatTypeChoice[] {
  return VAT_TYPE_DEFS.map((d) => ({
    code: d.code,
    label: typeLabel(d.code),
    zeroRate: Boolean(d.zeroRate),
  }))
}

export function isZeroVatType(code: number): boolean {
  const found = VAT_TYPE_DEFS.find((d) => d.code === code)
  return found ? Boolean(found.zeroRate) : code === 0
}

export function defaultVatPercent(code: number): number {
  return isZeroVatType(code) ? 0 : 25.5
}

export function vatKey(code: number, percent: number | null | undefined): string {
  const pct = isZeroVatType(code) ? 0 : percent || 0
  return `${code}:${pct}`
}

export function vatFromKey(key: string): VatChoice {
  const [codePart, pctPart] = key.split(':')
  const code = Number(codePart)
  const percent = isZeroVatType(code) ? 0 : Number(pctPart || 0)
  const known = VAT_TYPE_DEFS.some((d) => d.code === code)
  const resolved = known ? code : 0
  const pct = known ? percent : 0
  return {
    key: vatKey(resolved, pct),
    code: resolved,
    percent: pct,
    label: vatChoiceLabel(resolved, pct),
  }
}

function vatChoiceLabel(code: number, percent: number): string {
  const base = typeLabel(code)
  if (!percent || isZeroVatType(code)) return base
  return `${base} ${vatPercentLabel(percent)}`
}

/** Flat list kept for callers that still iterate combined choices. */
export function vatChoices(): VatChoice[] {
  const out: VatChoice[] = []
  for (const d of VAT_TYPE_DEFS) {
    if (d.zeroRate) {
      out.push({
        key: vatKey(d.code, 0),
        code: d.code,
        percent: 0,
        label: typeLabel(d.code),
      })
      continue
    }
    for (const percent of VAT_RATES) {
      out.push({
        key: vatKey(d.code, percent),
        code: d.code,
        percent,
        label: vatChoiceLabel(d.code, percent),
      })
    }
  }
  return out
}

export function vatName(code: number, percent?: number | null): string {
  if (VAT_TYPE_DEFS.some((d) => d.code === code)) {
    return vatChoiceLabel(code, percent ?? 0)
  }
  const title = vatCodeTitle(code)
  if (percent) return `${title} ${vatPercentLabel(percent)}`
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

/** Kitsas alvProssa formatting: always two decimals, Finnish comma. */
export function vatPercentLabel(percent: number): string {
  if (!percent) return ''
  return `${percent.toFixed(2).replace('.', ',')} %`
}
