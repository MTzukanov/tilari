import { useEffect, useRef, useState } from 'react'
import { fetchOverview, type OverviewResponse, type Period } from '../../../api'
import { getBcp47, useI18n } from '../../../i18n'
import { BarChart, type BarSeries } from '../../../shared/BarChart'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { usePeriodNav } from '../../../shared/usePeriodNav'

type SeriesKey = 'turnover_cents' | 'profit_cents' | 'tax_paid_cents'

type SeriesDef = BarSeries<SeriesKey>

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1))
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
            <BarChart
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
            <BarChart
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
