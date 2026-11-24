import type { PropertyTab } from '../../../app/routing'
import { dayCount } from '../../../book/months'
import { getBcp47 } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { DueTone } from '../../../shared/DueTile'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { PillTone } from '../../../shared/Pill'
import type { DepositCandidate, LeaseIncrease, LeaseRentAccount, LeaseView, MonthLine, PropertyStatus, RentPeriod, Warning, WaterShareStatus } from '../api'

const wholeEuro = new Map<string, Intl.NumberFormat>()

/** Whole euros for overviews (cents stay in tables and the ledger). */
export function formatEuro(snt: number | null | undefined): string {
  if (snt == null) return ''
  const loc = getBcp47()
  let fmt = wholeEuro.get(loc)
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    wholeEuro.set(loc, fmt)
  }
  return fmt.format(Math.round(snt / 100))
}

export function statusClass(status: PropertyStatus): string {
  return `property-status property-status-${status}`
}

type T = (key: string, vars?: Record<string, string | number>) => string

/** A VAT rate as the page writes it: "25,5 %", "24 %". */
export function vatPctText(pct: number): string {
  return new Intl.NumberFormat(getBcp47(), { style: 'percent', maximumFractionDigits: 2 }).format(pct / 100)
}

/**
 * Warning text; unknown codes fall back to the code itself. A `*_snt` param is money, a `*_date`
 * param a date and a `*_pct` param a percentage, each named without the suffix; an empty `tenant`
 * is an unknown tenant.
 */
export function warningText(t: T, w: Warning): string {
  const key = `properties.warn.${w.code}`
  const params = Object.fromEntries(
    Object.entries(w.params ?? {}).map(([k, v]) =>
      k.endsWith('_snt') && typeof v === 'number'
        ? [k.slice(0, -4), formatCents(v)]
        : k.endsWith('_date') && typeof v === 'string'
          ? [k.slice(0, -5), formatDate(v)]
          : k.endsWith('_pct') && typeof v === 'number'
            ? [k.slice(0, -4), vatPctText(v)]
            : k === 'tenant' && v === ''
            ? [k, t('properties.lease.tenantUnknown')]
            : [k, v],
    ),
  )
  const text = t(key, params)
  return text === key ? w.code : text
}

/** The word on a warning's pill (`properties.alerts.word.*`); each has one tone, as everywhere (UI_PATTERNS rule 1). */
export type WarningWord = 'error' | 'missing' | 'todo' | 'suggestion' | 'note'

const WORD_TONE: Record<WarningWord, PillTone> = { error: 'crit', missing: 'crit', todo: 'warn', suggestion: 'doc', note: 'neutral' }

/** Every `properties.warn.*` code: a dated reminder (`due`) is a tile, the rest a line with a pill. A test keeps it whole. */
export const WARNING_WORDS: Record<string, WarningWord | 'due'> = {
  lease_ending: 'due',
  increase_due: 'due',
  doc_corrupt: 'error',
  lease_overlap: 'error',
  water_overlap: 'error',
  loan_shared: 'error',
  deposit_over: 'error',
  lease_contract_missing: 'missing',
  increase_notice_missing: 'missing',
  exception_agreement_missing: 'missing',
  water_statement_missing: 'missing',
  water_letter_missing: 'missing',
  loan_share_missing: 'missing',
  loan_certificate_missing: 'missing',
  loan_charge_notice_missing: 'missing',
  era_missing: 'missing',
  no_capital: 'missing',
  rent_vat_missing: 'error',
  rent_vat_unexpected: 'error',
  rent_vat_row_missing: 'error',
  rent_vat_rate: 'error',
  rent_arrears: 'todo',
  former_owes: 'todo',
  former_paid_ahead: 'todo',
  deposit_open: 'todo',
  water_tenant_owes: 'todo',
  water_refund_due: 'todo',
  vacant: 'todo',
  vacant_until: 'todo',
  water_settlement_missing: 'todo',
  water_settlement_none: 'todo',
  loan_certificate_stale: 'todo',
  loan_payment_missing: 'todo',
  loan_rate_missing: 'todo',
  loan_rate_none: 'todo',
  loan_grace_ending: 'todo',
  loan_type_retired: 'todo',
  loan_invoice_unmatched: 'todo',
  lease_suggestions: 'suggestion',
  loan_charge_invoiced: 'suggestion',
  water_suggestions: 'suggestion',
  deposits_unlinked: 'suggestion',
  sale_line_split: 'note',
  sale_carried: 'note',
  loan_rahastoitu_expensed: 'note',
  loan_rate_estimated: 'note',
  doc_newer: 'note',
}

