import { getBcp47 } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { DepositCandidate, DepositView, LeaseIncrease, LeaseView, MonthLine, PropertyStatus, Warning, WaterShareStatus } from '../api'

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

/** Warning text; unknown codes fall back to the code itself. A `*_snt` param is money, named without the suffix. */
export function warningText(t: T, w: Warning): string {
  const key = `properties.warn.${w.code}`
  const params = Object.fromEntries(
    Object.entries(w.params ?? {}).map(([k, v]) => (k.endsWith('_snt') && typeof v === 'number' ? [k.slice(0, -4), formatCents(v)] : [k, v])),
  )
  const text = t(key, params)
  return text === key ? w.code : text
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

/** "690,00 €/kk (vuokra 655,00 €, vesi 20,00 €, autopaikka 15,00 €)" for a step. */
export function leaseRentText(t: T, rent: { rent_snt: number; water_snt?: number; parking_snt?: number } | null): string {
  if (!rent) return ''
  const total = rent.rent_snt + (rent.water_snt ?? 0) + (rent.parking_snt ?? 0)
  const parts = [
    rent.water_snt ? t('properties.lease.water', { amount: formatCents(rent.water_snt) }) : '',
    rent.parking_snt ? t('properties.lease.parking', { amount: formatCents(rent.parking_snt) }) : '',
  ].filter(Boolean)
  const base = t('properties.lease.perMonth', { amount: formatCents(total) })
  return parts.length ? `${base} (${t('properties.lease.rentPart', { amount: formatCents(rent.rent_snt) })}, ${parts.join(', ')})` : base
}

/** An exception as the lease card lists it: "1.3.2025–31.3.2025 · 470,00 €/kk, normaali 670,00 € · Remonttihyvitys". */
export function exceptionText(t: T, e: { from: string; to: string; rent_snt: number; water_snt?: number; parking_snt?: number; normal_snt: number; note?: string }): string {
  return [periodText(t, e.from, e.to), `${leaseRentText(t, e)}, ${t('properties.lease.normal', { amount: formatCents(e.normal_snt) })}`, e.note ?? '']
    .filter(Boolean)
    .join(' · ')
}

function longMonth(month: number): string {
  return new Intl.DateTimeFormat(getBcp47(), { month: 'long' }).format(new Date(2024, month - 1, 1))
}

/** The increase clause in words: "korotus 3 % vuodessa (maaliskuu)", "korotus 20,00 € vuodessa", "indeksikorotus". */
export function increaseText(t: T, rule: LeaseIncrease | null | undefined): string {
  if (!rule || rule.kind === 'none') return ''
  const month = rule.month ? longMonth(rule.month) : ''
  const key = (base: string) => `properties.lease.increase.${base}${month ? 'Month' : ''}`
  if (rule.kind === 'index') return t(key('index'), { month })
  if (rule.kind === 'amount') return t(key('amount'), { amount: formatCents(rule.amount_snt ?? 0), month })
  return t(key('percent'), { pct: formatBp(rule.pct_bp ?? 0), month })
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

/** A rent balance as the tenant stands: arrears negative, paid ahead positive (never -0). */
export function tenantSide(snt: number): number {
  return snt === 0 ? 0 : -snt
}

/** A rent account's balance, exact: "vuokrarästi 120,00 €", "maksettu ennakkoon 45,83 €", "täsmää, 0,00 €". */
export function rentBalanceText(t: T, balance: number): string {
  if (balance === 0) return t('properties.rent.even')
  return t(balance > 0 ? 'properties.rent.arrears' : 'properties.rent.ahead', { amount: formatCents(Math.abs(balance)) })
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

/** A deposit's state, exact: "saatu 600,00 € · palautettu 600,00 €, josta pidätetty 123,45 € · saldo 0,00 €". */
export function depositText(t: T, d: Pick<DepositView, 'received_snt' | 'returned_snt' | 'deducted_snt' | 'balance_snt'>): string {
  const parts = [t('properties.deposit.received', { amount: formatCents(d.received_snt) })]
  if (d.returned_snt) {
    const returned = t('properties.deposit.returned', { amount: formatCents(d.returned_snt) })
    parts.push(d.deducted_snt ? `${returned}, ${deductedText(t, d.deducted_snt)}` : returned)
  }
  parts.push(t('properties.deposit.balance', { amount: formatCents(d.balance_snt) }))
  return parts.join(' · ')
}

/** What a return kept (+) or paid on top (-): "josta pidätetty 123,45 €". */
export function deductedText(t: T, snt: number): string {
  return t(snt > 0 ? 'properties.deposit.deducted' : 'properties.deposit.paidOnTop', { amount: formatCents(Math.abs(snt)) })
}

/** A deposit to pick: "★ 25.2.2023 · Vuokravakuus A 1 · Testi Vuokralainen · 600,00 € · saldo 0,00 €"; the balance for items only. */
export function depositOptionText(t: T, c: DepositCandidate, star: boolean): string {
  return [
    `${star ? '★ ' : ''}${formatDate(c.date)}`,
    c.text,
    c.partner,
    formatCents(c.amount_snt),
    c.kind === 'item' ? t('properties.deposit.balance', { amount: formatCents(c.balance_snt) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
