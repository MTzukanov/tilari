import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import { formatBp, formatPcmInput, formatPercentInput, parsePcmInput, parsePercentInput } from '../../../shared/percent'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import {
  fetchPortfolio,
  savePortfolioSettings,
  skipPropertyDocument,
  type DocumentSkip,
  type ForecastDefaults,
  type ForecastSettings,
  type PortfolioResponse,
  type PortfolioSettings,
  type PropertyRow,
  type YearCashFlow,
} from '../api'
import { rowAlerts } from '../../../book/modules/properties/domain/reminders'
import { yieldBp } from '../../../book/modules/properties/domain/returns'
import { formatEuro, holdingText, monthsCovered, periodLabel, returnSoFar, yearReturnBp, saveErrorText, statusClass, tenantSide, warningText } from './format'
import { InfoButton, InfoNote } from './FigureTiles'
import { PortfolioCharts, shareBp } from './PortfolioCharts'
import { Warnings } from './Warnings'

function Kpi({ label, value, neg, hint }: { label: string; value: string; neg?: boolean; hint?: string }) {
  return (
    <div className="overview-kpi">
      <span className="overview-kpi-label">{label}</span>
      <strong className={neg ? 'neg' : ''}>{value || '–'}</strong>
      {hint ? <span className="muted property-kpi-hint">{hint}</span> : null}
    </div>
  )
}

/** Hundredths as the form shows them, one decimal at least: 100 -> "1,0". */
function hundredths(n: number | null): string {
  if (n == null) return ''
  return (n / 100).toFixed(n % 10 ? 2 : 1).replace('.', ',')
}

/**
 * The portfolio's defaults: sale costs and the target return, and the estimates for the months ahead
 * (ADR-035), each one number for the whole period. An empty estimate takes its default, shown in the
 * field: the newest rate typed on a loan, 1 % a year, one month's rent; the last 12 months' other
 * costs stand beside theirs.
 */
function DefaultsForm({ settings, defaults, onSaved }: { settings: PortfolioSettings; defaults: ForecastDefaults; onSaved: () => void }) {
  const { t } = useI18n()
  const [pct, setPct] = useState(formatPercentInput(settings.sale_costs?.pct_bp))
  const [fixed, setFixed] = useState(settings.sale_costs ? formatEurInput(settings.sale_costs.fixed_snt) : '')
  const [target, setTarget] = useState(formatPercentInput(settings.target_return_bp))
  const typed = settings.forecast ?? {}
  const [euribor12, setEuribor12] = useState(formatPcmInput(typed.euribor_12m_pcm))
  const [euribor6, setEuribor6] = useState(formatPcmInput(typed.euribor_6m_pcm))
  const [raise, setRaise] = useState(formatPercentInput(typed.raise_bp))
  // Months of rent a year travel in hundredths, as percentages do in basis points.
  const [other, setOther] = useState(formatPercentInput(typed.other_costs_months_x100))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const pctBp = parsePercentInput(pct)
    const targetBp = parsePercentInput(target)
    const raiseBp = parsePercentInput(raise)
    const otherX100 = parsePercentInput(other)
    const rate12 = parsePcmInput(euribor12)
    const rate6 = parsePcmInput(euribor6)
    if ([pctBp, targetBp, raiseBp, otherX100, rate12, rate6].some((n) => Number.isNaN(n)) || (otherX100 != null && otherX100 < 0)) {
      setError(t('properties.error.percent'))
      return
    }
    const forecast: ForecastSettings = {}
    if (rate12 != null) forecast.euribor_12m_pcm = rate12
    if (rate6 != null) forecast.euribor_6m_pcm = rate6
    if (raiseBp != null) forecast.raise_bp = raiseBp
    if (otherX100 != null) forecast.other_costs_months_x100 = otherX100
    const next: PortfolioSettings = { ...settings }
    if (pctBp != null || fixed) next.sale_costs = { pct_bp: pctBp ?? 0, fixed_snt: parseEurInput(fixed) }
    else delete next.sale_costs
    if (targetBp != null) next.target_return_bp = targetBp
    else delete next.target_return_bp
    if (Object.keys(forecast).length) next.forecast = forecast
    else delete next.forecast
    setSaving(true)
    try {
      await savePortfolioSettings(next)
      setError(null)
      onSaved()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="property-defaults">
      <summary>{t('properties.defaults.title')}</summary>
      <p className="muted">{t('properties.defaults.lead')}</p>
      <div className="property-form-grid">
        <label>
          {t('properties.field.salePct')}
          <input type="text" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="3,0" />
        </label>
        <label>
          {t('properties.field.saleFixed')}
          <EuroInput value={fixed} onChange={setFixed} />
        </label>
        <label>
          {t('properties.field.targetReturn')}
          <input type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="4,0" />
        </label>
      </div>
      <h4>{t('properties.defaults.forecast')}</h4>
      <div className="property-form-grid">
        <label>
          {t('properties.field.euribor12')}
          <input type="text" inputMode="decimal" value={euribor12} placeholder={formatPcmInput(defaults.euribor_12m_pcm)} onChange={(e) => setEuribor12(e.target.value)} />
        </label>
        <label>
          {t('properties.field.euribor6')}
          <input type="text" inputMode="decimal" value={euribor6} placeholder={formatPcmInput(defaults.euribor_6m_pcm)} onChange={(e) => setEuribor6(e.target.value)} />
        </label>
        <label>
          {t('properties.field.raise')}
          <input type="text" inputMode="decimal" value={raise} placeholder={hundredths(defaults.raise_bp)} onChange={(e) => setRaise(e.target.value)} />
        </label>
        <label className="property-field-hinted">
          {t('properties.field.otherCosts')}
          <input type="text" inputMode="decimal" value={other} placeholder={hundredths(defaults.other_costs_months_x100)} onChange={(e) => setOther(e.target.value)} />
          {defaults.other_costs_actual_x100 != null ? (
            <span className="muted property-field-hint">{t('properties.field.otherCostsActual', { months: hundredths(defaults.other_costs_actual_x100) })}</span>
          ) : null}
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </details>
  )
}

