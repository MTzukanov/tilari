import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { PropertyDetail, RentBalance } from '../api'
import { formatEuro, tenantSide } from './format'

export function Kpi({ label, value, neg, hint, title }: { label: string; value: string; neg?: boolean; hint?: string; title?: string }) {
  return (
    <div className="overview-kpi" title={title}>
      <span className="overview-kpi-label">{label}</span>
      <strong className={neg ? 'neg' : ''}>{value || '–'}</strong>
      {hint ? <span className="muted property-kpi-hint">{hint}</span> : null}
    </div>
  )
}

/** The running lease's rent balance, exact; what other leases left in the hint, minus when owed. */
export function RentKpi({ rent }: { rent: RentBalance }) {
  const { t } = useI18n()
  const current = rent.current_snt
  const others = tenantSide(rent.others_snt)
  const label =
    current == null || current === 0 ? 'properties.rent.kpi' : current > 0 ? 'properties.rent.kpiArrears' : 'properties.rent.kpiAhead'
  return (
    <Kpi
      label={t(label)}
      value={current == null ? '' : formatCents(Math.abs(current))}
      neg={(current ?? 0) > 0}
      hint={others ? t('properties.rent.othersHint', { amount: `${others > 0 ? '+' : ''}${formatCents(others)}` }) : t('properties.rent.kpiHint')}
    />
  )
}

/** The last twelve months' net, with the yield and whether it is annualized in the hint. */
export function T12mKpi({ d }: { d: PropertyDetail }) {
  const { t } = useI18n()
  if (!d.t12m) return null
  return (
    <Kpi
      label={t('properties.kpi.t12m')}
      value={formatEuro(d.t12m.net_snt)}
      neg={d.t12m.net_snt < 0}
      hint={
        (d.t12m.net_yield_bp != null ? t('properties.kpi.yieldHint', { pct: formatBp(d.t12m.net_yield_bp) }) : '') +
        (d.t12m.annualized ? ` · ${t('properties.kpi.annualized', { n: d.t12m.months })}` : '')
      }
    />
  )
}

/** The internal rate of return: actual once sold, else at the latest valuation or at cost. */
export function IrrKpi({ d }: { d: PropertyDetail }) {
  const { t } = useI18n()
  const irr = d.status === 'sold' ? d.returns.actual_bp : (d.returns.market_bp ?? d.returns.at_cost_bp)
  const hint =
    d.status === 'sold'
      ? t('properties.kpi.irrActual')
      : d.returns.market_bp != null
        ? t('properties.kpi.irrMarket', { price: formatEuro(d.valuation?.price_snt) })
        : t('properties.kpi.irrAtCost')
  return (
    <Kpi
      label={t('properties.kpi.irr')}
      value={formatBp(irr)}
      neg={(irr ?? 0) < 0}
      hint={hint}
      title={d.status === 'sold' ? t('properties.col.irrSoldHint') : t('properties.col.irrHint')}
    />
  )
}

/** What is still to recover (or the gain), and once sold the total result. */
export function ResultKpi({ d }: { d: PropertyDetail }) {
  const { t } = useI18n()
  const s = d.summary
  return d.status === 'sold' ? (
    <Kpi
      label={t('properties.kpi.totalResult')}
      value={formatEuro(-s.unrecovered_snt)}
      neg={s.unrecovered_snt > 0}
      hint={t('properties.kpi.totalResultHint')}
    />
  ) : (
    <Kpi
      label={s.unrecovered_snt < 0 ? t('properties.kpi.gain') : t('properties.kpi.unrecovered')}
      value={formatEuro(Math.abs(s.unrecovered_snt))}
      hint={t('properties.kpi.unrecoveredHint')}
    />
  )
}
