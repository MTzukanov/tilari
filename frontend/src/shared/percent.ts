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

/** Interest rates travel in 1/1000 % (`*_pcm`, 1000 = 1 %): "2,123 %". */
export function formatPcm(pcm: number | null | undefined): string {
  if (pcm == null) return ''
  return new Intl.NumberFormat(getBcp47(), {
    style: 'percent',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(pcm / 100000)
}

/** Editor text for 1/1000 %: 2123 -> "2,123", -250 -> "-0,25". */
export function formatPcmInput(pcm: number | null | undefined): string {
  if (pcm == null) return ''
  return String(pcm / 1000).replace('.', ',')
}

/** "2,123" / "-0.25 %" -> 2123 / -250; empty -> null; anything else -> NaN. */
export function parsePcmInput(raw: string): number | null {
  const text = raw.replace(/[%\s ]/g, '').replace(',', '.').replace('−', '-')
  if (!text) return null
  if (!/^-?\d+(\.\d{0,3})?$/.test(text)) return Number.NaN
  return Math.round(Number(text) * 1000)
}
