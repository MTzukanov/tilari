/**
 * Lease suggestions from what the book already has: the object's linked contract documents
 * (type-800 vouchers, read by their titles) and its rent payments. Pure. Nothing is stored
 * until the owner adds a suggestion on the edit page and saves.
 */
import { monthEnd } from '../../../months'
import type { Lease, LeaseRent } from './types'

export type SuggestDoc = { voucher_id: number; date: string; title: string }
/** One income line on the object (corrections already on their booking's date). */
export type SuggestIncome = { date: string; partner_id: number | null; amount_snt: number; text?: string }

export type LeaseSuggestion = {
  lease: Lease
  /** A contract document, or a run of payments outside every contract. */
  source: 'contract' | 'payments'
}

export type SuggestInput = {
  docs: SuggestDoc[]
  income: SuggestIncome[]
  /** Partner names by id, for the payers. */
  names: Map<number, string>
  /** The cost centre's name: its words never identify a tenant. */
  centreName: string
  /** A parking space or garage: what it earns is its rent, whatever the line says. */
  parkingObject: boolean
  asOf: string
}

/** Suggested leases expect the rent on the 5th unless the owner says otherwise. */
export const DEFAULT_DUE_DAY = 5

type DateToken = { at: number; end: number; iso: string; monthOnly: boolean }

const DATE_TOKEN = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?!\d)|(\d{1,2})\.(\d{4})(?!\d)/g

function iso(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** Dates in a title: 1.3.2025, 01.08.23, 9.2025 (a month). A day past the month's end is its last day. */
function dateTokens(title: string): DateToken[] {
  const out: DateToken[] = []
  for (const m of title.matchAll(DATE_TOKEN)) {
    const at = m.index ?? 0
    // Not the tail of a longer number, e.g. "1.12.2023" inside "11.12.2023".
    if (at > 0 && /[\d.]/.test(title[at - 1])) continue
    let day: number, month: number, year: number, monthOnly: boolean
    if (m[1]) {
      ;[day, month] = [Number(m[1]), Number(m[2])]
      if (m[3].length === 3) continue // cut-off year ("31.01.202")
      year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      monthOnly = false
    } else {
      ;[day, month, year, monthOnly] = [1, Number(m[4]), Number(m[5]), true]
    }
    if (month < 1 || month > 12 || day < 1 || year < 1990 || year > 2100) continue
    out.push({ at, end: at + m[0].length, iso: iso(year, month, day), monthOnly })
  }
  return out
}

/** A title's period: the first date, and the date after a dash right behind it. */
export function titlePeriod(title: string): { starts?: string; ends?: string } {
  const tokens = dateTokens(title)
  if (!tokens.length) return {}
  const [first, next] = tokens
  const out: { starts?: string; ends?: string } = { starts: first.iso }
  if (next && /^\s*[-–]\s*$/.test(title.slice(first.end, next.at))) {
    out.ends = next.monthOnly ? monthEnd(next.iso.slice(0, 7)) : next.iso
  }
  return out
}

/** The date a rent-increase notice names: the first date after "korotus", else the first. */
function increaseDate(title: string): string | undefined {
  const tokens = dateTokens(title)
  const word = title.toLowerCase().indexOf('korotus')
  return (tokens.find((t) => word >= 0 && t.at > word) ?? tokens[0])?.iso
}

export function docKind(title: string): { contract: boolean; increase: boolean } {
  const t = title.toLowerCase()
  return {
    // "Vuorkasopimus" is a typo seen in real titles; a "huolenpitosopimus" is a service contract.
    contract: /vuo(?:kr|rk)a?sopimu/.test(t) && !t.includes('huolenpito'),
    increase: t.includes('korotus'),
  }
}

/** Payers who pay on a tenant's behalf (housing allowance): never suggested as the tenant. */
const ON_BEHALF = /\b(kela|fpa)\b/i

const STOP_WORDS = new Set(['asunto', 'oy', 'ab', 'tai', 'och', 'vuokrasopimus', 'sopimus', 'vuokrankorotus', 'autopaikka', 'autopaikan'])

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
}

