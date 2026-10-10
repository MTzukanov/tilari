/** Loads ledger + stored documents and assembles the portfolio, one object, or the setup view. */
import { getPeriods } from '../../../access'
import { BookError } from '../../../errors'
import { readTilariData, readTilariDataPrefix, writeTilariData } from '../../../kernel/tilariData'
import type { SqliteDb } from '../../../sqlite'
import { disposalCandidates, saleShares } from './classify'
import {
  costCentreIdFromKey,
  mergePortfolioSettings,
  mergePropertyDoc,
  normalizePortfolioSettings,
  normalizePropertyDoc,
  parsePortfolioSettings,
  parsePropertyDoc,
  PropertyDocError,
  propertyKey,
  serializeDoc,
  type ParsedDoc,
} from './doc'
import { listNoteVouchers } from './documents'
import { kindFromName } from './kind'
import {
  loadAccountNumbers,
  loadCapitalEraRoots,
  loadCorrectionDates,
  loadCostCentres,
  loadDataThrough,
  loadEraRoots,
  loadEntries,
  loadEraRows,
  loadInterestRows,
  loadPnlRows,
  loadVoucherPnlRows,
  loadVoucherRefs,
  type CostCentre,
  type EraRoot,
  type EraRow,
  type PnlRow,
} from './ledger'
import { saleNet, toBp, xirr, yieldBp, type Flow } from './returns'
import { defaultAsOf } from './series'
import { allocationSet, computeObject, resolveSaleCosts, type CountedLine, type ObjectResult } from './summary'
import { pickBest, suggestEra, textScorer } from './suggest'
import {
  PORTFOLIO_KEY,
  PROPERTY_KEY_PREFIX,
  type PortfolioResponse,
  type MonthLine,
  type PortfolioSettings,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyRow,
  type SetupApplyInput,
  type SetupResponse,
} from './types'

type Loaded = {
  centres: CostCentre[]
  docs: Map<number, ParsedDoc<PropertyDoc>>
  settings: ParsedDoc<PortfolioSettings>
  /** eraid -> cost centre id, over every stored document. */
  owner: Map<number, number>
  /** Loan account -> cost centres whose bank loan it is (Pankkilaina); one, unless saved before the guard. */
  loanOwners: Map<number, number[]>
}

function loadStored(db: SqliteDb): Loaded {
  const centres = loadCostCentres(db)
  const docs = new Map<number, ParsedDoc<PropertyDoc>>()
  for (const row of readTilariDataPrefix(db, PROPERTY_KEY_PREFIX)) {
    const id = costCentreIdFromKey(row.key)
    if (id != null) docs.set(id, parsePropertyDoc(row.value))
  }
  const owner = new Map<number, number>()
  const loanOwners = new Map<number, number[]>()
  for (const [id, parsed] of docs) {
    for (const era of parsed.doc.eras) owner.set(era.eraid, id)
    for (const account of parsed.doc.financing?.loan_accounts ?? []) {
      loanOwners.set(account, [...(loanOwners.get(account) ?? []), id])
    }
  }
  return { centres, docs, settings: parsePortfolioSettings(readTilariData(db, PORTFOLIO_KEY)), owner, loanOwners }
}

function docFor(loaded: Loaded, id: number): ParsedDoc<PropertyDoc> {
  return loaded.docs.get(id) ?? parsePropertyDoc(null)
}

function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

type Computed = { centre: CostCentre; parsed: ParsedDoc<PropertyDoc>; result: ObjectResult }

