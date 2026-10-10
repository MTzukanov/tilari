/**
 * Setup suggestions: which balance-sheet item and which document belongs to which object.
 * Ledger evidence first (a sale voucher, a cost centre on the item's lines or its voucher);
 * text overlap with cost-centre names last, and only when one name clearly wins.
 */
import type { CostCentre, EraRoot, EraRow, PnlRow } from './ledger'
import type { SuggestionSource } from './types'

/** Words every housing-company name shares; they say nothing about which object it is. */
const STOP_WORDS = new Set(['as', 'oy', 'koy', 'asoy', 'ab', 'bostads', 'fastighets', 'kiinteisto', 'kiinteistö'])

/**
 * Dates in titles would match unit numbers: "Tiliote 01.01.2023 - 31.12.2023",
 * "1.10.24-30.6.25", "7.2024-6.2025" (month.year), "2024-05-01".
 */
const DATE_PATTERN = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?|\b\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g

export function tokenize(text: string): string[] {
  const out = new Set<string>()
  const lower = text.normalize('NFC').toLowerCase().replace(DATE_PATTERN, ' ')
  for (const word of lower.split(/[^\p{L}\p{N}]+/u)) {
    if (!word || STOP_WORDS.has(word)) continue
    const parts = word.match(/\p{L}+|\p{N}+/gu) ?? []
    for (const part of parts) if (!STOP_WORDS.has(part)) out.add(part)
    // "a12" also as one token, so "A 12" and "A12" match each other strongly.
    if (parts.length > 1) out.add(parts.join(''))
  }
  return [...out]
}

/**
 * `word_score` counts shared words only (street, housing company, city); `score` adds unit
 * letters and numbers. `specific` = a shared word that few names have (not just the city).
 */
export type TextScore = { id: number; score: number; word_score: number; specific: boolean; matched: Set<string> }
export type TextScorer = (text: string) => TextScore[]

/** A word, not a unit letter or number: the match must share at least one of these. */
function isWord(token: string): boolean {
  return token.length >= 3 && /^\p{L}+$/u.test(token)
}

/**
 * Same token, or the same Finnish word in another case ("Kuopio" / "Kuopion",
 * "Kajaani" / "Kajaanin"): letters only, the shorter one at least five long and a prefix.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (!isWord(a) || !isWord(b)) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 5 && long.startsWith(short)
}

/** IDF-weighted token overlap against cost-centre names; needs a shared word to count. */
export function textScorer(names: { id: number; name: string }[]): TextScorer {
  const tokens = names.map((n) => ({ id: n.id, tokens: [...new Set(tokenize(n.name))] }))
  const df = new Map<string, number>()
  for (const t of tokens) for (const tok of t.tokens) df.set(tok, (df.get(tok) ?? 0) + 1)
  const n = Math.max(1, names.length)
  // A city shared by many objects is not specific; a street or housing-company name is.
  const specificDf = Math.max(3, Math.ceil(n * 0.2))
  return (text: string) => {
    const query = tokenize(text)
    return tokens
      .map((t) => {
        let score = 0
        let wordScore = 0
        let specific = false
        const matched = new Set<string>()
        for (const nameToken of t.tokens) {
          if (!query.some((q) => tokensMatch(q, nameToken))) continue
          matched.add(nameToken)
          const idf = Math.log(1 + n / (df.get(nameToken) ?? 1))
          score += idf
          if (isWord(nameToken)) {
            wordScore += idf
            if ((df.get(nameToken) ?? 1) <= specificDf) specific = true
          }
        }
        return { id: t.id, score, word_score: wordScore, specific, matched }
      })
      .filter((s) => s.word_score > 0)
      .sort((a, b) => b.word_score - a.word_score || b.score - a.score || a.id - b.id)
  }
}

function containsAll(big: Set<string>, small: Set<string>): boolean {
  for (const tok of small) if (!big.has(tok)) return false
  return true
}

/**
 * The winner of a scored list, or the tied candidates. Words decide first: a name whose
 * shared words score clearly higher wins. Among names with the same words, unit letters and
 * numbers break the tie: a name that matches everything its rivals match and more wins
 * ("F 44" over "F 48"), but only on a specific word - a city alone never picks.
 */