/**
 * How well a partner's name shows in a title: its own words, and two adjacent words written
 * together ("Koti Aina Oy" in "Kotiaina").
 */
function nameScore(partnerName: string, titleWords: Set<string>, titleJoined: string, ignore: Set<string>): number {
  const all = words(partnerName)
  let score = all.filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !ignore.has(w) && titleWords.has(w)).length
  for (let i = 0; i + 1 < all.length; i++) {
    if (ignore.has(all[i]) || ignore.has(all[i + 1])) continue
    const joined = all[i] + all[i + 1]
    if (joined.length >= 6 && titleJoined.includes(joined)) score += 1
  }
  return score
}

const monthKey = (date: string) => date.slice(0, 7)
const firstOfMonth = (key: string) => `${key}-01`

type Part = 'rent' | 'water' | 'parking'
type Parts = Record<Part, number>

const WATER = /vesi|water|vatten/
const RENT = /vuokra|\brent\b|hyra|miete/
const PARKING = /autopaik|parking|pysäköin|\bap ?\d/

/**
 * A water settlement (vesitasaus) or what is paid towards one: "Vesitasaus 31.10.2023",
 * "VEDENTASAUS", "vesihyvitys", "vesimaksun loppuosa", "40e puuttuvaa vesimaksua", "puuttuneista
 * vesimaksuista". Real texts have the typo "Vesitataus".
 */
const WATER_SETTLEMENT =
  /vesitas|vedentas|vesitat|vesihyvit|vesimaksun loppuosa|puuttu\w*\s+vesimaks|vesimaksu(?:n|jen)\s+palautus|water\s+(?:settlement|refund)|vattenutjämning/

export function isWaterSettlementText(text: string | undefined): boolean {
  return WATER_SETTLEMENT.test((text ?? '').toLowerCase())
}

/** A rent payment's own words ("Vuokra 630e", "VUOKRA + VESI"), not "vuokravakuus". */
export function mentionsRent(text: string | undefined): boolean {
  return /\bvuokra\b|\brent\b|\bhyra\b|\bmiete\b/.test((text ?? '').toLowerCase())
}

/**
 * Which part of the payment a line is. Most tenants pay one line ("vuokra + vesi"), which is
 * rent; a line about water only is water, about parking only is parking.
 */
function partOf(row: SuggestIncome, parkingObject: boolean): Part {
  const text = (row.text ?? '').toLowerCase()
  if (WATER.test(text) && !RENT.test(text)) return 'water'
  if (!parkingObject && PARKING.test(text) && !RENT.test(text)) return 'parking'
  return 'rent'
}

/**
 * Monthly totals per part, oldest first. Water settlements are one-offs, not rent: months that
 * carry one (also "vuokra 630 + 40 puuttuvaa vesimaksua") are left out, so they make no step.
 */