function computeObjects(
  db: SqliteDb,
  loaded: Loaded,
  centres: CostCentre[],
  asOf: string,
  targetBp?: number | null,
): Computed[] {
  const allocations = new Set<number>()
  for (const c of centres) for (const a of allocationSet(c)) allocations.add(a)
  const pnlByAllocation = groupBy(loadPnlRows(db, allocations), (r) => r.allocation)

  const linkedEraids = [...loaded.owner.keys()]
  const allEraRows = loadEraRows(db, linkedEraids)
  const eraRowsById = groupBy(allEraRows, (r) => r.eraid)
  const roots = new Map(loadEraRoots(db, linkedEraids).map((r) => [r.eraid, r]))

  const voucherPnl = groupBy(loadVoucherPnlRows(db, disposalCandidates(allEraRows)), (r) => r.voucher_id)
  const centreInfo = new Map(loaded.centres.map((c) => [c.id, { name: c.name, allocations: allocationSet(c) }]))
  const shares = saleShares(allEraRows, loaded.owner, centreInfo, voucherPnl)
  const allPnl = [...pnlByAllocation.values()].flat()
  const correctionDates = loadCorrectionDates(
    db,
    new Set(allPnl.filter((r) => r.voucher_type === 0).map((r) => r.voucher_id)),
  )
  const periods = getPeriods(db).map((p) => ({ starts: p.starts, ends: p.ends }))

  return centres.map((centre) => {
    const parsed = docFor(loaded, centre.id)
    const own = allocationSet(centre)
    const pnl = [...own].flatMap((a) => pnlByAllocation.get(a) ?? []).sort(byDate)
    const eraRows = parsed.doc.eras.flatMap((e) => eraRowsById.get(e.eraid) ?? []).sort(byDate)
    const financing = parsed.doc.financing
    const interest = financing
      ? loadInterestRows(db, financing.interest_accounts, financing.loan_accounts, own)
      : []
    const result = computeObject({
      centre,
      doc: parsed.doc,
      settings: loaded.settings.doc,
      eraRows,
      eraRoots: roots,
      pnl,
      correctionDates,
      voucherPnl,
      saleShares: shares,
      interest,
      periods,
      asOf,
      targetBp,
    })
    const shared = (financing?.loan_accounts ?? []).find((a) => (loaded.loanOwners.get(a) ?? []).some((o) => o !== centre.id))
    if (shared != null) result.warnings.push({ code: 'loan_shared', params: { account: shared } })
    return { centre, parsed, result }
  })
}

function byDate(a: { date: string; id: number }, b: { date: string; id: number }): number {
  return a.date.localeCompare(b.date) || a.id - b.id
}

function toRow(c: Computed): PropertyRow {
  const { centre, parsed, result } = c
  const warnings = [...result.warnings]
  if (parsed.corrupt) warnings.unshift({ code: 'doc_corrupt' })
  else if (parsed.read_only) warnings.unshift({ code: 'doc_newer' })
  return {
    id: centre.id,
    name: centre.name,
    starts: centre.starts,
    ends: centre.ends,
    configured: parsed.exists,
    kind: parsed.doc.kind ?? null,
    status: result.status,
    summary: result.summary,
    t12m: result.t12m,
    returns: result.returns,
    break_even: result.break_even,
    valuation: result.valuation,
    cash_years: result.cash_years,
    warnings,
  }
}

function resolveAsOf(db: SqliteDb, today: string, asOf?: string | null): { asOf: string; dataThrough: string | null } {
  const dataThrough = loadDataThrough(db)
  return { asOf: asOf || defaultAsOf(today, dataThrough), dataThrough }
}

