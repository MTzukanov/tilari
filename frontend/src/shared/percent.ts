import { getBcp47 } from '../i18n'

/** Percentages travel as basis points (100 bp = 1 %). */

export function formatBp(bp: number | null | undefined, digits = 1): string {
  if (bp == null) return ''
  return new Intl.NumberFormat(getBcp47(), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(bp / 10000)
}

/** Editor text for basis points: 450 -> "4,5". */
export function formatPercentInput(bp: number | null | undefined): string {
  if (bp == null) return ''
  return String(bp / 100).replace('.', ',')
}

/** "4,5" / "4.5 %" -> 450; empty -> null; anything else -> NaN. */
export function parsePercentInput(raw: string): number | null {
  const text = raw.replace(/[%\s ]/g, '').replace(',', '.')
  if (!text) return null
  if (!/^-?\d+(\.\d{0,2})?$/.test(text)) return Number.NaN
  return Math.round(Number(text) * 100)
}
