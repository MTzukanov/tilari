import { useEffect, useId, useState, type ReactNode } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { LineChart, type LineSeries, type PointTip } from '../../../shared/LineChart'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { PortfolioChart, PropertyRow } from '../api'
import { CashFlowChart, CashFlowChecks, monthLabel } from './Charts'
import { loadCashFlowOptions, saveCashFlowOptions, type CashFlowOptions } from './chartOptions'
import { monthName } from './format'

/** Categorical hues in fixed order (validated on white); a 9th object repeats them dashed. */
export const OBJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

export const PORTFOLIO_CHART_KEY = 'tilari.properties.portfolioChart'

export type PortfolioChartOptions = {
  /** Objects whose lines are hidden (the total still counts them). */
  hidden: number[]
  total: boolean
  allMonths: boolean
  /** The totals on one chart first: capital put in, cash flow, money to recover, loan shares. */
  combined: boolean
  /** The unrecovered chart as a percentage of each object's capital put in, so objects of any size compare. */
  percent: boolean
  /** Every chart run on over the months ahead, an estimate (`PortfolioChart.ahead_keys`, ADR-035). */
  forecast: boolean
}

const DEFAULTS: PortfolioChartOptions = {
  hidden: [],
  total: true,
  allMonths: false,
  combined: true,
  percent: false,
  forecast: false,
}

