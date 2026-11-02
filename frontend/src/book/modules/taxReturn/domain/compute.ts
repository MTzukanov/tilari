/**
 * The 6B from the ledger: posted vouchers only, nothing written. Every figure keeps the accounts behind it,
 * and differences are shown to the cent, never rounded away. The OmaVero text and the Ilmoitin file both
 * render this one result, so they cannot disagree.
 */
import { getSettings } from '../../../access'
import { asCents } from '../../../cents'
import { requireFiscalPeriodByEnd } from '../../../fiscalPeriod'
import { bsAccount, pnlAccount, postedOnly } from '../../../kernel/sqlFragments'
import yritysChart from '../../../newBook/vendor/yritys.json'
import type { SqliteDb } from '../../../sqlite'
import { computeTaxBasis, taxFromBasis } from '../../../taxBasis'
import { TYPE_INCOME_TAX } from '../../../vouchers'
import {
  ALL_GROUPS,
  ANSWERS,
  DEBT_CODES,
  DEDUCTIBLE_COST_CODES,
  FINANCIAL_ASSET_CODES,
  FIXED_ASSET_CODES,
  INVENTORY_CODES,
  LOSS_EXCLUSION_CODE,
  OTHER_ASSET_CODES,
  PNL_GROUPS,
  RESULT_TOTALS,
  TAXABLE_INCOME_CODES,
  openAnswers,
  type RowDef,
  type Side,
} from './fields6b'
import { readInputs, readOverrides } from './inputs'
import {
  BANK_OVERDRAFT_CODE,
  SALE,
  debtTerm,
  isBankAccount,
  placeBalanceSheet,
  placeIncomeStatement,
  type Placement,
} from './mapping'
import type { AccountLine, CheckView, FormNeed, GroupView, RowView, TaxReturnInputs, TaxReturnView } from './types'

/** Kitsas's account for a decided dividend; a debit there after the year end is a distribution. */
const DIVIDEND_ACCOUNT = 2261

const STANDARD_ACCOUNTS: ReadonlySet<number> = new Set(
  (yritysChart.tilit as { numero: number; tyyppi: string }[]).filter((a) => !a.tyyppi.startsWith('H')).map((a) => a.numero),
)

type AccountRow = { account: number; type: string; name: string; d: number; k: number }

function accountRows(db: SqliteDb, filter: string, params: string[]): AccountRow[] {
  return db
    .all<{ account: number; type: string | null; name: string | null; d: number; k: number }>(
      `SELECT Vienti.tili AS account, Tili.tyyppi AS type,
              COALESCE(json_extract(Tili.json, '$.nimi.fi'), json_extract(Tili.json, '$.nimi.en'), '') AS name,
              COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       LEFT JOIN Tili ON Vienti.tili = Tili.numero
       WHERE ${postedOnly()} AND ${filter}
       GROUP BY Vienti.tili`,
      params,
    )
    .map((row) => ({
      account: Number(row.account),
      type: String(row.type ?? ''),
      name: String(row.name ?? ''),
      d: asCents(row.d),
      k: asCents(row.k),
    }))
}

/** Income and equity grow by credits; costs and assets by debits. */
function signFor(side: Side): number {
  return side === 'income' || side === 'taxfree' || side === 'debt' || side === 'equity' ? 1 : -1
}

type Draft = { row: RowDef; side: Side; book: number; taxBase: number; accounts: AccountLine[]; priorResults: number | null }

function line(account: AccountRow, cents: number, placement: Placement): AccountLine {
  return {
    account: account.account,
    name: account.name,
    cents,
    source: placement.source,
    custom: placement.source === 'chart' && !STANDARD_ACCOUNTS.has(account.account),
  }
}

function sum(values: Record<string, number>, codes: number[]): number {
  return codes.reduce((total, code) => total + (values[code] ?? 0), 0)
}

export type ComputeOptions = { today: string }

