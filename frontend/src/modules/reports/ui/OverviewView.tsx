import { useEffect, useRef, useState } from 'react'
import { fetchOverview, type OverviewPoint, type OverviewResponse, type Period } from '../../../api'
import { getBcp47, useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { usePeriodNav } from '../../../shared/usePeriodNav'

type SeriesKey = 'turnover_cents' | 'profit_cents' | 'tax_paid_cents'

type SeriesDef = {
  key: SeriesKey
  className: string
  label: string
}

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1))
}

function formatAxisEur(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function niceMax(raw: number): number {
  if (raw <= 0) return 1
  const exp = Math.floor(Math.log10(raw))
  const base = 10 ** exp
  const n = raw / base
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * base
}

function DualBarChart({
  points,
  series,
  labelFor,
  locale,
}: {
  points: OverviewPoint[]
  series: SeriesDef[]
  labelFor: (key: string) => string
  locale: string
}) {
  const width = 680
  const height = 240
  const padL = 64
  const padR = 14
  const padT = 18
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const values = points.flatMap((p) => series.map((s) => p[s.key]))
  const rawMax = Math.max(1, ...values.map((v) => Math.abs(v)))
  const maxAbs = niceMax(rawMax)
  const hasNeg = values.some((v) => v < 0)
  const baseline = hasNeg ? padT + plotH / 2 : padT + plotH
  const scale = hasNeg ? plotH / (maxAbs * 2) : plotH / maxAbs
  const groupW = plotW / Math.max(points.length, 1)
  const gap = 2
  const barW = Math.min(16, (groupW * 0.7 - gap * (series.length - 1)) / series.length)
  const clusterW = series.length * barW + (series.length - 1) * gap

  const tickCents = hasNeg
    ? [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]
    : [0, maxAbs / 2, maxAbs]

  return (
    <svg className="overview-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {tickCents.map((cents) => {
        const y = baseline - cents * scale
        return (
          <g key={cents}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              className={cents === 0 ? 'overview-axis' : 'overview-grid'}
            />
            <text className="overview-y-tick" x={padL - 6} y={y + 3} textAnchor="end">
              {formatAxisEur(cents, locale)}
            </text>
          </g>
        )
      })}
      {points.map((p, i) => {
        const cx = padL + groupW * i + groupW / 2
        const startX = cx - clusterW / 2
        return (
          <g key={p.key}>
            {series.map((s, si) => {
              const value = p[s.key]
              if (value === 0) return null
              const h = Math.abs(value) * scale
              const y = value >= 0 ? baseline - h : baseline
              return (
                <rect
                  key={s.key}
                  className={s.className}
                  x={startX + si * (barW + gap)}
                  y={y}
                  width={barW}
                  height={h}
                >
                  <title>
                    {s.label}: {formatCents(value)}
                  </title>
                </rect>
              )
            })}
            <text className="overview-tick" x={cx} y={height - 10} textAnchor="middle">
              {labelFor(p.key)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function OverviewView({
  periods,
  period,
  onPeriodEnd,
  onBack,
}: {
  periods: Period[]
  period: Period | null
  onPeriodEnd: (ends: string) => void
  onBack: () => void
}) {
  const { t } = useI18n()
  const last = periods.at(-1)
  const seed = period ?? last ?? null
  const initialRef = useRef<{ starts: string; ends: string } | null>(
    seed ? { starts: seed.starts, ends: seed.ends } : null,
  )
  if (!initialRef.current && seed) {
    initialRef.current = { starts: seed.starts, ends: seed.ends }
  }
  const nav = usePeriodNav(
    periods,
    initialRef.current?.starts ?? '',
    initialRef.current?.ends ?? '',
  )
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (nav.end_date) onPeriodEnd(nav.end_date)
  }, [nav.end_date, onPeriodEnd])

  useEffect(() => {
    if (!nav.end_date) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchOverview(nav.end_date)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nav.end_date])

  const chartLocale = getBcp47()
  const monthSeries: SeriesDef[] = [
    {
      key: 'turnover_cents',
      className: 'overview-bar-turnover',
      label: t('reports.overviewTurnover'),
    },
    {
      key: 'profit_cents',
      className: 'overview-bar-profit',
      label: t('reports.overviewProfit'),
    },
  ]
  const yearSeries: SeriesDef[] = [
    ...monthSeries,
    {
      key: 'tax_paid_cents',
      className: 'overview-bar-tax',
      label: t('reports.overviewTaxPaid'),
    },
  ]

  return (
    <div className="overview">
      <button type="button" className="nav-link muted" onClick={onBack}>
        {t('up.reportsHub')}
      </button>
      <PeriodNav
        radioName="overview-nav-mode"
        mode={nav.mode}
        start_date={nav.start_date}
        end_date={nav.end_date}
        canPrev={nav.canPrev}
        canNext={nav.canNext}
        periods={periods}
        sticky
        onSelectMode={nav.selectMode}
        onSelectRange={nav.selectRange}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
      />
      <div className="overview-head">
        <h2>{t('reports.overviewTitle')}</h2>
        <p className="muted">{t('reports.overviewLead')}</p>
      </div>

      {loading ? <p className="muted">{t('app.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <>
          <div className="overview-kpis">
            <div className="overview-kpi">
              <span className="overview-kpi-label">{t('reports.overviewTurnover')}</span>
              <strong>{formatCents(data.turnover_cents)}</strong>
              <span className="muted">
                {data.period.starts} – {data.period.ends}
              </span>
            </div>
            <div className="overview-kpi">
              <span className="overview-kpi-label">{t('reports.overviewProfit')}</span>
              <strong className={data.profit_cents < 0 ? 'neg' : undefined}>
                {formatCents(data.profit_cents)}
              </strong>
              <span className="muted">
                {data.period.starts} – {data.period.ends}
              </span>
            </div>
            <div className="overview-kpi">
              <span className="overview-kpi-label">
                {data.tax_booked ? t('reports.overviewTaxEstimateBooked') : t('reports.overviewTaxEstimate')}
              </span>
              <strong className={data.tax_unpaid_cents != null && data.tax_unpaid_cents < 0 ? 'neg' : undefined}>
                {data.tax_estimate_cents == null ? '—' : formatCents(data.tax_estimate_cents)}
              </strong>
              <span className="muted">
                {data.tax_unpaid_cents == null
                  ? t('reports.overviewTaxEstimateHint')
                  : t('reports.overviewTaxUnpaid', { amount: formatCents(data.tax_unpaid_cents) })}
              </span>
            </div>
          </div>

          <section className="overview-panel">
            <h3>{t('reports.overviewMonths')}</h3>
            <div className="overview-legend" aria-hidden="true">
              <span>
                <i className="overview-swatch turnover" />
                {t('reports.overviewTurnover')}
              </span>
              <span>
                <i className="overview-swatch profit" />
                {t('reports.overviewProfit')}
              </span>
            </div>
            <DualBarChart
              points={data.months}
              series={monthSeries}
              labelFor={(key) => monthLabel(key, chartLocale)}
              locale={chartLocale}
            />
          </section>

          <section className="overview-panel">
            <h3>{t('reports.overviewYears')}</h3>
            <div className="overview-legend" aria-hidden="true">
              <span>
                <i className="overview-swatch turnover" />
                {t('reports.overviewTurnover')}
              </span>
              <span>
                <i className="overview-swatch profit" />
                {t('reports.overviewProfit')}
              </span>
              <span>
                <i className="overview-swatch tax" />
                {t('reports.overviewTaxPaid')}
              </span>
            </div>
            <DualBarChart
              points={data.years}
              series={yearSeries}
              labelFor={(key) => key}
              locale={chartLocale}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}