export function computePortfolio(db: SqliteDb, opts: { today: string; asOf?: string | null }): PortfolioResponse {
  const loaded = loadStored(db)
  const { asOf, dataThrough } = resolveAsOf(db, opts.today, opts.asOf)
  const centres = loaded.centres.filter((c) => !docFor(loaded, c.id).doc.excluded)
  const computed = computeObjects(db, loaded, centres, asOf)
  const rows = computed.map(toRow)

  const holding = computed.filter((c) => c.result.status === 'active' || c.result.status === 'partly_sold')
  const bookValue = holding.reduce((s, c) => s + c.result.summary.book_value_snt, 0)
  const t12mNet = holding.reduce((s, c) => s + (c.result.t12m?.net_snt ?? 0), 0)
  const portfolioFlows: Flow[] = []
  const heldFlows: Flow[] = []
  const soldFlows: Flow[] = []
  for (const c of computed) {
    if (c.result.status === 'unlinked' || c.result.status === 'excluded') continue
    portfolioFlows.push(...c.result.cash)
    if (c.result.status === 'sold') {
      soldFlows.push(...c.result.cash)
      continue
    }
    const { costs } = resolveSaleCosts(c.parsed.doc, loaded.settings.doc)
    if (c.result.summary.book_value_snt > 0) {
      portfolioFlows.push({ date: asOf, amount_snt: saleNet(c.result.summary.book_value_snt, costs) })
    }
    // Held objects: sold now at the owner's estimate, else at book value (as their own IRR).
    const exit = c.result.valuation?.price_snt ?? c.result.summary.book_value_snt
    heldFlows.push(...c.result.cash)
    if (exit > 0) heldFlows.push({ date: asOf, amount_snt: saleNet(exit, costs) })
  }
  const linkedRows = computed.filter((c) => c.result.status !== 'unlinked')
  return {
    as_of: asOf,
    data_through: dataThrough,
    settings: loaded.settings.doc,
    periods: getPeriods(db)
      .filter((p) => p.starts <= asOf)
      .map((p) => ({ starts: p.starts, ends: p.ends })),
    rows,
    undecided: loaded.centres.filter((c) => !loaded.docs.has(c.id)).length,
    totals: {
      invested_snt: linkedRows.reduce((s, c) => s + c.result.summary.invested_snt, 0),
      book_value_snt: bookValue,
      operating_net_snt: computed.reduce((s, c) => s + c.result.summary.operating.net_snt, 0),
      t12m_net_snt: t12mNet,
      unrecovered_snt: holding.reduce((s, c) => s + c.result.summary.unrecovered_snt, 0),
      net_yield_bp: yieldBp(t12mNet, bookValue),
      irr_bp: toBp(xirr(portfolioFlows).rate),
      held_irr_bp: toBp(xirr(heldFlows).rate),
      sold_irr_bp: toBp(xirr(soldFlows).rate),
    },
  }
}

export function computeDetail(
  db: SqliteDb,
  id: number,
  opts: { today: string; asOf?: string | null; targetBp?: number | null },
): PropertyDetail {
  const loaded = loadStored(db)
  const centre = loaded.centres.find((c) => c.id === id)
  if (!centre) throw new BookError('not_found', 404)
  const { asOf, dataThrough } = resolveAsOf(db, opts.today, opts.asOf)
  const [computed] = computeObjects(db, loaded, [centre], asOf, opts.targetBp)
  return {
    ...toRow(computed),
    child_ids: centre.child_ids,
    doc: computed.parsed.doc,
    read_only: computed.parsed.read_only && !computed.parsed.corrupt,
    as_of: asOf,
    data_through: dataThrough,
    eras: computed.result.eras,
    disposals: computed.result.classified.disposals,
    months: computed.result.months,
    month_lines: monthLines(db, computed.result.lines),
    years: computed.result.years,
    target: computed.result.target,
    financing: computed.parsed.doc.financing ?? null,
  }
}

function monthLines(db: SqliteDb, lines: CountedLine[]): MonthLine[] {
  const entries = loadEntries(db, lines.map((l) => l.id))
  return lines.flatMap(({ id, ...line }) => {
    const entry = entries.get(id)
    return entry ? [{ ...line, entry }] : []
  })
}

export function requireCostCentre(db: SqliteDb, id: number): CostCentre {
  const centre = loadCostCentres(db).find((c) => c.id === id)
  if (!centre) throw new BookError('not_found', 404)
  return centre
}

/** Write-side checks against the ledger; fills each item's account from its root line. */
function checkLinks(db: SqliteDb, id: number, doc: PropertyDoc, loaded: Pick<Loaded, 'owner' | 'loanOwners'>): PropertyDoc {
  const { owner, loanOwners } = loaded
  const roots = new Map(loadEraRoots(db, doc.eras.map((e) => e.eraid)).map((r) => [r.eraid, r]))
  const eras = doc.eras.map((link, i) => {
    const root = roots.get(link.eraid)
    if (!root || !root.account_type.startsWith('A')) throw new PropertyDocError('invalid_field', `eras[${i}].eraid`)
    const other = owner.get(link.eraid)
    if (other != null && other !== id) throw new PropertyDocError('era_linked', `eras[${i}].eraid`, 400)
    return { eraid: link.eraid, account: root.account }
  })
  const vouchers = loadVoucherRefs(db, [...(doc.doc_voucher_ids ?? []), ...(doc.sale_voucher_ids ?? [])])
  ;(['doc_voucher_ids', 'sale_voucher_ids'] as const).forEach((key) => {
    ;(doc[key] ?? []).forEach((voucherId, i) => {
      if (!vouchers.get(voucherId)?.posted) throw new PropertyDocError('invalid_field', `${key}[${i}]`)
    })
  })
  if (doc.financing) {
    const accounts = loadAccountNumbers(db)
    for (const key of ['loan_accounts', 'interest_accounts'] as const) {
      doc.financing[key].forEach((n, i) => {
        if (!accounts.has(n)) throw new PropertyDocError('invalid_field', `financing.${key}[${i}]`)
      })
    }
    // One loan, one object: on two, its interest would count twice in the portfolio.
    for (const account of doc.financing.loan_accounts) {
      if ((loanOwners.get(account) ?? []).some((other) => other !== id)) {
        throw new PropertyDocError('loan_linked', String(account), 400)
      }
    }
  }
  return { ...doc, eras }
}