export function computeTaxReturn(db: SqliteDb, ends: string, options: ComputeOptions): TaxReturnView {
  const period = requireFiscalPeriodByEnd(db, ends)
  const { starts } = period
  const overrides = readOverrides(db)
  const { inputs, saved, carried_from } = readInputs(db, ends)
  const settings = getSettings(db, ['Nimi', 'Ytunnus', 'VeroYhteysHenkilo', 'VeroYhteysPuhelin'])

  const drafts = new Map<number, Draft>()
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      drafts.set(row.code, { row, side: group.side, book: 0, taxBase: 0, accounts: [], priorResults: null })
    }
  }

  const unplaced: AccountLine[] = []
  const saleLines: AccountLine[] = []
  let saleNet = 0

  const incomeRows = accountRows(db, `${pnlAccount()} AND Vienti.pvm >= ? AND Vienti.pvm <= ?`, [starts, ends])
  let bookResult = 0
  for (const account of incomeRows) {
    const credit = account.k - account.d
    if (!credit && !account.d) continue
    bookResult += credit
    if (!credit) continue
    const placement = placeIncomeStatement(account.account, account.type, overrides)
    if (placement.code === SALE) {
      saleNet += credit
      saleLines.push(line(account, credit, placement))
      continue
    }
    const draft = placement.code == null ? undefined : drafts.get(placement.code)
    if (!draft) {
      unplaced.push(line(account, credit, placement))
      continue
    }
    const cents = credit * signFor(draft.side)
    draft.book += cents
    if (!placement.notInTax) draft.taxBase += cents
    draft.accounts.push(line(account, cents, placement))
  }

  const balanceRows = accountRows(db, `${bsAccount()} AND Vienti.pvm <= ?`, [ends])
  let longTerm = 0
  let shortTerm = 0
  let previousProfit = 0
  const previousLines: AccountLine[] = []
  for (const account of balanceRows) {
    const debit = account.d - account.k
    if (!debit) continue
    let placement = placeBalanceSheet(account.account, overrides)
    if (placement.source !== 'override' && isBankAccount(account.account) && debit < 0) {
      placement = { code: BANK_OVERDRAFT_CODE, source: 'moved' }
    }
    if (placement.code === 474) {
      previousProfit -= debit
      previousLines.push(line(account, -debit, placement))
      continue
    }
    const draft = placement.code == null || placement.code === SALE ? undefined : drafts.get(placement.code)
    if (!draft) {
      unplaced.push(line(account, -debit, placement))
      continue
    }
    const cents = draft.side === 'asset' ? debit : -debit
    draft.book += cents
    draft.taxBase += cents
    draft.accounts.push(line(account, cents, placement))
    if (draft.side === 'debt') {
      if (debtTerm(account.account) === 'long' && placement.source !== 'moved') longTerm += cents
      else shortTerm += cents
    }
  }

  const priorResults = accountRows(db, `${pnlAccount()} AND Vienti.pvm < ?`, [starts]).reduce((total, a) => total + a.k - a.d, 0)
  previousProfit += priorResults

  const gains = inputs.sales ? inputs.sales.gains_cents : Math.max(saleNet, 0)
  const losses = inputs.sales ? inputs.sales.losses_cents : Math.max(-saleNet, 0)
  const applySale = (code: number, cents: number) => {
    const draft = drafts.get(code)
    if (!draft) return
    draft.book += cents
    draft.taxBase += cents
    if (cents) draft.accounts.push(...saleLines)
  }
  applySale(261, gains)
  applySale(270, losses)

  const setEquity = (profit: number, lossCode: number, profitCode: number, lines: AccountLine[], prior: number | null) => {
    const target = drafts.get(profit >= 0 ? profitCode : lossCode)
    if (!target) return
    const amount = Math.abs(profit)
    target.book = amount
    target.taxBase = amount
    target.accounts = lines
    target.priorResults = prior
  }
  setEquity(previousProfit, 475, 474, previousLines, priorResults)
  setEquity(bookResult, 477, 476, [], null)

  // Final figures: the ledger's, or what the owner typed instead. Half of entertainment is deductible.
  const values: Record<string, number> = {}
  const usedManual: number[] = []
  const pick = (code: number, computed: number): number => {
    const typed = inputs.manual[code]
    if (typed != null) usedManual.push(code)
    const value = typed ?? computed
    values[code] = value
    return value
  }
  const groups: GroupView[] = ALL_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    totals: [],
    rows: group.rows.map((row): RowView => {
      const draft = drafts.get(row.code)
      const book = pick(row.code, draft?.book ?? 0)
      const taxBase = draft?.taxBase ?? 0
      const taxComputed = row.code === 368 ? Math.trunc(taxBase / 2) : taxBase
      const tax = row.taxCode != null ? pick(row.taxCode, taxComputed) : book
      const typed = inputs.manual[row.code] != null || (row.taxCode != null && inputs.manual[row.taxCode] != null)
      return {
        code: row.code,
        tax_code: row.taxCode ?? null,
        label: row.label,
        book_cents: book,
        tax_cents: tax,
        signed: row.signed,
        state: typed ? 'manual' : book || tax ? 'ledger' : 'zero',
        check: Boolean(row.check) && !typed && Boolean(book || tax),
        accounts: draft?.accounts ?? [],
        prior_results_cents: draft?.priorResults ?? null,
        manual_only: Boolean(row.manualOnly),
      }
    }),
  }))
  if (inputs.manual[LOSS_EXCLUSION_CODE] != null) pick(LOSS_EXCLUSION_CODE, 0)

  const income = sum(values, TAXABLE_INCOME_CODES)
  const costs = sum(values, DEDUCTIBLE_COST_CODES)
  const taxResult = income - costs
  const lossExclusion = taxResult < 0 ? Math.min(values[LOSS_EXCLUSION_CODE] ?? 0, -taxResult) : 0
  if (taxResult >= 0) delete values[LOSS_EXCLUSION_CODE]
  const totals: Record<number, number> = {
    354: income,
    397: costs,
    500: Math.max(taxResult, 0),
    505: taxResult < 0 ? -taxResult - lossExclusion : 0,
    410: sum(values, FIXED_ASSET_CODES),
    418: sum(values, INVENTORY_CODES),
    429: sum(values, FINANCIAL_ASSET_CODES),
    434: sum(values, OTHER_ASSET_CODES),
    460: sum(values, DEBT_CODES),
  }
  totals[435] = (totals[410] ?? 0) + (totals[418] ?? 0) + (totals[429] ?? 0) + (totals[434] ?? 0)
  const netWealth = (totals[435] ?? 0) - (totals[460] ?? 0)
  totals[573] = Math.max(netWealth, 0)
  totals[574] = Math.max(-netWealth, 0)
  totals[461] = shortTerm
  totals[462] = longTerm
  totals[478] =
    sum(values, [470, 495, 496, 497, 474, 476]) - sum(values, [475, 477])
  for (const [code, cents] of Object.entries(totals)) values[code] = cents

  for (const group of groups) {
    const def = ALL_GROUPS.find((g) => g.key === group.key)
    group.totals = (def?.totals ?? []).map((total) => ({ ...total, cents: totals[total.code] ?? 0 }))
  }
  const costsGroup = groups.find((g) => g.key === 'other_costs')
  costsGroup?.totals.push(...RESULT_TOTALS.map((total) => ({ ...total, cents: totals[total.code] ?? 0 })))

  const checks = buildChecks(db, {
    starts,
    ends,
    today: options.today,
    groups,
    values,
    unplaced,
    usedManual,
    bookResult,
    taxResult,
    netWealth,
    equity: totals[478] ?? 0,
    saleNet,
    hasSales: saleLines.length > 0,
    inputs,
    storedEstimate: period.json.verolaskelma?.tulos_cents ?? null,
    taxBooked: Boolean(period.json.verolaskelma?.booked_at),
  })

  return {
    starts,
    ends,
    company: {
      name: settings.Nimi ?? '',
      business_id: settings.Ytunnus ?? '',
      contact_name: inputs.contact_name || (settings.VeroYhteysHenkilo ?? ''),
      contact_phone: inputs.contact_phone || (settings.VeroYhteysPuhelin ?? ''),
    },
    groups,
    values,
    unplaced,
    checks,
    forms: formsNeeded(values, inputs),
    inputs,
    carried_from,
    saved,
    overrides,
  }
}

