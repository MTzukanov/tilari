import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatBp, formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { fetchPortfolio, savePortfolioSettings, type PortfolioSettings, type PropertyRow } from '../api'
import { formatEuro, saveErrorText, statusClass } from './format'

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

export function PortfolioView({ onOpen, onSetup }: { onOpen: (id: number) => void; onSetup: () => void }) {
  const { t } = useI18n()
  const [showSold, setShowSold] = useState(false)
  const [reload, setReload] = useState(0)
  const { data, error, loading } = usePeriodQuery(() => fetchPortfolio(), [reload])

  const rows: PropertyRow[] = (data?.rows ?? []).filter(
    (r) => showSold || (r.status !== 'sold' && r.status !== 'excluded'),
  )
  const soldCount = (data?.rows ?? []).filter((r) => r.status === 'sold').length

  return (
    <div className="ledger properties">
      <div className="ledger-head-intro">
        <h2 className="ledger-page-title">{t('properties.title')}</h2>
        <p className="lede">{t('properties.lead')}</p>
        {data ? (
          <p className="muted property-asof">
            {t('properties.asOf', { date: formatDate(data.as_of) })}
            {data.data_through ? ` · ${t('properties.dataThrough', { date: formatDate(data.data_through) })}` : ''}
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
          <Kpi
            label={t('properties.kpi.unrecovered')}
            value={formatEuro(data.totals.unrecovered_snt)}
            hint={t('properties.kpi.unrecoveredHint')}
          />
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
          <div className="allocation-toggles">
            <label className="allocation-check">
              <input type="checkbox" checked={showSold} onChange={() => setShowSold(!showSold)} />
              {t('properties.showSold', { n: soldCount })}
            </label>
            <button type="button" className="allocation-toggle-btn" onClick={onSetup}>
              {t('properties.setupOpen')}
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="empty">{t('properties.empty')}</p>
          ) : (
            <div className="property-table-wrap">
              <table className="ledger-table property-table">
                <thead>
                  <tr>
                    <th>{t('properties.col.object')}</th>
                    <th>{t('properties.col.status')}</th>
                    <th className="amount">{t('properties.col.bookValue')}</th>
                    <th className="amount">{t('properties.col.t12m')}</th>
                    <th className="amount">{t('properties.col.yield')}</th>
                    <th className="amount">{t('properties.col.irr')}</th>
                    <th className="amount">{t('properties.col.unrecovered')}</th>
                    <th className="amount">{t('properties.col.breakEven')}</th>
                    <th className="amount">{t('properties.col.valuation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const irr = r.status === 'sold' ? r.returns.actual_bp : (r.returns.market_bp ?? r.returns.at_cost_bp)
                    return (
                      <tr
                        key={r.id}
                        className="clickable"
                        tabIndex={0}
                        onClick={() => onOpen(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpen(r.id)
                          }
                        }}
                      >
                        <td>
                          <span className="property-name">{r.name}</span>
                          {r.kind ? <span className="muted property-kind"> · {t(`properties.kind.${r.kind}`)}</span> : null}
                          {r.summary.acquired_on ? (
                            <span className="muted property-sub">
                              {t('properties.acquired', { date: formatDate(r.summary.acquired_on) })}
                              {r.summary.sold_on ? ` · ${t('properties.soldOn', { date: formatDate(r.summary.sold_on) })}` : ''}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={statusClass(r.status)}>{t(`properties.status.${r.status}`)}</span>
                        </td>
                        <td className="amount">{r.status === 'sold' ? '' : formatEuro(r.summary.book_value_snt)}</td>
                        <td className={`amount ${(r.t12m?.net_snt ?? 0) < 0 ? 'neg' : ''}`}>
                          {r.t12m ? formatEuro(r.t12m.net_snt) : ''}
                          {r.t12m?.annualized ? '*' : ''}
                        </td>
                        <td className={`amount ${(r.t12m?.net_yield_bp ?? 0) < 0 ? 'neg' : ''}`}>{formatBp(r.t12m?.net_yield_bp)}</td>
                        <td className={`amount ${(irr ?? 0) < 0 ? 'neg' : ''}`}>{formatBp(irr)}</td>
                        <td className={`amount ${r.summary.unrecovered_snt < 0 ? 'property-gain' : ''}`}>
                          {r.status === 'unlinked' ? '' : formatEuro(r.summary.unrecovered_snt)}
                        </td>
                        <td className="amount">
                          {r.break_even ? formatEuro(r.break_even.price_snt) : ''}
                          {r.break_even && !r.break_even.costs_set ? '†' : ''}
                        </td>
                        <td className="amount">
                          {r.valuation ? formatEuro(r.valuation.price_snt) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="muted property-footnote">{t('properties.footnote')}</p>
            </div>
          )}
          <DefaultsForm key={data.settings.rev} settings={data.settings} onSaved={() => setReload((n) => n + 1)} />
        </>
      ) : null}
    </div>
  )
}