/** A warning line's pill; a code not listed reads as something to handle. */
export function warningTone(code: string): { tone: PillTone; word: WarningWord } {
  const listed = WARNING_WORDS[code]
  const word = listed && listed !== 'due' ? listed : 'todo'
  return { tone: WORD_TONE[word], word }
}

/**
 * The tab where each warning is fixed, on the object's page and its edit page; null stays on the
 * overview only (the stored document itself). Same codes as `WARNING_WORDS`; a test keeps it whole.
 */
export const WARNING_TABS: Record<string, PropertyTab | null> = {
  lease_ending: 'leases',
  increase_due: 'leases',
  doc_corrupt: null,
  doc_newer: null,
  lease_overlap: 'leases',
  water_overlap: 'water',
  loan_shared: 'finance',
  deposit_over: 'leases',
  lease_contract_missing: 'leases',
  increase_notice_missing: 'leases',
  exception_agreement_missing: 'leases',
  water_statement_missing: 'water',
  water_letter_missing: 'water',
  loan_share_missing: 'housing',
  loan_certificate_missing: 'housing',
  loan_charge_notice_missing: 'housing',
  loan_certificate_stale: 'housing',
  loan_payment_missing: 'housing',
  loan_rate_missing: 'housing',
  loan_rate_estimated: 'housing',
  loan_rate_none: 'housing',
  loan_grace_ending: 'housing',
  loan_type_retired: 'housing',
  loan_rahastoitu_expensed: 'housing',
  loan_charge_invoiced: 'housing',
  loan_invoice_unmatched: 'housing',
  era_missing: 'finance',
  no_capital: 'finance',
  rent_vat_missing: 'leases',
  rent_vat_unexpected: 'leases',
  rent_vat_row_missing: 'leases',
  rent_vat_rate: 'leases',
  rent_arrears: 'leases',
  former_owes: 'leases',
  former_paid_ahead: 'leases',
  deposit_open: 'leases',
  water_tenant_owes: 'water',
  water_refund_due: 'water',
  vacant: 'leases',
  vacant_until: 'leases',
  water_settlement_missing: 'water',
  water_settlement_none: 'water',
  lease_suggestions: 'leases',
  water_suggestions: 'water',
  deposits_unlinked: 'leases',
  sale_line_split: 'finance',
  sale_carried: 'finance',
}

const MARK_ORDER: PillTone[] = ['crit', 'warn', 'doc']

/**
 * Each tab's mark: the tone of its worst warning and how many there are. A dated reminder is warn,
 * crit once late, as its tile; a note marks nothing.
 */
export function tabMarks(t: T, warnings: Warning[], asOf: string): Map<PropertyTab, { tone: PillTone; count: number }> {
  const marks = new Map<PropertyTab, { tone: PillTone; count: number }>()
  for (const w of warnings) {
    const tab = WARNING_TABS[w.code]
    const tone = dueTile(t, w, asOf)?.tone ?? warningTone(w.code).tone
    if (!tab || !MARK_ORDER.includes(tone)) continue
    const mark = marks.get(tab)
    const worst = mark && MARK_ORDER.indexOf(mark.tone) < MARK_ORDER.indexOf(tone) ? mark.tone : tone
    marks.set(tab, { tone: worst, count: (mark?.count ?? 0) + 1 })
  }
  return marks
}