type CheckInput = {
  starts: string
  ends: string
  today: string
  groups: GroupView[]
  values: Record<string, number>
  unplaced: AccountLine[]
  usedManual: number[]
  bookResult: number
  taxResult: number
  netWealth: number
  equity: number
  saleNet: number
  hasSales: boolean
  inputs: TaxReturnInputs
  storedEstimate: number | null
  taxBooked: boolean
}

/** What the form's Kirjanpito figures say the year's result is; rows outside the income statement stay out. */
function formResult(values: Record<string, number>): number {
  let result = 0
  for (const group of PNL_GROUPS) {
    for (const row of group.rows) {
      if (!row.manualOnly) result += (values[row.code] ?? 0) * signFor(group.side)
    }
  }
  return result
}

function buildChecks(db: SqliteDb, input: CheckInput): CheckView[] {
  const checks: CheckView[] = []
  const { groups, values } = input

  if (input.unplaced.length) checks.push({ key: 'unplaced', state: 'crit', count: input.unplaced.length })

  const unanswered = openAnswers(input.inputs.answers).length
  if (unanswered) checks.push({ key: 'unanswered', state: 'crit', count: unanswered })

  const custom =groups.flatMap((g) => g.rows).flatMap((r) => r.accounts).filter((a) => a.custom)
  const customAccounts = new Set(custom.map((a) => a.account))
  if (customAccounts.size) checks.push({ key: 'custom_accounts', state: 'warn', count: customAccounts.size })

  const resultGap = formResult(values) - input.bookResult
  checks.push({ key: 'result_ties', state: resultGap ? 'crit' : 'ok', cents: resultGap })

  const wealthGap = input.netWealth - input.equity
  checks.push({ key: 'net_wealth', state: wealthGap ? 'crit' : 'ok', cents: wealthGap })

  const estimate = input.storedEstimate ?? taxFromBasis(computeTaxBasis(db, input.starts, input.ends)).tulos_cents
  const estimateGap = input.taxResult - estimate
  checks.push({ key: 'estimate', state: estimateGap ? 'warn' : 'ok', cents: estimateGap })

  const negative = groups
    .flatMap((g) => g.rows)
    .filter((row) => !row.signed && (row.book_cents < 0 || row.tax_cents < 0))
    .map((row) => row.code)
  if (negative.length) checks.push({ key: 'negative', state: 'crit', codes: negative })

  const ended = input.ends < input.today
  if (!ended) checks.push({ key: 'not_ended', state: 'warn', date: input.ends })

  const taxVoucher = db.get<{ id: number }>('SELECT id FROM Tosite WHERE tyyppi = ? AND pvm = ? AND tila >= 100 LIMIT 1', [TYPE_INCOME_TAX, input.ends])
  if (ended && input.taxResult > 0 && !taxVoucher && !input.taxBooked) checks.push({ key: 'income_tax', state: 'warn' })

  const draftCount = Number(
    db.get<{ n: number }>('SELECT COUNT(*) AS n FROM Tosite WHERE tila > 0 AND tila < 100 AND pvm >= ? AND pvm <= ?', [input.starts, input.ends])?.n ?? 0,
  )
  if (draftCount) checks.push({ key: 'drafts', state: 'warn', count: draftCount })

  const nextEnd = db.get<{ loppuu: string }>('SELECT loppuu FROM Tilikausi WHERE alkaa > ? ORDER BY alkaa LIMIT 1', [input.ends])?.loppuu
  const dividend = db.get<{ first: string | null; d: number; k: number }>(
    `SELECT MIN(Vienti.pvm) AS first, COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${postedOnly()} AND Vienti.tili = ? AND Vienti.pvm > ? AND Vienti.pvm <= ?`,
    [DIVIDEND_ACCOUNT, input.ends, nextEnd ?? '9999-12-31'],
  )
  const dividendCents = asCents(dividend?.d) - asCents(dividend?.k)
  if (dividendCents > 0 && !input.inputs.dividend) {
    checks.push({ key: 'dividend_answer', state: 'warn', cents: dividendCents, date: dividend?.first ?? undefined })
  }

  if (input.hasSales) {
    if (!input.inputs.sales) checks.push({ key: 'sale_split', state: 'warn', cents: input.saleNet })
    else {
      const gap = input.inputs.sales.gains_cents - input.inputs.sales.losses_cents - input.saleNet
      checks.push({ key: 'sale_gap', state: gap ? 'crit' : 'ok', cents: gap })
    }
  }

  if (input.usedManual.length) checks.push({ key: 'manual', state: 'warn', codes: [...input.usedManual] })
  const toCheck = groups.flatMap((g) => g.rows).filter((row) => row.check).map((row) => row.code)
  if (toCheck.length) checks.push({ key: 'to_check', state: 'warn', codes: toCheck })

  return checks
}