export function loadPortfolioChartOptions(): PortfolioChartOptions {
  try {
    const raw = localStorage.getItem(PORTFOLIO_CHART_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return {
      hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((n): n is number => typeof n === 'number') : [],
      total: typeof stored.total === 'boolean' ? stored.total : DEFAULTS.total,
      allMonths: typeof stored.allMonths === 'boolean' ? stored.allMonths : DEFAULTS.allMonths,
      combined: typeof stored.combined === 'boolean' ? stored.combined : DEFAULTS.combined,
      percent: typeof stored.percent === 'boolean' ? stored.percent : DEFAULTS.percent,
      forecast: typeof stored.forecast === 'boolean' ? stored.forecast : DEFAULTS.forecast,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function savePortfolioChartOptions(options: PortfolioChartOptions): void {
  try {
    localStorage.setItem(PORTFOLIO_CHART_KEY, JSON.stringify(options))
  } catch {
    // Private window or blocked storage: the choice lasts until the page closes.
  }
}

/** The combined chart's lines: one colour each, the loan shares dashed (they are owed, not paid). */
const COMBINED = {
  invested: '#6b7280',
  back: 'var(--ink)',
  unrecovered: '#2f6fed',
  shares: '#c45c26',
} as const

/** `part` of `whole` in basis points (10 000 = 100 %); null without a whole to measure against. */
export function shareBp(part: number | null, whole: number | null): number | null {
  return part == null || whole == null || whole <= 0 ? null : Math.round((part * 10000) / whole)
}

/** The cash flow and repayments chart: what went out of pocket, what went into the shares, what the sales realized, and all together (ink). */
const REPAID = {
  cash: '#c45c26',
  repaid: '#1baf7a',
  realized: '#6250d6',
} as const

/** An object's colour and dash by its place in the chart (not by what is shown, so hiding one repaints none). */
export function objectStyle(index: number): { color: string; dashed: boolean } {
  return { color: OBJECT_COLORS[index % OBJECT_COLORS.length], dashed: index >= OBJECT_COLORS.length }
}

function Swatch({ color, dashed }: { color: string; dashed: boolean }) {
  return (
    <i
      className="overview-swatch property-swatch-line"
      style={{
        background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 6px)` : color,
      }}
    />
  )
}

/**
 * The Properties page's charts. First, when chosen, the totals on one chart, over the objects the
 * unrecovered total counts: the capital put in, what has come back (cash flow and sale proceeds),
 * the gap between them that is still to recover, and the housing-company loan shares (ADR-034) - on
 * one scale, where they meet or part.
 * Then each measure on its own chart: every object's money still to recover, its cash flow, its
 * share, one coloured line each, with all of them together. The cash flow summed or, switched, each
 * month's as a bar, the estimate's faded. With the forecast chosen every line runs
 * on faded over the months ahead (`ahead_keys`, ADR-035). One set of checkboxes serves them: the total,
 * the combined chart, the months and the forecast, then the objects in columns with "all" and "none".
 * The cash flow charts count the sold objects only with `withSold` (owner, 2026-11-26), a choice the
 * cash flow table shares: then what the sales realized is a line of its own. A click on a month's bar
 * picks `selectedMonth` (none ahead), whose lines the caller gives as `monthPanel`, shown under it.
 */
export function PortfolioCharts({
  chart,
  rows,
  withSold,
  onWithSold,
  selectedMonth = null,
  onSelectMonth,
  monthPanel,
}: {
  chart: PortfolioChart
  rows: PropertyRow[]
  withSold: boolean
  onWithSold: (next: boolean) => void
  selectedMonth?: string | null
  onSelectMonth?: (month: string | null) => void
  monthPanel?: ReactNode
}) {
  const { t } = useI18n()
  const locale = getBcp47()
  const [options, setOptionsState] = useState(loadPortfolioChartOptions)
  const [cashOptions, setCashOptionsState] = useState(loadCashFlowOptions)
  const setCashOptions = (next: CashFlowOptions) => {
    setCashOptionsState(next)
    saveCashFlowOptions(next)
  }
  const objectsLabelId = useId()
  const long = chart.keys.length > 24
  // A month asked for further back than the last 24: all of them.
  useEffect(() => {
    if (selectedMonth && long && !options.allMonths && chart.keys.indexOf(selectedMonth) >= 0 && chart.keys.indexOf(selectedMonth) < chart.keys.length - 24) {
      setOptionsState((o) => ({ ...o, allMonths: true }))
    }
  }, [selectedMonth, long, options.allMonths, chart.keys])
  if (!chart.keys.length) return null
  const setOptions = (next: PortfolioChartOptions) => {
    setOptionsState(next)
    savePortfolioChartOptions(next)
  }
  const names = new Map(rows.map((r) => [r.id, r.name]))
  const objects = chart.objects.map((o, i) => ({ ...o, name: names.get(o.id) ?? String(o.id), ...objectStyle(i) }))
  const hidden = new Set(options.hidden)
  const from = options.allMonths || !long ? 0 : chart.keys.length - 24
  const keys = chart.keys.slice(from)
  const totalLabel = t('properties.portfolioChart.total')
  // With the forecast on, every line runs on over `ahead_keys` (ADR-035).
  const ahead = options.forecast && chart.ahead_keys.length > 0
  const allKeys = ahead ? [...keys, ...chart.ahead_keys] : keys
  /** A line's values over the months shown: followed, then estimated with the forecast on. */
  const runOn = (values: (number | null)[], after: (number | null)[]) => (ahead ? [...values.slice(from), ...after] : values.slice(from))

  const anySold = chart.objects.some((o) => o.sold)
  const seriesOf = (
    pick: (o: (typeof objects)[number]) => (number | null)[],
    total: (number | null)[],
    pickAhead: (o: (typeof objects)[number]) => (number | null)[],
    totalAhead: (number | null)[],
  ): LineSeries[] => [
    ...objects
      .filter((o) => !hidden.has(o.id))
      .map((o) => ({ key: String(o.id), label: o.name, values: runOn(pick(o), pickAhead(o)), className: 'portfolio-line', color: o.color, dashed: o.dashed })),
    ...(options.total ? [{ key: 'total', label: totalLabel, values: runOn(total, totalAhead), className: 'portfolio-total' }] : []),
  ]
  /**
   * The lines as drawn: solid over the months followed and, with the forecast on, faded from the last
   * of them in their own colour and dash. A month's box reads each line whole.
   */
  const drawn = (series: LineSeries[]): LineSeries[] =>
    ahead
      ? series.flatMap((s): LineSeries[] => {
          const solid = { ...s, values: s.values.map((v, i) => (i < keys.length ? v : null)) }
          if (!s.values.slice(keys.length).some((v) => v != null)) return [solid]
          const after = s.values.map((v, i) => (i >= keys.length - 1 ? v : null))
          return [solid, { ...s, key: `${s.key}-ahead`, className: `${s.className} portfolio-ahead`, values: after }]
        })
      : series
  // A month's box: all of them together first, then each object's line in its colour; a month after `keys` is an estimate.
  const pointTip =
    (series: LineSeries[], format: (v: number) => string = formatCents, months: string[] = allKeys) =>
    (i: number): PointTip => ({
      title: i < keys.length ? monthName(months[i], locale) : t('properties.housing.path.forecastMonth', { month: monthName(months[i], locale) }),
      rows: [...series]
        .reverse()
        .flatMap((s) =>
          s.values[i] == null ? [] : [{ label: s.label, value: format(s.values[i]!), color: s.color ?? (s.key === 'total' ? 'var(--ink)' : undefined) }],
        ),
    })

  const toggle = (id: number) =>
    setOptions({ ...options, hidden: hidden.has(id) ? options.hidden.filter((h) => h !== id) : [...options.hidden, id] })
  // "All" and "none" act on the objects' lines only: the total and the months are choices of their own.
  const noneHidden = objects.every((o) => !hidden.has(o.id))
  const allHidden = objects.every((o) => hidden.has(o.id))
  // The cash flow by month as on an object's page (owner, 2026-11-27): all the objects' income and costs
  // as bars, the sold ones by choice, and the cash flow summed as a line; with the forecast the months ahead faded.
  const income = withSold ? chart.total_income_snt : chart.held_income_snt
  const costs = withSold ? chart.total_costs_snt : chart.held_costs_snt
  const cashTotal = withSold ? chart.total_cash_snt : chart.held_cash_snt
  const cashAhead = withSold ? chart.total_cash_ahead_snt : chart.held_cash_ahead_snt
  const cashMonths = [
    ...chart.keys.map((key, i) => ({ key, income_snt: income[i], expense_snt: costs[i], interest_snt: 0 })).slice(from),
    ...(ahead ? chart.ahead_keys.map((key, i) => ({ key, income_snt: chart.income_ahead_snt[i], expense_snt: chart.costs_ahead_snt[i], interest_snt: 0 })) : []),
  ]
  const estimated = new Set(ahead ? chart.ahead_keys : [])
  const monthTitle = (key: string) =>
    estimated.has(key) ? t('properties.housing.path.forecastMonth', { month: monthName(key, locale) }) : monthName(key, locale)
  // Objects without an investment linked have nothing to recover: no line there, maybe no chart.
  // In percent: each object's still to recover against its own capital put in, the total against the total.
  const unrecovered = (
    options.percent
      ? seriesOf(
          (o) => o.unrecovered_snt.map((v, i) => shareBp(v, o.invested_snt[i])),
          chart.total_unrecovered_snt.map((v, i) => shareBp(v, chart.total_invested_snt[i])),
          (o) => o.unrecovered_ahead_snt.map((v, i) => shareBp(v, o.invested_ahead_snt[i])),
          chart.total_unrecovered_ahead_snt.map((v, i) => shareBp(v, chart.total_invested_ahead_snt[i])),
        )
      : seriesOf((o) => o.unrecovered_snt, chart.total_unrecovered_snt, (o) => o.unrecovered_ahead_snt, chart.total_unrecovered_ahead_snt)
  ).filter((s) => s.key === 'total' || s.values.some((v) => v != null))
  const invested = chart.objects.some((o) => o.unrecovered_snt.some((v) => v != null))
  const shares = seriesOf((o) => o.share_snt, chart.total_share_snt, (o) => o.share_ahead_snt, chart.total_share_ahead_snt).filter(
    (s) => s.key === 'total' || s.values.some((v) => v != null),
  )
  const owed = chart.objects.some((o) => o.share_snt.some((v) => v != null))
  // The objects' own lines are on the charts of the money to recover and the shares; without them, no choice of objects.
  const perObject = invested || owed
  const combined: LineSeries[] = [
    {
      key: 'invested',
      label: t('properties.kpi.invested'),
      values: runOn(chart.total_invested_snt, chart.total_invested_ahead_snt),
      className: 'portfolio-line',
      color: COMBINED.invested,
    },
    { key: 'back', label: t('properties.portfolioChart.back'), values: runOn(chart.total_back_snt, chart.total_back_ahead_snt), className: 'portfolio-line', color: COMBINED.back },
    ...(invested
      ? [
          {
            key: 'unrecovered',
            label: t('properties.kpi.unrecovered'),
            values: runOn(chart.total_unrecovered_snt, chart.total_unrecovered_ahead_snt),
            className: 'portfolio-line',
            color: COMBINED.unrecovered,
          },
        ]
      : []),
    ...(owed
      ? [
          {
            key: 'shares',
            label: t('properties.kpi.housingShares'),
            values: runOn(chart.total_share_snt, chart.total_share_ahead_snt),
            className: 'portfolio-line',
            color: COMBINED.shares,
            dashed: true,
          },
        ]
      : []),
  ]
  // Cash flow against the loans' repayment (ADR-035): above 0 together, the shares fell by more than
  // the cash flow fell short. With the sold objects, what their sales realized: the sum is their results.
  const realizing = withSold && anySold
  const cashLine = withSold ? runOn(chart.total_cash_snt, chart.total_cash_ahead_snt) : runOn(chart.held_cash_snt, chart.held_cash_ahead_snt)
  const repaidLine = withSold ? runOn(chart.total_repaid_snt, chart.total_repaid_ahead_snt) : runOn(chart.held_repaid_snt, chart.held_repaid_ahead_snt)
  const realizedLine = runOn(chart.total_realized_snt, chart.total_realized_ahead_snt)
  const repaidLines: LineSeries[] = [
    { key: 'cash', label: t('properties.portfolioChart.cash'), values: cashLine, className: 'portfolio-line', color: REPAID.cash },
    { key: 'repaid', label: t('properties.portfolioChart.repaid'), values: repaidLine, className: 'portfolio-line', color: REPAID.repaid },
    ...(realizing
      ? [{ key: 'realized', label: t('properties.portfolioChart.realized'), values: realizedLine, className: 'portfolio-line', color: REPAID.realized }]
      : []),
    {
      key: 'gain',
      label: t(realizing ? 'properties.portfolioChart.result' : 'properties.portfolioChart.gain'),
      values: cashLine.map((v, i) =>
        v == null || repaidLine[i] == null ? null : v + repaidLine[i]! + (realizing ? (realizedLine[i] ?? 0) : 0),
      ),
      className: 'portfolio-total',
    },
  ]
  const chartProps = {
    keys: allKeys,
    labelFor: (key: string) => monthLabel(key, locale, true),
    nameFor: (key: string) => monthName(key, locale),
    locale,
    className: 'overview-chart property-chart',
  }

  return (
    <section className="overview-panel property-section portfolio-charts">
      <h3>{t('properties.portfolioChart.title')}</h3>
      <div className="overview-legend legend-columns">
        {perObject ? (
          <label className="allocation-check">
            <input type="checkbox" checked={options.total} onChange={() => setOptions({ ...options, total: !options.total })} />
            <i className="overview-swatch portfolio-swatch-total" />
            {totalLabel}
          </label>
        ) : null}
        <label className="allocation-check">
          <input type="checkbox" checked={options.combined} onChange={() => setOptions({ ...options, combined: !options.combined })} />
          {t('properties.portfolioChart.combined')}
        </label>
        {long ? (
          <label className="allocation-check">
            <input type="checkbox" checked={options.allMonths} onChange={() => setOptions({ ...options, allMonths: !options.allMonths })} />
            {t('properties.portfolioChart.allMonths')}
          </label>
        ) : null}
        {chart.ahead_keys.length ? (
          <label className="allocation-check">
            <input type="checkbox" checked={options.forecast} onChange={() => setOptions({ ...options, forecast: !options.forecast })} />
            <i className="overview-swatch portfolio-swatch-ahead" />
            {t('properties.portfolioChart.forecast')}
          </label>
        ) : null}
        {anySold ? (
          <label className="allocation-check" title={t('properties.cash.withSoldHint')}>
            <input type="checkbox" checked={withSold} onChange={() => onWithSold(!withSold)} />
            {t('properties.cash.withSold')}
          </label>
        ) : null}
      </div>
      {perObject ? (
        <>
          <div className="portfolio-objects-head">
            <span id={objectsLabelId} className="portfolio-objects-label">
              {t('properties.portfolioChart.objects')}
            </span>
            <button type="button" className="btn-link btn-quiet" disabled={noneHidden} onClick={() => setOptions({ ...options, hidden: [] })}>
              {t('properties.portfolioChart.checkAll')}
            </button>
            <button
              type="button"
              className="btn-link btn-quiet"
              disabled={allHidden}
              onClick={() => setOptions({ ...options, hidden: objects.map((o) => o.id) })}
            >
              {t('properties.portfolioChart.uncheckAll')}
            </button>
          </div>
          <div className="overview-legend legend-columns portfolio-objects" role="group" aria-labelledby={objectsLabelId}>
            {objects.map((o) => (
              <label key={o.id} className="allocation-check">
                <input type="checkbox" checked={!hidden.has(o.id)} onChange={() => toggle(o.id)} />
                <Swatch color={o.color} dashed={o.dashed} />
                {o.name}
              </label>
            ))}
          </div>
          <p className="muted property-kpi-hint">{t('properties.portfolioChart.lead')}</p>
        </>
      ) : null}
      {options.combined ? (
        <>
          <h4>{t('properties.portfolioChart.combinedTitle')}</h4>
          <div className="overview-legend">
            {combined.map((s) => (
              <span key={s.key} className="allocation-check">
                <Swatch color={s.color!} dashed={Boolean(s.dashed)} />
                {s.label}
              </span>
            ))}
          </div>
          <LineChart {...chartProps} series={drawn(combined)} label={t('properties.portfolioChart.combinedTitle')} pointTip={pointTip(combined)} />
        </>
      ) : null}
      {invested ? (
        <>
          <h4>{t('properties.portfolioChart.unrecovered')}</h4>
          <div className="overview-legend">
            <label className="allocation-check">
              <input type="checkbox" checked={options.percent} onChange={() => setOptions({ ...options, percent: !options.percent })} />
              {t('properties.portfolioChart.percent')}
            </label>
          </div>
          <LineChart
            {...chartProps}
            series={drawn(unrecovered)}
            label={t('properties.portfolioChart.unrecovered')}
            pointTip={options.percent ? pointTip(unrecovered, (v) => formatBp(v)) : pointTip(unrecovered)}
            tickFormat={options.percent ? (v) => formatBp(v, 0) : undefined}
          />
        </>
      ) : null}
      <h4>{t('properties.chart.cashFlow')}</h4>
      <CashFlowChecks options={cashOptions} onOptions={setCashOptions} />
      <div role="group" aria-label={t('properties.chart.cashFlow')}>
        <CashFlowChart
          months={cashMonths}
          options={cashOptions}
          totals={cashOptions.total ? [...cashTotal.slice(from), ...(ahead ? cashAhead : [])] : undefined}
          estimateFrom={ahead ? keys.length : undefined}
          monthTitle={monthTitle}
          selectedKey={selectedMonth}
          onSelect={onSelectMonth ? (key) => onSelectMonth(key === selectedMonth ? null : key) : undefined}
          labels={{
            income: t('properties.chart.income'),
            expense: t('properties.chart.expense'),
            net: t('properties.chart.net'),
            total: t('properties.chart.total'),
            clickHint: t('properties.chart.clickHint'),
          }}
        />
      </div>
      {monthPanel}
      {owed ? (
        <>
          <h4>{t('properties.portfolioChart.repaidTitle')}</h4>
          <div className="overview-legend">
            {repaidLines.map((s) => (
              <span key={s.key} className="allocation-check">
                {s.color ? <Swatch color={s.color} dashed={false} /> : <i className="overview-swatch portfolio-swatch-total" />}
                {s.label}
              </span>
            ))}
          </div>
          <LineChart {...chartProps} series={drawn(repaidLines)} label={t('properties.portfolioChart.repaidTitle')} pointTip={pointTip(repaidLines)} />
        </>
      ) : null}
      {owed ? (
        <>
          <h4>{t('properties.portfolioChart.shares')}</h4>
          <LineChart {...chartProps} series={drawn(shares)} label={t('properties.portfolioChart.shares')} pointTip={pointTip(shares)} />
        </>
      ) : null}
    </section>
  )
}