/** Errors first, notes last; the order within a word stays the domain's. */
export function sortWarnings<W extends { code: string }>(warnings: W[]): W[] {
  const order: WarningWord[] = ['error', 'missing', 'todo', 'suggestion', 'note']
  return [...warnings].sort((a, b) => order.indexOf(warningTone(a.code).word) - order.indexOf(warningTone(b.code).word))
}

/**
 * A dated reminder as a tile: what and whose, the day, and the days left (warn) or past it (crit),
 * counted like the company page's deadlines. Null for any other warning.
 */
export function dueTile(t: T, w: Warning, asOf: string): { label: string; due: string; state: string; tone: DueTone } | null {
  const date = w.code === 'lease_ending' ? w.params?.ends_date : w.code === 'increase_due' ? w.params?.from_date : undefined
  if (typeof date !== 'string') return null
  const tenant = String(w.params?.tenant ?? '') || t('properties.lease.tenantUnknown')
  const days = dayCount(asOf, date) - 1
  return {
    label: t(w.code === 'lease_ending' ? 'properties.alerts.due.leaseEnding' : 'properties.alerts.due.increase', { tenant }),
    due: formatDate(date),
    state: days < 0 ? t('properties.alerts.due.late', { days: -days }) : t('properties.alerts.due.left', { days }),
    tone: days < 0 ? 'crit' : 'warn',
  }
}

/** Field paths from save errors (`invalid_field:valuations[0].date`) as a readable line. */
export function saveErrorText(t: T, raw: string): string {
  const [code, path] = raw.split(':')
  const key = `properties.error.${code}`
  const text = t(key, { path: path ?? '' })
  return text === key ? raw : text
}

/** Column label of a fiscal year: its calendar year, with the start when it is not a full year. */
export function periodLabel(p: { starts: string; ends: string }): string {
  const full = p.starts.slice(5) === '01-01' && p.ends.slice(5) === '12-31'
  if (full) return p.ends.slice(0, 4)
  return `${Number(p.starts.slice(8, 10))}.${Number(p.starts.slice(5, 7))}.–${p.ends.slice(0, 4)}`
}

/** The months of a fiscal year the figures reach by `asOf`, from its first; null when they reach its end or it has not begun. */
export function monthsCovered(p: { starts: string; ends: string }, asOf: string): number | null {
  if (asOf >= p.ends || asOf < p.starts) return null
  return (Number(asOf.slice(0, 4)) - Number(p.starts.slice(0, 4))) * 12 + Number(asOf.slice(5, 7)) - Number(p.starts.slice(5, 7)) + 1
}

/** "2 v 3 kk" style holding time between two ISO dates. */
export function holdingText(t: T, from: string | null, to: string | null): string {
  if (!from || !to) return ''
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 0) months = 0
  return t('properties.holding', { years: Math.floor(months / 12), months: months % 12 })
}

