import { useId, useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { LineChart, type LineSeries, type PointTip } from '../../../shared/LineChart'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { PortfolioChart, PropertyRow } from '../api'
import { monthLabel } from './Charts'
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
}

const DEFAULTS: PortfolioChartOptions = { hidden: [], total: true, allMonths: false, combined: true, percent: false }

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
 * share, one coloured line each, with all of them together. One set of checkboxes serves them: the
 * combined chart, the total and the months, then the objects in columns with "all" and "none".
 */
export function PortfolioCharts({ chart, rows }: { chart: PortfolioChart; rows: PropertyRow[] }) {
  const { t } = useI18n()
  const locale = getBcp47()
  const [options, setOptionsState] = useState(loadPortfolioChartOptions)
  const objectsLabelId = useId()
  if (!chart.keys.length) return null
  const setOptions = (next: PortfolioChartOptions) => {
    setOptionsState(next)
    savePortfolioChartOptions(next)
  }
  const names = new Map(rows.map((r) => [r.id, r.name]))
  const objects = chart.objects.map((o, i) => ({ ...o, name: names.get(o.id) ?? String(o.id), ...objectStyle(i) }))
  const hidden = new Set(options.hidden)
  const long = chart.keys.length > 24
  const from = options.allMonths || !long ? 0 : chart.keys.length - 24
  const keys = chart.keys.slice(from)
  const totalLabel = t('properties.portfolioChart.total')

  const seriesOf = (pick: (o: (typeof objects)[number]) => (number | null)[], total: (number | null)[]): LineSeries[] => [
    ...objects
      .filter((o) => !hidden.has(o.id))
      .map((o) => ({ key: String(o.id), label: o.name, values: pick(o).slice(from), className: 'portfolio-line', color: o.color, dashed: o.dashed })),
    ...(options.total ? [{ key: 'total', label: totalLabel, values: total.slice(from), className: 'portfolio-total' }] : []),
  ]
  // A month's box: all of them together first, then each object's line in its colour.
  const pointTip =
    (series: LineSeries[], format: (v: number) => string = formatCents) =>
    (i: number): PointTip => ({
      title: monthName(keys[i], locale),
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
  const cash = seriesOf((o) => o.cash_snt, chart.total_cash_snt)
  // Objects without an investment linked have nothing to recover: no line there, maybe no chart.
  // In percent: each object's still to recover against its own capital put in, the total against the total.
  const unrecovered = (
    options.percent
      ? seriesOf(
          (o) => o.unrecovered_snt.map((v, i) => shareBp(v, o.invested_snt[i])),
          chart.total_unrecovered_snt.map((v, i) => shareBp(v, chart.total_invested_snt[i])),
        )
      : seriesOf((o) => o.unrecovered_snt, chart.total_unrecovered_snt)
  ).filter((s) => s.key === 'total' || s.values.some((v) => v != null))
  const invested = chart.objects.some((o) => o.unrecovered_snt.some((v) => v != null))
  const shares = seriesOf((o) => o.share_snt, chart.total_share_snt).filter((s) => s.key === 'total' || s.values.some((v) => v != null))
  const owed = chart.objects.some((o) => o.share_snt.some((v) => v != null))
  const combined: LineSeries[] = [
    { key: 'invested', label: t('properties.kpi.invested'), values: chart.total_invested_snt.slice(from), className: 'portfolio-line', color: COMBINED.invested },
    { key: 'back', label: t('properties.portfolioChart.back'), values: chart.total_back_snt.slice(from), className: 'portfolio-line', color: COMBINED.back },
    ...(invested
      ? [{ key: 'unrecovered', label: t('properties.kpi.unrecovered'), values: chart.total_unrecovered_snt.slice(from), className: 'portfolio-line', color: COMBINED.unrecovered }]
      : []),
    ...(owed
      ? [{ key: 'shares', label: t('properties.kpi.housingShares'), values: chart.total_share_snt.slice(from), className: 'portfolio-line', color: COMBINED.shares, dashed: true }]
      : []),
  ]
  const chartProps = {
    keys,
    labelFor: (key: string) => monthLabel(key, locale, true),
    nameFor: (key: string) => monthName(key, locale),
    locale,
    className: 'overview-chart property-chart',
  }

  return (
    <section className="overview-panel property-section portfolio-charts">
      <h3>{t('properties.portfolioChart.title')}</h3>
      <div className="overview-legend legend-columns">
        <label className="allocation-check">
          <input type="checkbox" checked={options.total} onChange={() => setOptions({ ...options, total: !options.total })} />
          <i className="overview-swatch portfolio-swatch-total" />
          {totalLabel}
        </label>
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
      </div>
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
          <LineChart {...chartProps} series={combined} label={t('properties.portfolioChart.combinedTitle')} pointTip={pointTip(combined)} />
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
            series={unrecovered}
            label={t('properties.portfolioChart.unrecovered')}
            pointTip={options.percent ? pointTip(unrecovered, (v) => formatBp(v)) : pointTip(unrecovered)}
            tickFormat={options.percent ? (v) => formatBp(v, 0) : undefined}
          />
        </>
      ) : null}
      <h4>{t('properties.portfolioChart.cash')}</h4>
      <LineChart {...chartProps} series={cash} label={t('properties.portfolioChart.cash')} pointTip={pointTip(cash)} />
      {owed ? (
        <>
          <h4>{t('properties.portfolioChart.shares')}</h4>
          <LineChart {...chartProps} series={shares} label={t('properties.portfolioChart.shares')} pointTip={pointTip(shares)} />
        </>
      ) : null}
    </section>
  )
}