type T = (key: string, vars?: Record<string, string | number>) => string

function sum(rows: PropertyRow[], value: (r: PropertyRow) => number | null | undefined): number {
  return rows.reduce((s, r) => s + (value(r) ?? 0), 0)
}

function negClass(n: number | null | undefined): string {
  return (n ?? 0) < 0 ? 'neg' : ''
}

/** ⚠ before the name when the object has warnings or reminders to act on (ADR-030); they show on hover, one bullet each. */
function WarnMark({ t, row }: { t: T; row: PropertyRow }) {
  const shown = rowAlerts(row)
  if (!shown.length) return null
  return (
    <span
      className="property-warn-mark"
      role="img"
      title={shown.map((w) => `• ${warningText(t, w)}`).join('\n')}
      aria-label={t('properties.warnCount', { count: shown.length })}
    >
      {shown.length > 1 ? `⚠ ${shown.length}` : '⚠'}
    </span>
  )
}

const ALERTS_OPEN_KEY = 'tilari.properties.alerts.open'

function readAlertsOpen(): boolean {
  try {
    return localStorage.getItem(ALERTS_OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Every object's warnings to act on in one list, after the figures (ADR-030). The header's ⚠
 * opens the page here (`focus`); whether it is folded is remembered in this browser.
 */
function AlertsList({
  t,
  rows,
  asOf,
  focus,
  onOpen,
  onSkip,
}: {
  t: T
  rows: PropertyRow[]
  asOf: string
  focus: boolean
  onOpen: (id: number) => void
  onSkip: (id: number, skip: DocumentSkip) => Promise<unknown>
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(() => focus || readAlertsOpen())
  const items = rows.map((row) => ({ row, warnings: rowAlerts(row) })).filter((i) => i.warnings.length)

  useEffect(() => {
    if (!focus || !ref.current) return
    setOpen(true)
    ref.current.scrollIntoView({ block: 'start' })
  }, [focus, items.length])

  if (!items.length) return null
  const toggle = (next: boolean) => {
    setOpen(next)
    try {
      localStorage.setItem(ALERTS_OPEN_KEY, next ? '1' : '0')
    } catch {
      // Not remembered; the list still folds.
    }
  }
  return (
    <details ref={ref} className="property-section property-alerts" open={open} onToggle={(e) => toggle(e.currentTarget.open)}>
      <summary>
        <h3>{t('properties.alerts.title')}</h3>
        <span className="muted">
          {t('properties.alerts.summary', { count: items.reduce((s, i) => s + i.warnings.length, 0), objects: items.length })}
        </span>
      </summary>
      <ul className="property-alerts-list">
        {items.map(({ row, warnings }) => (
          <li key={row.id}>
            <button type="button" className="btn-link property-alerts-object" onClick={() => onOpen(row.id)}>
              {row.name}
            </button>
            <Warnings warnings={warnings} asOf={asOf} onOpenDue={() => onOpen(row.id)} onSkip={(skip) => onSkip(row.id, skip)} />
          </li>
        ))}
      </ul>
    </details>
  )
}

function nameColumn(t: T, withDates: 'acquired' | 'none'): TableColumn<PropertyRow> {
  return {
    id: 'object',
    label: t('properties.col.object'),
    width: withDates === 'acquired' ? 270 : 210,
    minWidth: 140,
    sortValue: (r) => r.name,
    render: (r) => (
      <>
        <span className="property-name-row">
          <WarnMark t={t} row={r} />
          <span className="property-name" title={r.name}>
            {r.name}
          </span>
        </span>
        {withDates === 'acquired' && (r.kind || r.summary.acquired_on) ? (
          <span className="muted property-sub">
            {[r.kind ? t(`properties.kind.${r.kind}`) : '', r.summary.acquired_on ? t('properties.acquired', { date: formatDate(r.summary.acquired_on) }) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
        {withDates === 'acquired' && r.lease ? (
          <span className="muted property-sub" title={r.lease.suggested ? t('properties.lease.suggestedNote') : (r.lease.tenant ?? undefined)}>
            {[
              `${r.lease.suggested ? '★ ' : ''}${r.lease.tenant ?? t('properties.lease.tenantUnknown')}`,
              r.lease.rent ? t('properties.lease.perMonth', { amount: formatCents(rentWithoutWater(r.lease.rent)) }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </>
    ),
  }
}

/** The list's rent: the water advance is settled against use, so it is left out; parking stays. */
function rentWithoutWater(rent: { rent_snt: number; parking_snt?: number }): number {
  return rent.rent_snt + (rent.parking_snt ?? 0)
}

/** The running lease's rent balance, exact, arrears red and minus; † when other leases left a balance. */
function rentColumn(t: T, rows: PropertyRow[]): TableColumn<PropertyRow> {
  const current = (r: PropertyRow) => (r.rent?.current_snt != null ? tenantSide(r.rent.current_snt) : null)
  return {
    id: 'rent',
    label: t('properties.rent.col.portfolio'),
    title: t('properties.rent.col.portfolioHint'),
    width: 125,
    align: 'right',
    sortValue: (r) => current(r) ?? -1e12,
    cellClass: (r) => negClass(current(r)),
    render: (r) => (r.rent ? `${r.rent.current_snt != null ? formatCents(current(r)) : '–'}${r.rent.others_snt ? '†' : ''}` : ''),
    footer: formatCents(tenantSide(sum(rows, (r) => r.rent?.current_snt ?? 0))),
  }
}

function heldColumns(t: T, rows: PropertyRow[], data: PortfolioResponse): TableColumn<PropertyRow>[] {
  const hasValuations = rows.some((r) => r.valuation)
  const cols: TableColumn<PropertyRow>[] = [
    nameColumn(t, 'acquired'),
    {
      id: 'status',
      label: t('properties.col.status'),
      width: 140,
      sortValue: (r) => t(`properties.status.${r.status}`),
      render: (r) => <span className={statusClass(r.status)}>{t(`properties.status.${r.status}`)}</span>,
      footer: t('properties.total'),
    },
    ...(rows.some((r) => r.rent) ? [rentColumn(t, rows)] : []),
    {
      id: 'bookValue',
      label: t('properties.col.bookValue'),
      title: t('properties.col.bookValueHint'),
      width: 135,
      align: 'right',
      sortValue: (r) => r.summary.book_value_snt,
      render: (r) => formatEuro(r.summary.book_value_snt),
      footer: formatEuro(data.totals.book_value_snt),
    },
    {
      id: 't12m',
      label: t('properties.col.t12m'),
      title: t('properties.col.t12mHint'),
      width: 145,
      align: 'right',
      sortValue: (r) => r.t12m?.net_snt ?? 0,
      cellClass: (r) => negClass(r.t12m?.net_snt),
      render: (r) => (r.t12m ? `${formatEuro(r.t12m.net_snt)}${partWindow(r)}` : ''),
      footer: formatEuro(sum(rows, (r) => r.t12m?.net_snt)),
    },
    {
      id: 'yield',
      label: t('properties.col.yield'),
      title: t('properties.col.yieldHint'),
      width: 120,
      align: 'right',
      sortValue: (r) => r.t12m?.net_yield_bp ?? -1e9,
      cellClass: (r) => negClass(r.t12m?.net_yield_bp),
      render: (r) => (r.t12m?.net_yield_bp != null ? `${formatBp(r.t12m.net_yield_bp)}${partWindow(r)}` : ''),
      footer: formatBp(data.totals.net_yield_bp),
    },
    {
      id: 'irr',
      label: t('properties.col.irr'),
      title: t('properties.col.irrHint'),
      width: 80,
      align: 'right',
      sortValue: (r) => r.returns.market_bp ?? r.returns.at_cost_bp ?? -1e9,
      cellClass: (r) => negClass(r.returns.market_bp ?? r.returns.at_cost_bp),
      render: (r) => formatBp(r.returns.market_bp ?? r.returns.at_cost_bp),
      footer: formatBp(data.totals.held_irr_bp),
    },
    {
      id: 'unrecovered',
      label: t('properties.col.unrecovered'),
      title: t('properties.kpi.unrecoveredHint'),
      width: 140,
      align: 'right',
      sortValue: (r) => r.summary.unrecovered_snt,
      cellClass: (r) => (r.summary.unrecovered_snt < 0 ? 'property-gain' : ''),
      render: (r) => (r.status === 'unlinked' ? '' : formatEuro(r.summary.unrecovered_snt)),
      footer: formatEuro(data.totals.unrecovered_snt),
    },
    ...(rows.some((r) => r.summary.housing_share_snt != null)
      ? [
          {
            id: 'housingShare',
            label: t('properties.col.housingShare'),
            title: t('properties.col.housingShareHint'),
            width: 125,
            align: 'right',
            sortValue: (r) => r.summary.housing_share_snt ?? -1,
            render: (r) => (r.summary.housing_share_snt != null ? formatEuro(r.summary.housing_share_snt) : ''),
            footer: formatEuro(data.totals.housing_share_snt),
          } satisfies TableColumn<PropertyRow>,
        ]
      : []),
    {
      id: 'breakEven',
      label: t('properties.col.breakEven'),
      title: t('properties.col.breakEvenHint'),
      width: 125,
      align: 'right',
      sortValue: (r) => r.break_even?.price_snt ?? -1,
      render: (r) =>
        r.break_even ? (
          <>
            {formatEuro(r.break_even.price_snt)}
            {r.summary.housing_share_snt ? (
              <span className="muted property-sub">
                {t('properties.col.breakEvenDebtFree', { price: formatEuro(r.break_even.price_snt + r.summary.housing_share_snt) })}
              </span>
            ) : null}
          </>
        ) : (
          ''
        ),
    },
  ]
  if (hasValuations) {
    cols.push({
      id: 'valuation',
      label: t('properties.col.valuation'),
      title: t('properties.col.valuationHint'),
      width: 110,
      align: 'right',
      sortValue: (r) => r.valuation?.price_snt ?? -1,
      render: (r) => (r.valuation ? formatEuro(r.valuation.price_snt) : ''),
    })
  }
  return cols
}

/** The mark of an object owned for only part of the last 12 months: its figures are those months', not a year's. */
function partWindow(r: PropertyRow): string {
  return r.t12m && r.t12m.months < 12 ? '*' : ''
}

/** A footer figure, red below 0. */
function footerEuro(n: number): ReactNode {
  return <span className={negClass(n)}>{formatEuro(n)}</span>
}

/** A footer percentage, red below 0; empty without a base. */
function footerPct(bp: number | null): ReactNode {
  return bp == null ? '' : <span className={negClass(bp)}>{formatBp(bp)}</span>
}

/** What the cash flow table's cells show: the cash flow, the housing-company loans' repayment, the two together, or the yearly return. */
type CashView = 'net' | 'repaid' | 'gain' | 'pct'

const CASH_VIEW_KEY = 'tilari.properties.cash.view'

function readCashView(): CashView {
  try {
    const v = localStorage.getItem(CASH_VIEW_KEY)
    return v === 'repaid' || v === 'gain' || v === 'pct' ? v : 'net'
  } catch {
    return 'net'
  }
}

/**
 * A span's figures as one view shows them: no repayment without loans; a year's months with money in;
 * a sold object's sale in its sale year, with the shares it realized; the money that moved besides the
 * cash flow, where the span has it (not the last 12 months).
 */
type CashFigures = {
  net: number
  repaid: number | undefined
  money: number
  months?: number
  sale?: number
  realized?: number
  capex?: number
  proceeds?: number
  interest?: number
}

/**
 * The figure a view shows: euros, or the return in basis points (null without money in). The repayment
 * is the unrealized one: a sale year's less the shares the sale realized. The return is the operating
 * one, the repayment as paid and sales left out: a year's as earned in its months, a span without
 * months (all time, the last 12 months) a year's rate.
 */
function cashFigure(view: CashView, f: CashFigures): number | null {
  if (view === 'net') return f.net
  if (view === 'repaid') return f.repaid == null ? null : f.repaid - (f.realized ?? 0)
  if (view === 'gain') return f.net + (f.repaid ?? 0) - (f.realized ?? 0) + (f.sale ?? 0)
  return returnOn(f.net + (f.repaid ?? 0), f.money, f.months)
}

/** A return in basis points: over a year's months as earned, else as a year's rate. */
function returnOn(result: number, money: number, months: number | null | undefined): number | null {
  return months == null ? shareBp(result, money) : yearReturnBp(result, money, months)
}

function formatCashFigure(view: CashView, n: number | null): string {
  if (n == null) return ''
  return view === 'pct' ? formatBp(n) : formatEuro(n)
}

/** The views on offer: the repayment and the two together only with housing-company loans. */
function cashViews(loans: boolean): CashView[] {
  return loans ? ['net', 'repaid', 'gain', 'pct'] : ['net', 'pct']
}

/** Picks what the cash flow table's cells show; the choice is remembered in this browser. */
function CashViewPick({ t, views, view, onPick, sales }: { t: T; views: CashView[]; view: CashView; onPick: (v: CashView) => void; sales: boolean }) {
  const label: Record<CashView, string> = {
    net: t('properties.cash.net'),
    repaid: t('properties.cash.viewRepaid'),
    gain: t(sales ? 'properties.cash.result' : 'properties.cash.gain'),
    pct: t('properties.cash.viewPct'),
  }
  return (
    <div className="nav-mode property-cash-view" role="radiogroup" aria-label={t('properties.cash.view')}>
      {views.map((v) => (
        <label key={v} className={`nav-radio ${v === view ? 'is-active' : ''}`}>
          <input type="radio" name="property-cash-view" checked={v === view} onChange={() => onPick(v)} />
          {label[v]}
        </label>
      ))}
    </div>
  )
}

/** Whether the cash flow table and charts count the sold objects (owner, 2026-11-26); remembered in this browser. */
const WITH_SOLD_KEY = 'tilari.properties.cash.withSold'

function readWithSold(): boolean {
  try {
    return localStorage.getItem(WITH_SOLD_KEY) !== '0'
  } catch {
    return true
  }
}

/** The cash flow table's notes behind an "i": the open one shows under the table. */
const CASH_NOTES = { repaid: 'properties.cash.repaidHint', pctTotal: 'properties.cash.pctTotalHint' } as const
type CashNote = keyof typeof CASH_NOTES
type CashNotes = { open: CashNote | null; onToggle: (note: CashNote) => void }

/** Whether `rows` hold a sale (with the sold objects counted). */
function hasSales(rows: PropertyRow[]): boolean {
  return rows.some((r) => r.cash_years.some((y) => y.sale_snt != null))
}

/**
 * The cash flow by fiscal year, each object a row; `view` picks what the cells show. With
 * housing-company loans the summary adds the loans' repayment and the two together (ADR-035): above 0
 * the shares fell by more than the cash flow fell short, so the owner gained before any change in the
 * prices. With sold objects among `rows` (owner, 2026-11-26) a sale row adds what each sale realized in
 * its year - proceeds less the capital - and the sum is the result. The shares a sold object repaid
 * move there in its sale year (owner, 2026-11-27): the repayment row adds up to what the objects still
 * held have repaid, the same with the sold objects or without. The return rows set the result over the
 * money the owner had in the objects: the operating one (the repayment as paid) and, with sales, one
 * with them - a year's as earned over the months the money was in, never scaled to a year (owner,
 * 2026-11-27), the total column's the average a year. Then the return so far (owner, 2026-11-26/27):
 * the yearly return of the row above chained from the first year to the column's end; all time in the
 * total column. Then the money that moved: the purchases, the proceeds and all of it with the cash flow.
 * The summary row of the view shown is in bold. A year the money was in for fewer months than 12 says how many.
 * The repayment row and the total column's returns have an "i" (`notes`).
 */
function cashColumns(t: T, rows: PropertyRow[], data: PortfolioResponse, view: CashView, notes: CashNotes): TableColumn<PropertyRow>[] {
  const yearOf = (r: PropertyRow, starts: string) => r.cash_years.find((y) => y.starts === starts)
  const loans = rows.some((r) => r.cash_years.some((y) => y.principal_snt != null))
  const sales = hasSales(rows)
  const proceeds = rows.some((r) => r.cash_years.some((y) => y.proceeds_snt !== 0))
  const ownLoans = (r: PropertyRow) => r.cash_years.some((y) => y.principal_snt != null)
  const allYears = (r: PropertyRow, value: (y: YearCashFlow) => number | undefined) => r.cash_years.reduce((s, y) => s + (value(y) ?? 0), 0)
  const bold = (v: CashView, node: ReactNode) => (v === view ? <strong>{node}</strong> : node)
  const hinted = (key: string, label: string, hint: string, node: ReactNode = label) => (
    <span key={key} title={t(hint)}>
      {node}
    </span>
  )
  /** A year's result (with loans the repayment, with a sale what it realized). */
  const resultOf = (y: YearCashFlow) => y.net_snt + (y.principal_snt ?? 0) - (y.realized_snt ?? 0) + (y.sale_snt ?? 0)
  /** The months of each year any object had the owner's money in. */
  const moneyMonths = new Map(data.periods.map((p) => [p.starts, new Set(rows.flatMap((r) => yearOf(r, p.starts)?.money_months ?? []))]))
  const chained = returnSoFar(
    data.periods.map((p) => {
      const years = rows.flatMap((r) => r.cash_years.filter((y) => y.starts === p.starts))
      return {
        result_snt: years.reduce((s, y) => s + resultOf(y), 0),
        money_in_snt: years.reduce((s, y) => s + y.money_in_snt, 0),
        months: moneyMonths.get(p.starts)!.size,
      }
    }),
  )
  const sofar = new Map(data.periods.map((p, i) => [p.starts, chained[i]]))
  /** The summary rows under the cash flow, each a label and a column's figure from its sums (money rows and the return so far blank without them). */
  type Sums = {
    net: number
    repaid: number
    realized: number
    sale: number
    money: number
    capex: number | null
    proceeds: number | null
    interest: number | null
    sofar: number | null
    months: number | null
    /** The total column, whose return is the average a year. */
    total: boolean
  }
  const info = (note: CashNote) => <InfoButton note={t(CASH_NOTES[note])} open={notes.open === note} onToggle={() => notes.onToggle(note)} />
  /** The total column's return, with the "i" that says it is the average a year. */
  const averaged = (s: Sums, node: ReactNode) =>
    s.total && node ? (
      <span className="property-cash-info">
        <span>{node}</span>
        {info('pctTotal')}
      </span>
    ) : (
      node
    )
  const summaryRows: { label: ReactNode; cell: (s: Sums) => ReactNode }[] = [
    ...(loans
      ? [
          {
            label: (
              <span key="repaid" className="property-cash-info">
                <span>{bold('repaid', t('properties.cash.repaid'))}</span>
                {info('repaid')}
              </span>
            ),
            cell: (s: Sums) => bold('repaid', footerEuro(s.repaid - s.realized)),
          },
        ]
      : []),
    ...(sales
      ? [
          {
            label: hinted('sale', t('properties.cash.sale'), loans ? 'properties.cash.saleHint' : 'properties.cash.saleHintNoLoans'),
            cell: (s: Sums) =>
              s.realized ? (
                <span title={t('properties.cash.saleSplit', { change: formatEuro(s.sale - s.realized), realized: formatEuro(s.realized) })}>{footerEuro(s.sale)}</span>
              ) : (
                footerEuro(s.sale)
              ),
          },
        ]
      : []),
    ...(loans || sales
      ? [
          {
            label: bold('gain', t(sales ? 'properties.cash.result' : 'properties.cash.gain')),
            cell: (s: Sums) => bold('gain', footerEuro(s.net + s.repaid - s.realized + s.sale)),
          },
        ]
      : []),
    {
      label: hinted('pct', '', loans ? (sales ? 'properties.cash.pctHintSales' : 'properties.cash.pctHint') : 'properties.cash.pctHintNoLoans', bold('pct', t('properties.cash.pct'))),
      cell: (s: Sums) => bold('pct', averaged(s, footerPct(returnOn(s.net + s.repaid, s.money, s.months)))),
    },
    ...(sales
      ? [
          {
            label: hinted('pctSales', t('properties.cash.pctSales'), 'properties.cash.pctSalesHint'),
            cell: (s: Sums) => averaged(s, footerPct(returnOn(s.net + s.repaid - s.realized + s.sale, s.money, s.months))),
          },
        ]
      : []),
    {
      label: hinted('pctSofar', t('properties.cash.pctSofar'), 'properties.cash.pctSofarHint'),
      cell: (s: Sums) => (s.sofar == null ? '' : footerPct(s.sofar)),
    },
    { label: hinted('purchases', t('properties.cash.purchases'), 'properties.cash.purchasesHint'), cell: (s: Sums) => (s.capex == null ? '' : footerEuro(s.capex ? -s.capex : 0)) },
    ...(proceeds
      ? [{ label: hinted('proceeds', t('properties.cash.proceeds'), 'properties.cash.proceedsHint'), cell: (s: Sums) => (s.proceeds == null ? '' : footerEuro(s.proceeds)) }]
      : []),
    {
      label: hinted('moneyFlow', t('properties.cash.moneyFlow'), 'properties.cash.moneyFlowHint'),
      cell: (s: Sums) => (s.capex == null || s.proceeds == null || s.interest == null ? '' : footerEuro(s.net - s.interest - s.capex + s.proceeds)),
    },
  ]
  /** A column of figures: each object's in the chosen view, and the summary rows of them all. */
  const figures = (
    figuresOf: (r: PropertyRow) => CashFigures | null,
    column: { sofar?: number | null; months?: number | null; total?: boolean } = {},
  ): Pick<TableColumn<PropertyRow>, 'sortValue' | 'cellClass' | 'render' | 'footer' | 'footers'> => {
    const value = (r: PropertyRow) => {
      const f = figuresOf(r)
      return f ? cashFigure(view, f) : null
    }
    const money = (pick: (f: CashFigures) => number | undefined) => {
      const all = rows.map(figuresOf).filter((f): f is CashFigures => f != null)
      return all.some((f) => pick(f) == null) && all.length ? null : all.reduce((s, f) => s + (pick(f) ?? 0), 0)
    }
    const sums: Sums = {
      net: sum(rows, (r) => figuresOf(r)?.net),
      repaid: sum(rows, (r) => figuresOf(r)?.repaid),
      realized: sum(rows, (r) => figuresOf(r)?.realized),
      sale: sum(rows, (r) => figuresOf(r)?.sale),
      money: sum(rows, (r) => figuresOf(r)?.money),
      capex: money((f) => f.capex),
      proceeds: money((f) => f.proceeds),
      interest: money((f) => f.interest),
      sofar: column.sofar ?? null,
      months: column.months ?? null,
      total: column.total ?? false,
    }
    return {
      sortValue: (r) => value(r) ?? -1e9,
      cellClass: (r) => negClass(value(r)),
      render: (r) => {
        const f = figuresOf(r)
        const shown = formatCashFigure(view, value(r))
        // A sale's year in the result and in the repayment: marked, its parts on hover.
        if (f?.sale == null || (view !== 'gain' && !(view === 'repaid' && f.realized != null))) return shown
        const parts =
          view === 'repaid'
            ? t('properties.cash.realizedParts', { repaid: formatEuro(f.repaid ?? 0), realized: formatEuro(-(f.realized ?? 0)) })
            : f.realized == null
              ? t('properties.cash.salePartsNoLoans', { net: formatEuro(f.net), sale: formatEuro(f.sale) })
              : t('properties.cash.saleParts', {
                  net: formatEuro(f.net),
                  repaid: formatEuro(f.repaid ?? 0),
                  realized: formatEuro(-f.realized),
                  sale: formatEuro(f.sale),
                })
        return (
          <span className="property-cash-sale" title={parts}>
            {shown}
          </span>
        )
      },
      footer: bold('net', formatEuro(sums.net)),
      footers: summaryRows.map((row) => row.cell(sums)),
    }
  }
  const t12m = figures(
    (r) => (r.t12m ? { net: r.t12m.net_snt, repaid: r.t12m.principal_snt, money: r.t12m.money_in_snt, months: r.t12m.money_months.length } : null),
    { months: new Set(rows.flatMap((r) => r.t12m?.money_months ?? [])).size },
  )
  const all = data.periods.length ? (sofar.get(data.periods[data.periods.length - 1].starts) ?? null) : null
  const total = figures((r) => ({
    net: r.summary.operating.net_snt,
    repaid: ownLoans(r) ? allYears(r, (y) => y.principal_snt) : undefined,
    money: allYears(r, (y) => y.money_in_snt),
    ...(r.cash_years.some((y) => y.sale_snt != null) ? { sale: allYears(r, (y) => y.sale_snt), realized: allYears(r, (y) => y.realized_snt) } : {}),
    capex: allYears(r, (y) => y.capex_snt),
    proceeds: allYears(r, (y) => y.proceeds_snt),
    interest: allYears(r, (y) => y.interest_snt),
  }), { sofar: all, total: true })
  return [
    {
      ...nameColumn(t, 'none'),
      footer: bold('net', t('properties.cash.net')),
      footers: summaryRows.map((row) => row.label),
    },
    ...data.periods.map((p): TableColumn<PropertyRow> => {
      const covered = monthsCovered(p, data.as_of)
      const held = moneyMonths.get(p.starts)!.size
      const months = held > 0 && held < 12 ? held : covered
      const span = `${formatDate(p.starts)}–${formatDate(covered == null ? p.ends : data.as_of)}`
      return {
        id: `y${p.starts}`,
        label: months == null ? periodLabel(p) : t('properties.cash.partYear', { label: periodLabel(p), months }),
        title: held > 0 && held < 12 ? `${span}. ${t('properties.cash.moneyMonths', { months: held })}` : span,
        width: 105,
        align: 'right',
        ...figures((r) => {
          const y = yearOf(r, p.starts)
          return y
            ? {
                net: y.net_snt,
                repaid: y.principal_snt,
                money: y.money_in_snt,
                months: y.money_months.length,
                ...(y.sale_snt != null ? { sale: y.sale_snt, realized: y.realized_snt } : {}),
                capex: y.capex_snt,
                proceeds: y.proceeds_snt,
                interest: y.interest_snt,
              }
            : null
        }, { sofar: sofar.get(p.starts) ?? null, months: held }),
      }
    }),
    {
      id: 'total',
      label: t('properties.col.cashTotal'),
      title: t('properties.col.cashTotalHint'),
      width: 120,
      align: 'right',
      ...total,
      cellClass: (r) => `property-strong ${total.cellClass!(r)}`,
    },
    {
      id: 't12m',
      label: t('properties.col.t12m'),
      title: t('properties.col.t12mHint'),
      width: 110,
      align: 'right',
      ...t12m,
      render: (r) => {
        const shown = t12m.render(r)
        return shown && partWindow(r) ? <>{shown}*</> : shown
      },
    },
  ]
}

function soldColumns(t: T, rows: PropertyRow[], data: PortfolioResponse): TableColumn<PropertyRow>[] {
  const saleCosts = (r: PropertyRow) => r.summary.sale_price_snt - r.summary.proceeds_snt
  const bookGain = (r: PropertyRow) => r.summary.proceeds_snt - r.summary.disposed_cost_snt
  const total = (r: PropertyRow) => -r.summary.unrecovered_snt
  const spent = (r: PropertyRow) => r.summary.operating.expense_snt + (r.summary.interest_snt ?? 0)
  const money = (
    id: string,
    label: string,
    value: (r: PropertyRow) => number,
    opts: { title?: string; strong?: boolean; signed?: boolean } = {},
  ): TableColumn<PropertyRow> => ({
    id,
    label,
    title: opts.title,
    width: 100,
    align: 'right',
    sortValue: value,
    cellClass: (r) => [opts.strong ? 'property-strong' : '', opts.signed ? negClass(value(r)) : ''].filter(Boolean).join(' '),
    render: (r) => formatEuro(value(r)),
    footer: formatEuro(sum(rows, value)),
  })
  return [
    nameColumn(t, 'none'),
    {
      id: 'held',
      label: t('properties.col.held'),
      width: 160,
      sortValue: (r) => r.summary.sold_on ?? '',
      render: (r) => (
        <>
          {formatDate(r.summary.acquired_on)}–{formatDate(r.summary.sold_on)}
          <span className="muted property-sub">{holdingText(t, r.summary.acquired_on, r.summary.sold_on)}</span>
        </>
      ),
      footer: t('properties.total'),
    },
    money('invested', t('properties.col.purchase'), (r) => r.summary.invested_snt, { title: t('properties.col.purchaseHint') }),
    money('income', t('properties.col.income'), (r) => r.summary.operating.income_snt),
    money('spent', t('properties.col.spent'), spent, { title: t('properties.col.spentHint') }),
    money('price', t('properties.col.salePrice'), (r) => r.summary.sale_price_snt),
    money('saleCosts', t('properties.col.saleCosts'), saleCosts),
    money('bookGain', t('properties.col.bookGain'), bookGain, { title: t('properties.col.bookGainHint'), signed: true }),
    {
      id: 'total',
      label: t('properties.col.totalResult'),
      title: t('properties.col.totalResultHint'),
      width: 110,
      align: 'right',
      sortValue: total,
      cellClass: (r) => `property-strong ${negClass(total(r))}`,
      render: (r) => (
        <>
          {formatEuro(total(r))}
          <span className="muted property-sub">{formatBp(yieldBp(total(r), r.summary.invested_snt))}</span>
        </>
      ),
      footer: (
        <>
          {formatEuro(sum(rows, total))}
          <span className="muted property-sub">
            {formatBp(yieldBp(sum(rows, total), sum(rows, (r) => r.summary.invested_snt)))}
          </span>
        </>
      ),
    },
    {
      id: 'irr',
      label: t('properties.col.irr'),
      title: t('properties.col.irrSoldHint'),
      width: 80,
      align: 'right',
      sortValue: (r) => r.returns.actual_bp ?? -1e9,
      cellClass: (r) => negClass(r.returns.actual_bp),
      render: (r) => formatBp(r.returns.actual_bp),
      footer: formatBp(data.totals.sold_irr_bp),
    },
  ]
}

export function PortfolioView({ onOpen, onSetup, focusAlerts = false }: { onOpen: (id: number) => void; onSetup: () => void; focusAlerts?: boolean }) {
  const { t } = useI18n()
  const [reload, setReload] = useState(0)
  const { data, error, loading } = usePeriodQuery(() => fetchPortfolio(), [reload])

  const all = (data?.rows ?? []).filter((r) => r.status !== 'excluded')
  const held = all.filter((r) => r.status !== 'sold')
  const sold = all.filter((r) => r.status === 'sold')
  const openRow = (r: PropertyRow) => onOpen(r.id)
  const [cashView, setCashView] = useState<CashView>(readCashView)
  const views = cashViews(all.some((r) => r.cash_years.some((y) => y.principal_snt != null)))
  const shownView = views.includes(cashView) ? cashView : 'net'
  const pickCashView = (v: CashView) => {
    setCashView(v)
    try {
      localStorage.setItem(CASH_VIEW_KEY, v)
    } catch {
      // Not remembered; the table still switches.
    }
  }
  const [withSold, setWithSoldState] = useState(readWithSold)
  const [cashNote, setCashNote] = useState<CashNote | null>(null)
  const setWithSold = (next: boolean) => {
    setWithSoldState(next)
    try {
      localStorage.setItem(WITH_SOLD_KEY, next ? '1' : '0')
    } catch {
      // Not remembered; the table and charts still switch.
    }
  }
  const cashRows = withSold ? all : held

  return (
    <div className="ledger properties">
      <div className="ledger-head-intro">
        <h2 className="ledger-page-title">{t('properties.title')}</h2>
        <p className="lede">{t('properties.lead')}</p>
        {data ? (
          <p className="muted property-asof">
            {t('properties.asOf', { date: formatDate(data.as_of) })}
            {data.data_through ? ` · ${t('properties.dataThrough', { date: formatDate(data.data_through) })}` : ''}
            {' · '}
            <button type="button" className="btn-link" onClick={onSetup}>
              {t('properties.setupOpen')}
            </button>
          </p>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingGeneric')}</p> : null}

      {data && data.undecided > 0 ? (
        <div className="property-banner">
          <span>{t('properties.setupBanner', { n: data.undecided })}</span>
          <button type="button" className="btn-primary" onClick={onSetup}>
            {t('properties.setupOpen')}
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="overview-kpis">
          <Kpi label={t('properties.kpi.bookValue')} value={formatEuro(data.totals.book_value_snt)} hint={t('properties.kpi.bookValueHint')} />
          <Kpi
            label={t('properties.kpi.t12m')}
            value={formatEuro(data.totals.t12m_net_snt)}
            neg={data.totals.t12m_net_snt < 0}
            hint={data.totals.net_yield_bp != null ? t('properties.kpi.yieldHint', { pct: formatBp(data.totals.net_yield_bp) }) : undefined}
          />
          {data.totals.t12m_principal_snt != null ? (
            <Kpi
              label={t('properties.kpi.cashRepaid')}
              value={formatEuro(data.totals.t12m_net_snt + data.totals.t12m_principal_snt)}
              neg={data.totals.t12m_net_snt + data.totals.t12m_principal_snt < 0}
              hint={[
                t('properties.kpi.cashRepaidPart', { amount: formatEuro(data.totals.t12m_principal_snt) }),
                ...(data.totals.t12m_money_in_snt > 0
                  ? [
                      t('properties.kpi.cashRepaidPct', {
                        pct: formatBp(
                          yearReturnBp(data.totals.t12m_net_snt + data.totals.t12m_principal_snt, data.totals.t12m_money_in_snt, data.totals.t12m_money_months),
                        ),
                      }),
                    ]
                  : []),
              ].join(' · ')}
            />
          ) : null}
          <Kpi label={t('properties.kpi.unrecovered')} value={formatEuro(data.totals.unrecovered_snt)} hint={t('properties.kpi.unrecoveredHint')} />
          {data.totals.housing_share_snt != null ? (
            <Kpi
              label={t('properties.kpi.housingShares')}
              value={formatEuro(data.totals.housing_share_snt)}
              hint={t('properties.kpi.debtFreeUnrecovered', { amount: formatEuro(data.totals.unrecovered_snt + data.totals.housing_share_snt) })}
            />
          ) : null}
          <Kpi
            label={t('properties.kpi.portfolioIrr')}
            value={formatBp(data.totals.irr_bp)}
            neg={(data.totals.irr_bp ?? 0) < 0}
            hint={t('properties.kpi.portfolioIrrHint')}
          />
        </div>
      ) : null}

      {data ? (
        <>
          <AlertsList
            t={t}
            rows={[...held, ...sold]}
            asOf={data.as_of}
            focus={focusAlerts}
            onOpen={onOpen}
            onSkip={async (id, skip) => {
              await skipPropertyDocument(id, skip)
              setReload((n) => n + 1)
            }}
          />

          <section className="property-section">
            <h3>{t('properties.held.title', { n: held.length })}</h3>
            {held.length === 0 ? (
              <p className="empty">{t('properties.empty')}</p>
            ) : (
              <SortableTable
                storageKey="tilari.properties.held.cols"
                columns={heldColumns(t, held, data)}
                rows={held}
                rowKey={(r) => r.id}
                onRowClick={openRow}
                className="property-table"
              />
            )}
            <p className="muted property-footnote">
              {t('properties.footnote')}
              {data.rows.some((r) => r.lease?.suggested) ? ` ${t('properties.lease.suggestedNote')}` : ''}
            </p>
          </section>

          <PortfolioCharts chart={data.chart} rows={data.rows} withSold={withSold} onWithSold={setWithSold} />

          {all.length ? (
            <section className="property-section">
              <h3>{t('properties.cash.title')}</h3>
              <p className="muted">{t('properties.cash.lead')}</p>
              <div className="property-cash-controls">
                <CashViewPick t={t} views={views} view={shownView} onPick={pickCashView} sales={hasSales(cashRows)} />
                {sold.length ? (
                  <label className="allocation-check" title={t('properties.cash.withSoldHint')}>
                    <input type="checkbox" checked={withSold} onChange={() => setWithSold(!withSold)} />
                    {t('properties.cash.withSold')}
                  </label>
                ) : null}
              </div>
              <SortableTable
                storageKey="tilari.properties.cash.cols"
                columns={cashColumns(t, cashRows, data, shownView, { open: cashNote, onToggle: (n) => setCashNote(cashNote === n ? null : n) })}
                rows={cashRows}
                rowKey={(r) => r.id}
                onRowClick={openRow}
                className="property-table"
              />
              {cashNote ? <InfoNote note={t(CASH_NOTES[cashNote])} /> : null}
              {sold.length && !withSold ? <p className="muted property-footnote">{t('properties.cash.heldOnly')}</p> : null}
            </section>
          ) : null}

          {sold.length ? (
            <section className="property-section">
              <h3>{t('properties.sold.title', { n: sold.length })}</h3>
              <p className="muted">{t('properties.sold.lead')}</p>
              <SortableTable
                storageKey="tilari.properties.sold.cols"
                columns={soldColumns(t, sold, data)}
                rows={sold}
                rowKey={(r) => r.id}
                onRowClick={openRow}
                className="property-table"
              />
            </section>
          ) : null}

          <DefaultsForm key={data.settings.rev} settings={data.settings} defaults={data.forecast_defaults} onSaved={() => setReload((n) => n + 1)} />
        </>
      ) : null}
    </div>
  )
}