const FIELD_FORMS: { form: string; codes: number[]; in_file: boolean }[] = [
  { form: '62', codes: [364, 365, 400, 401, 403, 409], in_file: true },
  { form: '73', codes: [337, 338], in_file: true },
  { form: '8A', codes: [405, 424, 430], in_file: true },
  { form: '18', codes: [402, 431], in_file: true },
  { form: '71B', codes: [332, 333, 372, 373, 261, 270, 271], in_file: true },
  { form: '65', codes: [436, 439], in_file: true },
  { form: '74', codes: [352], in_file: true },
  { form: '67A', codes: [695], in_file: true },
  { form: '67Y', codes: [697, 698], in_file: true },
  { form: '7851', codes: [432], in_file: false },
]

/** Vero's notices in the record description say which fields call for which form. */
function formsNeeded(values: Record<string, number>, inputs: TaxReturnInputs): FormNeed[] {
  const forms: FormNeed[] = []
  for (const rule of FIELD_FORMS) {
    const codes = rule.codes.filter((code) => values[code])
    if (codes.length) forms.push({ form: rule.form, codes, built: false, in_file: rule.in_file })
  }
  for (const answer of ANSWERS) {
    if (answer.form && inputs.answers[answer.key] && !forms.some((f) => f.form === answer.form)) {
      forms.push({ form: answer.form, codes: [], built: false, in_file: true })
    }
  }
  if (inputs.dividend?.amount_cents) forms.push({ form: '7812', codes: [522], built: false, in_file: false })
  return forms
}