/** "maaliskuu 2025" for "2025-03". */
export function monthName(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

/** Partner and line text as Selaa joins them; the account name when both are empty. */
export function lineText(line: MonthLine): string {
  const partner = line.entry.partner?.name ?? ''
  const text = line.entry.description
  if (partner && text && partner !== text) return `${partner} - ${text}`
  return partner || text || line.entry.account_name
}

/** "1.3.2025 alkaen" or "1.3.2025–28.2.2026". */
export function leasePeriod(t: T, lease: LeaseView): string {
  return lease.ends
    ? t('properties.lease.period', { from: formatDate(lease.starts), to: formatDate(lease.ends) })
    : t('properties.lease.since', { date: formatDate(lease.starts) })
}

/**
 * "690,00 €/kk (vuokra 655,00 €, vesi 20,00 €, autopaikka 15,00 €)" for a step; with a VAT lease's
 * VAT on it, "+ ALV 25,5 % 175,95 € = 865,95 €/kk" after it (ADR-033).
 */
export function leaseRentText(
  t: T,
  rent: { rent_snt: number; water_snt?: number; parking_snt?: number } | null,
  vat?: { pct: number; snt: number } | null,
): string {
  if (!rent) return ''
  const parts = rentPartsText(t, rent)
  const base = t('properties.lease.perMonth', { amount: formatCents(rentTotal(rent)) })
  const text = parts ? `${base} (${parts})` : base
  return vat ? `${text} ${rentVatText(t, rent, vat)}` : text
}

/** What a month's rent adds up to: rent, water and a parking space. */
export function rentTotal(rent: { rent_snt: number; water_snt?: number; parking_snt?: number }): number {
  return rent.rent_snt + (rent.water_snt ?? 0) + (rent.parking_snt ?? 0)
}

/** "vuokra 655,00 €, vesi 20,00 €, autopaikka 15,00 €"; empty when the rent is all there is. */
export function rentPartsText(t: T, rent: { rent_snt: number; water_snt?: number; parking_snt?: number }): string {
  const parts = [
    rent.water_snt ? t('properties.lease.water', { amount: formatCents(rent.water_snt) }) : '',
    rent.parking_snt ? t('properties.lease.parking', { amount: formatCents(rent.parking_snt) }) : '',
  ].filter(Boolean)
  return parts.length ? `${t('properties.lease.rentPart', { amount: formatCents(rent.rent_snt) })}, ${parts.join(', ')}` : ''
}

/** A VAT lease's VAT on a month (ADR-033): "+ ALV 25,5 % 175,95 € = 865,95 €/kk". */
export function rentVatText(t: T, rent: { rent_snt: number; water_snt?: number; parking_snt?: number }, vat: { pct: number; snt: number }): string {
  return t('properties.lease.vat', { pct: vatPctText(vat.pct), amount: formatCents(vat.snt), total: formatCents(rentTotal(rent) + vat.snt) })
}

/** An agreed exception with the rent it stands for. */
type ExceptionFigures = { from: string; to: string; rent_snt: number; water_snt?: number; parking_snt?: number; normal_snt: number; note?: string }

/** An exception's line, whose first day is in the date column: "–31.5.2025 · 470,00 €/kk (...), normaali 670,00 € · Remonttihyvitys". */
export function exceptionLineText(t: T, e: ExceptionFigures): string {
  return [untilText(t, e.to), exceptionTerms(t, e)].join(' · ')
}

function exceptionTerms(t: T, e: ExceptionFigures): string {
  return [`${leaseRentText(t, e)}, ${t('properties.lease.normal', { amount: formatCents(e.normal_snt) })}`, e.note ?? ''].filter(Boolean).join(' · ')
}

function longMonth(month: number): string {
  return new Intl.DateTimeFormat(getBcp47(), { month: 'long' }).format(new Date(2024, month - 1, 1))
}

/** The increase clause as a lease card's figure: "3 % vuodessa", "15,00 € vuodessa", "Indeksi", and its month when it has one. */
export function increaseFigure(t: T, rule: LeaseIncrease): { value: string; month: string } {
  const value =
    rule.kind === 'index'
      ? t('properties.lease.figure.ruleIndex')
      : rule.kind === 'amount'
        ? t('properties.lease.figure.ruleAmount', { amount: formatCents(rule.amount_snt ?? 0) })
        : t('properties.lease.figure.rulePercent', { pct: formatBp(rule.pct_bp ?? 0) })
  return { value, month: rule.month ? t('properties.lease.figure.ruleMonth', { month: longMonth(rule.month) }) : '' }
}

/** The increase clause for a letter: "3,0 % vuodessa", "15,00 € vuodessa", "indeksiin sidottu". */
export function clauseText(t: T, rule: LeaseIncrease | null | undefined): string {
  if (!rule || rule.kind === 'none') return ''
  if (rule.kind === 'index') return t('properties.notice.clause.index')
  if (rule.kind === 'amount') return t('properties.notice.clause.amount', { amount: formatCents(rule.amount_snt ?? 0) })
  return t('properties.notice.clause.percent', { pct: formatBp(rule.pct_bp ?? 0) })
}

/** "1.11.2023–31.10.2024". */
export function periodText(t: T, from: string, to: string): string {
  return t('properties.lease.period', { from: formatDate(from), to: formatDate(to) })
}

/** A period whose first day is in the line's date column: "–30.6.2025". */
export function untilText(t: T, to: string): string {
  return t('properties.lease.period', { from: '', to: formatDate(to) })
}

/** A rent balance as the tenant stands: arrears negative, paid ahead positive (never -0). */
export function tenantSide(snt: number): number {
  return snt === 0 ? 0 : -snt
}

/**
 * Why a lease's account counts fewer days than the lease: from a later day (the purchase, the owner's
 * day, the books' start), or until the owner's last day of rent.
 */
export function rentCountedText(t: T, account: Pick<LeaseRentAccount, 'counted_from' | 'counted_until'>, leaseStarts: string, period: RentPeriod): string[] {
  return [
    account.counted_from > leaseStarts
      ? t('properties.rent.countedFrom', { date: formatDate(account.counted_from), reason: t(`properties.rent.start.${period.start.source}`) })
      : '',
    period.end && account.counted_until === period.end.until
      ? t('properties.rent.countedUntil', { date: formatDate(period.end.until), reason: t(`properties.rent.end.${period.end.source}`) })
      : '',
  ].filter(Boolean)
}

/** A tenant's water balance: "palautetaan 12,30 €", "peritään 88,00 €", "ei tasattavaa". */
export function waterBalanceText(t: T, balance: number): string {
  if (balance === 0) return t('properties.water.nothing')
  return t(balance < 0 ? 'properties.water.refund' : 'properties.water.charge', { amount: formatCents(Math.abs(balance)) })
}

/** The company's result for the owner: "hyvitys 123,45 €" or "lisälasku 42,10 €". */
export function companyResultText(t: T, difference: number): string {
  if (!difference) return t('properties.water.noDifference')
  return t(difference < 0 ? 'properties.water.companyRefund' : 'properties.water.companyCharge', { amount: formatCents(Math.abs(difference)) })
}

/** Whether a share is settled: "palautettu", "maksettu", "avoin", "osittain, 50,00 € jäljellä", "36,77 € yli osuuden". */
export function waterStatusText(t: T, status: WaterShareStatus, balance: number, settled: number): string {
  if (status === 'settled') return t(balance < 0 ? 'properties.water.status.refunded' : 'properties.water.status.paid')
  if (status === 'partial') return t('properties.water.status.partial', { amount: formatCents(Math.abs(balance - settled)) })
  if (status === 'over') return t('properties.water.status.over', { amount: formatCents(Math.abs(settled - balance)) })
  return t(`properties.water.status.${status}`)
}

/** What a return kept (+) or paid on top (-): "josta pidätetty 123,45 €". */
export function deductedText(t: T, snt: number): string {
  return t(snt > 0 ? 'properties.deposit.deducted' : 'properties.deposit.paidOnTop', { amount: formatCents(Math.abs(snt)) })
}

/**
 * A deposit to pick: "★ 25.2.2023 · Vuokravakuus A 1 · Testi Vuokralainen · 600,00 € · palautettu
 * 7.5.2025 · saldo 0,00 €"; an item's returns and balance, a loose line's amount alone.
 */
export function depositOptionText(t: T, c: DepositCandidate, star: boolean): string {
  const returns = c.kind === 'item' ? c.movements.filter((m) => m.amount_snt < 0).map((m) => formatDate(m.date)) : []
  return [
    `${star ? '★ ' : ''}${formatDate(c.date)}`,
    c.text,
    c.partner,
    formatCents(c.amount_snt),
    returns.length ? t('properties.deposit.returnedOn', { date: returns.join(', ') }) : null,
    c.kind === 'item' ? t('properties.deposit.balance', { amount: formatCents(c.balance_snt) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
