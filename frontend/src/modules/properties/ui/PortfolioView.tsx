import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatBp, formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { fetchPortfolio, savePortfolioSettings, type PortfolioResponse, type PortfolioSettings, type PropertyRow } from '../api'
import { formatEuro, holdingText, periodLabel, saveErrorText, statusClass } from './format'

function Kpi({ label, value, neg, hint }: { label: string; value: string; neg?: boolean; hint?: string }) {
  return (
    <div className="overview-kpi">
      <span className="overview-kpi-label">{label}</span>
      <strong className={neg ? 'neg' : ''}>{value || '–'}</strong>
      {hint ? <span className="muted property-kpi-hint">{hint}</span> : null}
    </div>
  )
}

function DefaultsForm({ settings, onSaved }: { settings: PortfolioSettings; onSaved: () => void }) {
  const { t } = useI18n()
  const [pct, setPct] = useState(formatPercentInput(settings.sale_costs?.pct_bp))
  const [fixed, setFixed] = useState(settings.sale_costs ? formatEurInput(settings.sale_costs.fixed_snt) : '')
  const [target, setTarget] = useState(formatPercentInput(settings.target_return_bp))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const pctBp = parsePercentInput(pct)
    const targetBp = parsePercentInput(target)
    if (Number.isNaN(pctBp) || Number.isNaN(targetBp)) {
      setError(t('properties.error.percent'))
      return
    }
    const next: PortfolioSettings = { ...settings }
    if (pctBp != null || fixed) next.sale_costs = { pct_bp: pctBp ?? 0, fixed_snt: parseEurInput(fixed) }
    else delete next.sale_costs
    if (targetBp != null) next.target_return_bp = targetBp
    else delete next.target_return_bp
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

function nameColumn(t: T, withDates: 'acquired' | 'none'): TableColumn<PropertyRow> {
  return {
    id: 'object',
    label: t('properties.col.object'),
    width: withDates === 'acquired' ? 270 : 220,
    minWidth: 140,
    sortValue: (r) => r.name,
    render: (r) => (
      <>
        <span className="property-name" title={r.name}>
          {r.name}
        </span>
        {withDates === 'acquired' && (r.kind || r.summary.acquired_on) ? (
          <span className="muted property-sub">
            {[r.kind ? t(`properties.kind.${r.kind}`) : '', r.summary.acquired_on ? t('properties.acquired', { date: formatDate(r.summary.acquired_on) }) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </>
    ),
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
      render: (r) => (r.t12m ? `${formatEuro(r.t12m.net_snt)}${r.t12m.annualized ? '*' : ''}` : ''),
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
      render: (r) => formatBp(r.t12m?.net_yield_bp),
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
    {
      id: 'breakEven',
      label: t('properties.col.breakEven'),
      title: t('properties.col.breakEvenHint'),
      width: 125,
      align: 'right',
      sortValue: (r) => r.break_even?.price_snt ?? -1,
      render: (r) => (r.break_even ? `${formatEuro(r.break_even.price_snt)}${r.break_even.costs_set ? '' : '†'}` : ''),
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

function cashColumns(t: T, rows: PropertyRow[], data: PortfolioResponse): TableColumn<PropertyRow>[] {
  const yearValue = (r: PropertyRow, starts: string) => r.cash_years.find((y) => y.starts === starts)?.net_snt ?? null
  return [
    nameColumn(t, 'none'),
    ...data.periods.map(
      (p): TableColumn<PropertyRow> => ({
        id: `y${p.starts}`,
        label: periodLabel(p),
        title: `${formatDate(p.starts)}–${formatDate(p.ends)}`,
        width: 105,
        align: 'right',
        sortValue: (r) => yearValue(r, p.starts) ?? 0,
        cellClass: (r) => negClass(yearValue(r, p.starts)),
        render: (r) => {
          const v = yearValue(r, p.starts)
          return v == null ? '' : formatEuro(v)
        },
        footer: formatEuro(sum(rows, (r) => yearValue(r, p.starts))),
      }),
    ),
    {
      id: 'total',
      label: t('properties.col.cashTotal'),
      title: t('properties.col.cashTotalHint'),
      width: 120,
      align: 'right',
      sortValue: (r) => r.summary.operating.net_snt,
      cellClass: (r) => `property-strong ${negClass(r.summary.operating.net_snt)}`,
      render: (r) => formatEuro(r.summary.operating.net_snt),
      footer: formatEuro(sum(rows, (r) => r.summary.operating.net_snt)),
    },
    {
      id: 't12m',
      label: t('properties.col.t12m'),
      title: t('properties.col.t12mHint'),
      width: 110,
      align: 'right',
      sortValue: (r) => r.t12m?.net_snt ?? 0,
      cellClass: (r) => negClass(r.t12m?.net_snt),
      render: (r) => (r.t12m ? `${formatEuro(r.t12m.net_snt)}${r.t12m.annualized ? '*' : ''}` : ''),
      footer: formatEuro(sum(rows, (r) => r.t12m?.net_snt)),
    },
  ]
}

function soldColumns(t: T, rows: PropertyRow[]): TableColumn<PropertyRow>[] {
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
    width: 106,
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
    money('total', t('properties.col.totalResult'), total, { title: t('properties.kpi.totalResultHint'), strong: true, signed: true }),
    {
      id: 'irr',
      label: t('properties.col.irr'),
      title: t('properties.kpi.irrActual'),
      width: 80,
      align: 'right',
      sortValue: (r) => r.returns.actual_bp ?? -1e9,
      cellClass: (r) => negClass(r.returns.actual_bp),
      render: (r) => formatBp(r.returns.actual_bp),
    },
  ]
}

export function PortfolioView({ onOpen, onSetup }: { onOpen: (id: number) => void; onSetup: () => void }) {
  const { t } = useI18n()
  const [reload, setReload] = useState(0)
  const { data, error, loading } = usePeriodQuery(() => fetchPortfolio(), [reload])

  const all = (data?.rows ?? []).filter((r) => r.status !== 'excluded')
  const held = all.filter((r) => r.status !== 'sold')
  const sold = all.filter((r) => r.status === 'sold')
  const openRow = (r: PropertyRow) => onOpen(r.id)

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
          <Kpi label={t('properties.kpi.unrecovered')} value={formatEuro(data.totals.unrecovered_snt)} hint={t('properties.kpi.unrecoveredHint')} />
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
            <p className="muted property-footnote">{t('properties.footnote')}</p>
          </section>

          {all.length ? (
            <section className="property-section">
              <h3>{t('properties.cash.title')}</h3>
              <p className="muted">{t('properties.cash.lead')}</p>
              <SortableTable
                storageKey="tilari.properties.cash.cols"
                columns={cashColumns(t, all, data)}
                rows={all}
                rowKey={(r) => r.id}
                onRowClick={openRow}
                className="property-table"
              />
            </section>
          ) : null}

          {sold.length ? (
            <section className="property-section">
              <h3>{t('properties.sold.title', { n: sold.length })}</h3>
              <p className="muted">{t('properties.sold.lead')}</p>
              <SortableTable
                storageKey="tilari.properties.sold.cols"
                columns={soldColumns(t, sold)}
                rows={sold}
                rowKey={(r) => r.id}
                onRowClick={openRow}
                className="property-table"
              />
            </section>
          ) : null}

          <DefaultsForm key={data.settings.rev} settings={data.settings} onSaved={() => setReload((n) => n + 1)} />
        </>
      ) : null}
    </div>
  )
}
