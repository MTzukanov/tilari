/** Finland's general VAT rate (yleinen verokanta) by date, as Vero gives it. Pure. */

const GENERAL_RATES: { from: string; pct: number }[] = [
  { from: '2024-09-01', pct: 25.5 },
  { from: '2013-01-01', pct: 24 },
  { from: '2010-07-01', pct: 23 },
  { from: '1994-06-01', pct: 22 },
]

/** Kitsas sales VAT codes whose sale carries VAT: netto 11, brutto 12, cash basis 18. */
export const SALES_VAT_CODES = new Set([11, 12, 18])

/** The general VAT rate in percent on `date` (YYYY-MM-DD). */
export function generalVatPercent(date: string): number {
  return (GENERAL_RATES.find((r) => r.from <= date) ?? GENERAL_RATES[GENERAL_RATES.length - 1]).pct
}

/** VAT on a net amount at `pct`, rounded to the cent like a Kitsas VAT row (half away from zero). */
export function vatOf(netCents: number, pct: number): number {
  const vat = Math.round((Math.abs(netCents) * pct) / 100)
  return netCents < 0 ? -vat : vat
}