/** Save one object's document. Returns true when the stored value changed. */
export function saveProperty(db: SqliteDb, id: number, input: unknown, now: string): boolean {
  requireCostCentre(db, id)
  const loaded = loadStored(db)
  const doc = checkLinks(db, id, normalizePropertyDoc(input), loaded)
  const merged = mergePropertyDoc(docFor(loaded, id), doc, now)
  if (!merged) return false
  return writeTilariData(db, propertyKey(id), serializeDoc(merged), now)
}

export function deleteProperty(db: SqliteDb, id: number): boolean {
  return writeTilariData(db, propertyKey(id), null)
}

export function getPortfolioSettings(db: SqliteDb): PortfolioSettings {
  return parsePortfolioSettings(readTilariData(db, PORTFOLIO_KEY)).doc
}

export function savePortfolioSettings(db: SqliteDb, input: unknown, now: string): boolean {
  const stored = parsePortfolioSettings(readTilariData(db, PORTFOLIO_KEY))
  const merged = mergePortfolioSettings(stored, normalizePortfolioSettings(input), now)
  if (!merged) return false
  return writeTilariData(db, PORTFOLIO_KEY, serializeDoc(merged), now)
}

export function buildSetup(db: SqliteDb): SetupResponse {
  const loaded = loadStored(db)
  const roots = loadCapitalEraRoots(db)
  // Keep linked items listed even when their account no longer qualifies.
  const missingLinked = [...loaded.owner.keys()].filter((id) => !roots.some((r) => r.eraid === id))
  const allRoots: EraRoot[] = [...roots, ...loadEraRoots(db, missingLinked)]
  const eraRows: EraRow[] = loadEraRows(db, allRoots.map((r) => r.eraid))
  const touched = new Set<number>([...eraRows.map((r) => r.voucher_id), ...allRoots.map((r) => r.voucher_id)])
  const voucherPnl = groupBy(loadVoucherPnlRows(db, touched), (r: PnlRow) => r.voucher_id)
  const scorer = textScorer(loaded.centres.map((c) => ({ id: c.id, name: c.name })))
  const dismissed = new Set(loaded.settings.doc.dismissed ?? [])
  const balances = new Map<number, number>()
  for (const row of eraRows) balances.set(row.eraid, (balances.get(row.eraid) ?? 0) + row.signed_snt)

  const eras = allRoots.map((root) => {
    const linkedTo = loaded.owner.get(root.eraid) ?? null
    const suggestion =
      linkedTo == null && !dismissed.has(`era:${root.eraid}`)
        ? suggestEra(root, { centres: loaded.centres, roots: allRoots, eraRows, voucherPnl, scorer })
        : null
    return {
      eraid: root.eraid,
      account: root.account,
      account_name: root.account_name,
      date: root.date,
      voucher_id: root.voucher_id,
      description: root.description || root.voucher_title,
      balance_snt: balances.get(root.eraid) ?? 0,
      linked_to: linkedTo,
      suggestion,
    }
  })

  const docLinks = new Map<number, number[]>()
  for (const [id, parsed] of loaded.docs) {
    for (const voucherId of parsed.doc.doc_voucher_ids ?? []) docLinks.set(voucherId, [...(docLinks.get(voucherId) ?? []), id])
  }
  const docs = listNoteVouchers(db).map((note) => {
    const linkedTo = docLinks.get(note.voucher_id) ?? []
    let suggestion = null
    if (!linkedTo.length && !dismissed.has(`doc:${note.voucher_id}`)) {
      const picked = pickBest(scorer(note.title))
      if (picked.candidates.length) suggestion = { cost_centre_id: picked.id, candidates: picked.candidates }
    }
    return { ...note, linked_to: linkedTo, suggestion }
  })

  return {
    cost_centres: loaded.centres.map((c) => {
      const parsed = docFor(loaded, c.id)
      return {
        id: c.id,
        name: c.name,
        starts: c.starts,
        ends: c.ends,
        configured: parsed.exists,
        excluded: Boolean(parsed.doc.excluded),
        kind: parsed.doc.kind ?? null,
        suggested_kind: kindFromName(c.name),
        eras: parsed.doc.eras.map((e) => e.eraid),
        docs: parsed.doc.doc_voucher_ids ?? [],
      }
    }),
    eras,
    docs,
    dismissed: [...dismissed].sort(),
  }
}

