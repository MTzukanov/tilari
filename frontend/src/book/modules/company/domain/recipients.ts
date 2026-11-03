/**
 * Who a dividend goes to and what is withheld, from the shareholders the owner keeps. Pure and never
 * stored (AGENTS rule 9): the split follows the holdings on the decision day.
 *
 * Vero's guide "Ennakonpidätys osingosta ja Verohallinnolle annettavat ilmoitukset" (in force from
 * 1.1.2023): an unlisted company withholds 7.5 % of a dividend to a natural person or a domestic estate,
 * of the whole amount, up to 150 000 euros paid to the same recipient, and 28 % of the part above. A
 * company's dividend has no withholding. A non-resident pays source tax under other rules: the owner
 * types its rate.
 */
import type { Shareholder, ShareholderKind } from './types'

export const PERSON_RATE_BP = 750
export const OVER_LIMIT_RATE_BP = 2800
/** Counted per recipient over the calendar year's payments. */
export const PERSON_LIMIT_SNT = 15_000_000

export type Recipient = {
  key: string
  partner_id: number
  kind: ShareholderKind
  shares: number
  gross_snt: number
  /** Null when a non-resident has no rate: nothing can be withheld until it is typed. */
  rate_bp: number | null
  /** The part of the gross above the year's limit, withheld at 28 %. */
  over_limit_snt: number
  withholding_snt: number
  net_snt: number
}

/** The latest holding on or before `day`; 0 before the first. */
export function sharesOn(shareholder: Shareholder, day: string): number {
  let shares = 0
  for (const h of shareholder.holdings) if (h.from <= day) shares = h.shares
  return shares
}

/** `total` in parts by weight, largest remainder first, so the parts add up to the cent. Ties go to the earlier. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  // BigInt: cents times shares can pass 2^53.
  const exact = weights.map((w) => BigInt(total) * BigInt(w))
  const parts = exact.map((e) => Number(e / BigInt(sum)))
  let rest = total - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => ({ i, rem: e % BigInt(sum) })).sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i))
  for (const { i } of order) {
    if (rest <= 0) break
    parts[i] += 1
    rest -= 1
  }
  return parts
}

/** Half up to the cent. */
function percentOf(cents: number, bp: number): number {
  return Math.round((cents * bp) / 10000)
}

/** What is withheld from `gross`, given what the same recipient got earlier in the payment's year. */
export function withholdingFor(
  shareholder: Shareholder,
  gross: number,
  earlierThisYear: number,
): { rate_bp: number | null; over_limit_snt: number; withholding_snt: number } {
  if (shareholder.rate_bp != null) return { rate_bp: shareholder.rate_bp, over_limit_snt: 0, withholding_snt: percentOf(gross, shareholder.rate_bp) }
  if (!shareholder.resident) return { rate_bp: null, over_limit_snt: 0, withholding_snt: 0 }
  if (shareholder.kind === 'company') return { rate_bp: 0, over_limit_snt: 0, withholding_snt: 0 }
  const under = Math.max(0, Math.min(gross, PERSON_LIMIT_SNT - earlierThisYear))
  const over = gross - under
  return { rate_bp: PERSON_RATE_BP, over_limit_snt: over, withholding_snt: Math.round((under * PERSON_RATE_BP + over * OVER_LIMIT_RATE_BP) / 10000) }
}

/**
 * `amount` split over the holdings on `day`, in the shareholders' order. `earlier` holds what each
 * `partner_id` already got in the payment's year. Empty when nobody held shares that day.
 */
export function splitDividend(amount: number, day: string, shareholders: Shareholder[], earlier: ReadonlyMap<number, number> = new Map()): Recipient[] {
  const holders = shareholders.map((s) => ({ s, shares: sharesOn(s, day) })).filter((h) => h.shares > 0)
  const parts = allocate(amount, holders.map((h) => h.shares))
  return holders.map(({ s, shares }, i) => {
    const gross = parts[i]
    const tax = withholdingFor(s, gross, earlier.get(s.partner_id) ?? 0)
    return { key: s.key, partner_id: s.partner_id, kind: s.kind, shares, gross_snt: gross, ...tax, net_snt: gross - tax.withholding_snt }
  })
}