function monthlyTotals(rows: SuggestIncome[], parkingObject: boolean): [string, Parts][] {
  const totals = new Map<string, Parts>()
  for (const row of rows) {
    if (isWaterSettlementText(row.text)) continue
    const key = monthKey(row.date)
    const parts = totals.get(key) ?? { rent: 0, water: 0, parking: 0 }
    parts[partOf(row, parkingObject)] += row.amount_snt
    totals.set(key, parts)
  }
  return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

const partsKey = (p: Parts) => `${p.rent}/${p.water}/${p.parking}`

function stepOf(from: string, p: Parts): LeaseRent {
  const step: LeaseRent = { from, rent_snt: p.rent }
  if (p.water) step.water_snt = p.water
  if (p.parking) step.parking_snt = p.parking
  return step
}

/**
 * Rent steps from monthly totals: the same payment two months in a row starts a step. The first
 * step starts with the lease; with no repeat, the most common payment is the one step.
 */
function rentSteps(totals: [string, Parts][], starts: string): LeaseRent[] {
  const steps: { key: string; step: LeaseRent }[] = []
  for (let i = 0; i + 1 < totals.length; i++) {
    const [month, parts] = totals[i]
    const key = partsKey(parts)
    if (parts.rent + parts.water + parts.parking <= 0 || partsKey(totals[i + 1][1]) !== key) continue
    if (steps.length && steps[steps.length - 1].key === key) continue
    steps.push({ key, step: stepOf(steps.length ? firstOfMonth(month) : starts, parts) })
  }
  if (!steps.length) {
    const counts = new Map<string, { n: number; parts: Parts }>()
    for (const [, parts] of totals) {
      if (parts.rent + parts.water + parts.parking <= 0) continue
      const key = partsKey(parts)
      counts.set(key, { n: (counts.get(key)?.n ?? 0) + 1, parts })
    }
    const common = [...counts.values()].sort((a, b) => b.n - a.n || b.parts.rent - a.parts.rent)[0]
    if (common) return [stepOf(starts, common.parts)]
  }
  return steps.map((s) => s.step).filter((s, i) => i === 0 || s.from > starts)
}

const within = (date: string, starts: string, ends: string | undefined) => date >= starts && (!ends || date <= ends)

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const dayBefore = (date: string) => addDays(date, -1)

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

export function suggestLeases(input: SuggestInput): LeaseSuggestion[] {
  const { docs, names, asOf } = input
  const income = input.income.filter((r) => r.date <= asOf).sort((a, b) => a.date.localeCompare(b.date))
  const ignore = new Set(words(input.centreName))
  const lastIncome = income.length ? income[income.length - 1].date : null
  const candidates = [...new Set(income.flatMap((r) => (r.partner_id != null ? [r.partner_id] : [])))].filter(
    (id) => !ON_BEHALF.test(names.get(id) ?? ''),
  )

  const contracts = docs
    .filter((d) => docKind(d.title).contract)
    .map((doc) => ({ doc, period: titlePeriod(doc.title) }))
  const paidMonths = (id: number, rows = income) => new Set(rows.filter((r) => r.partner_id === id).map((r) => monthKey(r.date)))
  const firstPaid = (id: number) => income.find((r) => r.partner_id === id)?.date
  /** Payers the title names (a person can pay under two bank names). */
  const namedIn = (title: string): number[] => {
    const titleWords = new Set(words(title))
    const joined = words(title).join('')
    return candidates.filter((id) => nameScore(names.get(id) ?? '', titleWords, joined, ignore) > 0)
  }

  // Contract starts: the title's date, else the first payment of a payer it names, else the document's date.
  const drafts = contracts
    .map(({ doc, period }) => {
      const named = namedIn(doc.title)
      const paid = named.flatMap((id) => firstPaid(id) ?? []).sort()
      const starts = period.starts ?? (paid.length ? firstOfMonth(monthKey(paid[0])) : doc.date)
      // The named payer with the most months is the tenant.
      const tenant = [...named].sort((a, b) => paidMonths(b).size - paidMonths(a).size)[0]
      return { doc, starts, ends: period.ends, named: tenant }
    })
    .sort((a, b) => a.starts.localeCompare(b.starts) || a.doc.voucher_id - b.doc.voucher_id)
  const firstIncome = income.find((r) => r.amount_snt > 0)?.date
  const stopsAt = lastIncome && monthKey(lastIncome) < monthKey(asOf) ? monthEnd(monthKey(lastIncome)) : undefined
  const periodEnd = (from: number, starts: string, titleEnd: string | undefined, cutters: typeof drafts) => {
    const next = cutters.slice(from + 1).find((d) => d.starts > starts)
    return titleEnd ?? (next ? dayBefore(next.starts) : stopsAt)
  }

  // Pass 1, the tenants. No name in the title: the payer with the most months in the period,
  // if they started paying with this contract (not months before it).
  const tenants = drafts.map((draft, i) => {
    if (draft.named != null) return draft.named
    const inPeriod = income.filter((r) => within(r.date, draft.starts, periodEnd(i, draft.starts, draft.ends, drafts)))
    const notBefore = addDays(draft.starts, -62)
    return candidates
      .filter((id) => paidMonths(id, inPeriod).size > 0 && (firstPaid(id) ?? '') >= notBefore)
      .sort((a, b) => paidMonths(b, inPeriod).size - paidMonths(a, inPeriod).size)[0]
  })
  // Pass 2, the periods. A contract without a tenant (an extra document, a parking space on the
  // flat's cost centre) does not end the lease before it, and its period covers no payments.
  const withTenant = drafts.filter((_, i) => tenants[i] != null)
  const out: LeaseSuggestion[] = []
  const coverage: Lease[] = []
  drafts.forEach((draft, i) => {
    const tenant = tenants[i]
    let ends = periodEnd(withTenant.indexOf(draft), draft.starts, draft.ends, tenant != null ? withTenant : [...withTenant, draft])
    // A contract that ended before the books begin has nothing to show for it.
    if (ends && firstIncome && ends < firstIncome) return
    // A new payer carrying on after the tenant stopped: the lease ends with the tenant's last month.
    if (tenant != null && !draft.ends) {
      const inPeriod = income.filter((r) => within(r.date, draft.starts, ends))
      const own = [...paidMonths(tenant, inPeriod)].sort()
      const last = own[own.length - 1]
      const takenOver =
        own.length >= 2 && candidates.some((id) => id !== tenant && [...paidMonths(id, inPeriod)].filter((k) => k > last).length >= 2)
      if (takenOver) ends = monthEnd(last)
    }
    const inPeriod = income.filter((r) => within(r.date, draft.starts, ends))
    const lease: Lease = { key: '', starts: draft.starts, due_day: DEFAULT_DUE_DAY, rents: rentSteps(monthlyTotals(inPeriod, input.parkingObject), draft.starts) }
    if (ends && ends >= draft.starts) lease.ends = ends
    if (tenant != null) {
      lease.tenant_partner_id = tenant
      coverage.push(lease)
    }
    lease.doc_voucher_id = draft.doc.voucher_id
    out.push({ lease, source: 'contract' })
  })

  // Rent-increase notices mark the step nearest their date.
  for (const doc of docs.filter((d) => docKind(d.title).increase)) {
    const date = increaseDate(doc.title) ?? doc.date
    let best: { step: LeaseRent; days: number } | undefined
    for (const { lease } of out) {
      for (const step of lease.rents) {
        const days = daysBetween(step.from, date)
        if (step.voucher_id == null && days <= 62 && (!best || days < best.days)) best = { step, days }
      }
    }
    if (best) best.step.voucher_id = doc.voucher_id
  }

  // Payments outside every contract's period: one suggestion per payer's run (a gap over 2 months ends it).
  const covered = (date: string) => coverage.some((lease) => within(date, lease.starts, lease.ends))
  for (const id of candidates) {
    const rows = income.filter((r) => r.partner_id === id && !covered(r.date) && r.amount_snt > 0)
    let run: SuggestIncome[] = []
    const flush = () => {
      if (new Set(run.map((r) => monthKey(r.date))).size >= 2) {
        const starts = firstOfMonth(monthKey(run[0].date))
        const lastKey = monthKey(run[run.length - 1].date)
        const lease: Lease = { key: '', tenant_partner_id: id, starts, due_day: DEFAULT_DUE_DAY, rents: rentSteps(monthlyTotals(run, input.parkingObject), starts) }
        const nextContract = withTenant.find((d) => d.starts > starts)
        if (nextContract && monthKey(nextContract.starts) > lastKey) lease.ends = dayBefore(nextContract.starts)
        else if (lastKey < monthKey(asOf)) lease.ends = monthEnd(lastKey)
        out.push({ lease, source: 'payments' })
      }
      run = []
    }
    for (const row of rows) {
      const prev = run[run.length - 1]
      if (prev && monthsApart(prev.date, row.date) > 2) flush()
      run.push(row)
    }
    flush()
  }

  return out.sort((a, b) => a.lease.starts.localeCompare(b.lease.starts))
}

function monthsApart(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Whether a stored lease already stands for a suggestion: the same contract, or the same tenant starting near it. */
export function representedBy(stored: Lease[], suggestion: Lease): boolean {
  return stored.some(
    (s) =>
      (suggestion.doc_voucher_id != null && s.doc_voucher_id === suggestion.doc_voucher_id) ||
      (suggestion.tenant_partner_id != null &&
        s.tenant_partner_id === suggestion.tenant_partner_id &&
        daysBetween(s.starts, suggestion.starts) <= 62),
  )
}