/** Apply the setup wizard: per-object changes merged into stored documents, in one write. */
export function applySetup(db: SqliteDb, input: SetupApplyInput, now: string): number {
  if (!input || !Array.isArray(input.objects)) throw new PropertyDocError('invalid_field', 'objects')
  const loaded = loadStored(db)
  const centres = new Map(loaded.centres.map((c) => [c.id, c]))
  const owner = new Map(loaded.owner)
  const next = new Map<number, PropertyDoc>()
  const docOf = (id: number) => next.get(id) ?? structuredClone(docFor(loaded, id).doc)

  // Removals first, so an item can move from one object to another in the same apply.
  input.objects.forEach((obj, i) => {
    if (!centres.has(obj.id)) throw new PropertyDocError('invalid_field', `objects[${i}].id`)
    const doc = docOf(obj.id)
    const remove = new Set(obj.remove_eras ?? [])
    for (const eraid of remove) if (owner.get(eraid) === obj.id) owner.delete(eraid)
    doc.eras = doc.eras.filter((e) => !remove.has(e.eraid))
    const removeDocs = new Set(obj.remove_docs ?? [])
    doc.doc_voucher_ids = (doc.doc_voucher_ids ?? []).filter((v) => !removeDocs.has(v))
    next.set(obj.id, doc)
  })
  const added = input.objects.flatMap((obj) => obj.add_eras ?? [])
  const rootAccount = new Map(loadEraRoots(db, added).map((r) => [r.eraid, r.account]))
  input.objects.forEach((obj, i) => {
    const doc = next.get(obj.id)!
    if (obj.excluded != null) {
      if (obj.excluded) doc.excluded = true
      else delete doc.excluded
    }
    if (obj.kind !== undefined) {
      if (obj.kind) doc.kind = obj.kind
      else delete doc.kind
    }
    for (const eraid of obj.add_eras ?? []) {
      const other = owner.get(eraid)
      if (other != null && other !== obj.id) throw new PropertyDocError('era_linked', `objects[${i}].add_eras`, 400)
      const account = rootAccount.get(eraid)
      if (account == null) throw new PropertyDocError('invalid_field', `objects[${i}].add_eras`)
      owner.set(eraid, obj.id)
      if (!doc.eras.some((e) => e.eraid === eraid)) doc.eras.push({ eraid, account })
    }
    doc.doc_voucher_ids = [...new Set([...(doc.doc_voucher_ids ?? []), ...(obj.add_docs ?? [])])]
  })

  let changed = 0
  for (const [id, doc] of next) {
    // Setup never changes a bank loan, so an older double link does not block it.
    const checked = checkLinks(db, id, normalizePropertyDoc(doc), { owner, loanOwners: new Map() })
    const merged = mergePropertyDoc(docFor(loaded, id), checked, now)
    if (merged && writeTilariData(db, propertyKey(id), serializeDoc(merged), now)) changed += 1
  }
  if (input.dismiss?.length) {
    const settings = loaded.settings.doc
    const dismissed = [...new Set([...(settings.dismissed ?? []), ...input.dismiss])]
    if (savePortfolioSettings(db, { ...settings, dismissed }, now)) changed += 1
  }
  return changed
}