export function pickBest(
  scores: { id: number; score: number; word_score?: number; specific?: boolean; matched?: Set<string> }[],
): { id: number | null; candidates: number[] } {
  if (!scores.length) return { id: null, candidates: [] }
  const words = (s: (typeof scores)[number]) => s.word_score ?? s.score
  const top = words(scores[0])
  const close = scores.filter((s) => words(s) * 1.5 > top)
  if (close.length === 1) return { id: close[0].id, candidates: [close[0].id] }
  const best = [...close].sort((a, b) => b.score - a.score || a.id - b.id)[0]
  const bestMatched = best.matched
  if (
    bestMatched &&
    best.specific !== false &&
    close.every((s) => s === best || (s.matched && s.matched.size < bestMatched.size && containsAll(bestMatched, s.matched)))
  ) {
    return { id: best.id, candidates: close.map((s) => s.id) }
  }
  return { id: null, candidates: close.map((s) => s.id) }
}

export type EraSuggestion = { cost_centre_id: number | null; source: SuggestionSource; candidates: number[] }

export type SuggestEraInput = {
  centres: CostCentre[]
  roots: EraRoot[]
  /** Lines of the candidate items (any voucher). */
  eraRows: EraRow[]
  /** P&L lines of the vouchers that touch candidate items. */
  voucherPnl: Map<number, PnlRow[]>
  scorer: TextScorer
}

/** Cost centre of an allocation id: itself, or the cost centre a project belongs to. */
export function centreResolver(centres: CostCentre[]): (allocation: number) => number | null {
  const map = new Map<number, number>()
  for (const c of centres) {
    map.set(c.id, c.id)
    for (const child of c.child_ids) map.set(child, c.id)
  }
  return (allocation) => map.get(allocation) ?? null
}

function unique(values: (number | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v != null))].sort((a, b) => a - b)
}

export function suggestEra(root: EraRoot, input: SuggestEraInput): EraSuggestion | null {
  const centreOf = centreResolver(input.centres)
  const rows = input.eraRows.filter((r) => r.eraid === root.eraid)

  // 1. Sale: a voucher crediting the item with P&L lines on exactly one object, or one
  //    whose cost line matches the credited amount. When it credits other items too, lines on
  //    one object only say the item went in that object's price (a parking space sold with a
  //    flat): the item's own evidence below decides, and that object only when nothing does.
  const ambiguous = new Set<number>()
  let soldWith: number | null = null
  for (const credit of rows.filter((r) => r.signed_snt < 0 && r.id !== r.eraid)) {
    const lines = input.voucherPnl.get(credit.voucher_id) ?? []
    if (!lines.length) continue
    const centres = unique(lines.map((l) => centreOf(l.allocation)))
    if (centres.length === 1) {
      const others = input.eraRows.some(
        (r) => r.voucher_id === credit.voucher_id && r.eraid !== root.eraid && r.signed_snt < 0 && r.id !== r.eraid,
      )
      if (!others) return { cost_centre_id: centres[0], source: 'sale', candidates: centres }
      soldWith ??= centres[0]
      continue
    }
    const matching = unique(
      lines.filter((l) => l.net_snt === credit.signed_snt).map((l) => centreOf(l.allocation)),
    )
    if (matching.length === 1) return { cost_centre_id: matching[0], source: 'sale', candidates: matching }
    for (const c of matching.length ? matching : centres) ambiguous.add(c)
  }

  // 2. A cost centre on the item's own lines (Kitsas allows it on balance-sheet lines).
  const onLines = unique(rows.map((r) => centreOf(r.allocation)))
  if (onLines.length === 1) return { cost_centre_id: onLines[0], source: 'era_allocation', candidates: onLines }

  // 3. The opening voucher's P&L lines all on one object.
  const rootLines = input.voucherPnl.get(root.voucher_id) ?? []
  const onVoucher = unique(rootLines.map((l) => centreOf(l.allocation)))
  if (onVoucher.length === 1) {
    return { cost_centre_id: onVoucher[0], source: 'voucher_allocation', candidates: onVoucher }
  }

  // 4. Text: the item's description and voucher title against cost-centre names.
  const picked = pickBest(input.scorer(`${root.description} ${root.voucher_title}`))
  if (picked.id != null) return { cost_centre_id: picked.id, source: 'text', candidates: picked.candidates }
  if (soldWith != null) return { cost_centre_id: soldWith, source: 'sale', candidates: unique([soldWith, ...picked.candidates]) }
  const candidates = unique([...ambiguous, ...picked.candidates])
  if (candidates.length) return { cost_centre_id: null, source: ambiguous.size ? 'sale' : 'text', candidates }
  return null
}
