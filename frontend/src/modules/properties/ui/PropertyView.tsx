import { useState } from 'react'
import { grossPriceFor } from '../../../book/modules/properties/domain/returns'
import { useI18n } from '../../../i18n'
import { AttachmentLink } from '../../../shared/AttachmentLink'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import { formatBp, formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { voucherTypeName } from '../../../shared/voucherTypes'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { fetchProperty, fetchPropertyDocuments, type PropertyDetail, type PropertyDocuments, type YearRow } from '../api'
import { CashFlowChart, PaybackChart } from './Charts'
import { formatEuro, statusClass, warningText } from './format'

function Kpi({ label, value, neg, hint }: { label: string; value: string; neg?: boolean; hint?: string }) {
  return (
    <div className="overview-kpi">
      <span className="overview-kpi-label">{label}</span>
      <strong className={neg ? 'neg' : ''}>{value || '–'}</strong>
      {hint ? <span className="muted property-kpi-hint">{hint}</span> : null}
    </div>
  )
}

function BreakEvenPanel({ d, onTarget }: { d: PropertyDetail; onTarget: (bp: number | null) => void }) {
  const { t } = useI18n()
  const [target, setTarget] = useState(formatPercentInput(d.target?.rate_bp ?? null))
  const be = d.break_even
  if (!be) return null
  const costs = be.sale_costs
  const noBookLoss = grossPriceFor(d.summary.book_value_snt, costs)
  return (
    <section className="overview-panel property-breakeven">
      <h3>{t('properties.breakEven.title')}</h3>
      <div className="property-breakeven-main">
        <strong className="property-big">{formatEuro(be.price_snt)}</strong>
        <span className="muted">{t('properties.breakEven.caption')}</span>
      </div>
      <p>
        {be.already_recovered
          ? t('properties.breakEven.recovered')
          : t('properties.breakEven.explain', {
              unrecovered: formatEuro(be.unrecovered_snt),
              pct: formatBp(costs.pct_bp),
              fixed: formatEuro(costs.fixed_snt),
            })}
      </p>
      {!be.costs_set ? <p className="property-note">{t('properties.breakEven.costsUnset')}</p> : null}
      <p className="muted">{t('properties.breakEven.bookLoss', { price: formatEuro(noBookLoss) })}</p>
      <p className="muted">{t('properties.breakEven.taxNote')}</p>
      <p className="muted">{t('properties.breakEven.debtFree')}</p>
      <div className="property-target">
        <label>
          {t('properties.field.targetReturn')}
          <input
            type="text"
            inputMode="decimal"
            value={target}
            placeholder="4,0"
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const bp = parsePercentInput(target)
                if (!Number.isNaN(bp)) onTarget(bp)
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const bp = parsePercentInput(target)
            if (!Number.isNaN(bp)) onTarget(bp)
          }}
        >
          {t('properties.breakEven.calculate')}
        </button>
        {d.target ? (
          <span>
            {t('properties.breakEven.targetPrice', { pct: formatBp(d.target.rate_bp), price: formatEuro(d.target.price_snt) })}
          </span>
        ) : null}
      </div>
    </section>
  )
}

const DOCS_PER_GROUP = 8

function Documents({ id, onOpenVoucher }: { id: number; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  const [bank, setBank] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data, error } = usePeriodQuery<PropertyDocuments>(() => fetchPropertyDocuments(id, bank), [id, bank])
  if (error) return <p className="error">{error}</p>
  if (!data) return null
  return (
    <section className="overview-panel property-docs">
      <h3>{t('properties.docs.title')}</h3>
      {data.groups.length === 0 ? <p className="muted">{t('properties.docs.empty')}</p> : null}
      {data.groups.map((group) => (
        <div key={group.kind} className="property-doc-group">
          <h4>{t(`properties.docs.group.${group.kind}`)}</h4>
          <ul className="property-doc-list">
            {(expanded.has(group.kind) ? group.vouchers : group.vouchers.slice(0, DOCS_PER_GROUP)).map((v) => (
              <li key={v.voucher_id}>
                {v.missing ? (
                  <span className="muted">{t('properties.docs.missing', { id: v.voucher_id })}</span>
                ) : (
                  <>
                    <button type="button" className="btn-link" onClick={() => onOpenVoucher(v.voucher_id)}>
                      {formatDate(v.date)} · {formatVoucherId(v.series, v.doc_number, v.date)} · {v.title || voucherTypeName(v.type)}
                    </button>
                    {v.attachments.map((a) => (
                      <AttachmentLink key={a.id} id={a.id} lazy className="property-attachment">
                        {a.name}
                      </AttachmentLink>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
          {group.vouchers.length > DOCS_PER_GROUP && !expanded.has(group.kind) ? (
            <button type="button" className="btn-link" onClick={() => setExpanded(new Set(expanded).add(group.kind))}>
              {t('properties.docs.showAll', { n: group.vouchers.length })}
            </button>
          ) : null}
        </div>
      ))}
      {data.bank_hidden > 0 || bank ? (
        <label className="allocation-check">
          <input type="checkbox" checked={bank} onChange={() => setBank(!bank)} />
          {t('properties.docs.showBank', { n: data.bank_hidden })}
        </label>
      ) : null}
    </section>
  )
}

function yearColumns(t: (key: string, vars?: Record<string, string | number>) => string, withInterest: boolean): TableColumn<YearRow>[] {
  const money = (id: keyof YearRow & string, label: string, title?: string, signed = false): TableColumn<YearRow> => ({
    id,
    label,
    title,
    width: 120,
    align: 'right',
    sortValue: (y) => Number(y[id]),
    cellClass: (y) => (signed && Number(y[id]) < 0 ? 'neg' : ''),
    render: (y) => formatCents(Number(y[id]), { emptyZero: id !== 'net_snt' && id !== 'kitsas_result_snt' }),
  })
  return [
    {
      id: 'period',
      label: t('properties.years.period'),
      width: 190,
      sortValue: (y) => y.starts,
      render: (y) => `${formatDate(y.starts)}–${formatDate(y.ends)}`,
    },
    money('income_snt', t('properties.years.income')),
    money('expense_snt', t('properties.years.expense')),
    money('net_snt', t('properties.years.net'), t('properties.years.netHint'), true),
    ...(withInterest ? [money('interest_snt', t('properties.years.interest'))] : []),
    money('capex_snt', t('properties.years.capex'), t('properties.years.capexHint'), true),
    money('proceeds_snt', t('properties.years.proceeds'), t('properties.years.proceedsHint')),
    money('kitsas_result_snt', t('properties.years.result'), t('properties.years.resultHint'), true),
  ]
}

export function PropertyView({
  id,
  onBack,
  onEdit,
  onOpenAllocation,
  onOpenVoucher,
}: {
  id: number
  onBack: () => void
  onEdit: () => void
  onOpenAllocation: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [targetBp, setTargetBp] = useState<number | null>(null)
  const [allMonths, setAllMonths] = useState(false)
  const { data: d, error, loading } = usePeriodQuery(
    () => fetchProperty(id, targetBp != null ? { targetBp } : {}),
    [id, targetBp],
  )

  const s = d?.summary
  const irr = d ? (d.status === 'sold' ? d.returns.actual_bp : (d.returns.market_bp ?? d.returns.at_cost_bp)) : null
  const irrHint = d
    ? d.status === 'sold'
      ? t('properties.kpi.irrActual')
      : d.returns.market_bp != null
        ? t('properties.kpi.irrMarket', { price: formatEuro(d.valuation?.price_snt) })
        : t('properties.kpi.irrAtCost')
    : undefined
  const months = d ? (allMonths ? d.months : d.months.slice(-24)) : []

  return (
    <div className="ledger property-detail">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.properties')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {loading && !d ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {d && s ? (
        <>
          <div className="ledger-head-intro">
            <h2 className="ledger-page-title">{d.name}</h2>
            <p className="lede voucher-meta">
              <span className={statusClass(d.status)}>{t(`properties.status.${d.status}`)}</span>
              {d.kind ? ` · ${t(`properties.kind.${d.kind}`)}` : ''}
              {s.acquired_on ? ` · ${t('properties.acquired', { date: formatDate(s.acquired_on) })}` : ''}
              {s.sold_on ? ` · ${t('properties.soldOn', { date: formatDate(s.sold_on) })}` : ''}
            </p>
            <p className="muted property-asof">
              {t('properties.asOf', { date: formatDate(d.as_of) })}
              {' · '}
              <button type="button" className="btn-link" onClick={onEdit}>
                {t('properties.editLink')}
              </button>
              {' · '}
              <button type="button" className="btn-link" onClick={onOpenAllocation}>
                {t('properties.openAllocation')}
              </button>
            </p>
          </div>

          {d.warnings.length ? (
            <ul className="property-warnings">
              {d.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{warningText(t, w)}</li>
              ))}
            </ul>
          ) : null}

          <div className="overview-kpis">
            <Kpi label={t('properties.kpi.invested')} value={formatEuro(s.invested_snt)} hint={t('properties.kpi.investedHint')} />
            {d.status !== 'sold' ? (
              <Kpi label={t('properties.kpi.bookValue')} value={formatEuro(s.book_value_snt)} />
            ) : (
              <Kpi label={t('properties.kpi.proceeds')} value={formatEuro(s.proceeds_snt)} />
            )}
            <Kpi
              label={t('properties.kpi.operating')}
              value={formatEuro(s.operating.net_snt)}
              neg={s.operating.net_snt < 0}
              hint={t('properties.kpi.operatingHint', {
                income: formatEuro(s.operating.income_snt),
                expense: formatEuro(s.operating.expense_snt),
              })}
            />
            {s.interest_snt != null ? (
              <Kpi label={t('properties.kpi.interest')} value={formatEuro(s.interest_snt)} />
            ) : null}
            {d.status === 'sold' ? (
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
            )}
            {d.t12m ? (
              <Kpi
                label={t('properties.kpi.t12m')}
                value={formatEuro(d.t12m.net_snt)}
                neg={d.t12m.net_snt < 0}
                hint={
                  (d.t12m.net_yield_bp != null ? t('properties.kpi.yieldHint', { pct: formatBp(d.t12m.net_yield_bp) }) : '') +
                  (d.t12m.annualized ? ` · ${t('properties.kpi.annualized', { n: d.t12m.months })}` : '')
                }
              />
            ) : null}
            <Kpi label={t('properties.kpi.irr')} value={formatBp(irr)} neg={(irr ?? 0) < 0} hint={irrHint} />
          </div>

          <BreakEvenPanel key={d.target?.rate_bp ?? 'none'} d={d} onTarget={setTargetBp} />

          {d.months.length ? (
            <section className="overview-panel">
              <h3>{t('properties.chart.cashFlow')}</h3>
              <div className="overview-legend">
                <span>
                  <i className="overview-swatch property-swatch-income" />
                  {t('properties.chart.income')}
                </span>
                <span>
                  <i className="overview-swatch property-swatch-expense" />
                  {t('properties.chart.expense')}
                </span>
                {d.months.length > 24 ? (
                  <label className="allocation-check">
                    <input type="checkbox" checked={allMonths} onChange={() => setAllMonths(!allMonths)} />
                    {t('properties.chart.allMonths')}
                  </label>
                ) : null}
              </div>
              <CashFlowChart months={months} labels={{ income: t('properties.chart.income'), expense: t('properties.chart.expense') }} />
              {s.acquired_on ? (
                <>
                  <h3>{t('properties.chart.payback')}</h3>
                  <PaybackChart months={d.months} label={t('properties.chart.payback')} />
                </>
              ) : null}
            </section>
          ) : null}

          {d.years.length ? (
            <section className="property-section">
              <h3>{t('properties.years.title')}</h3>
              <SortableTable
                storageKey="tilari.properties.years.cols"
                columns={yearColumns(t, d.summary.interest_snt != null)}
                rows={d.years}
                rowKey={(y) => y.starts}
                className="compact"
              />
            </section>
          ) : null}

          <section className="property-section">
            <h3>{t('properties.eras.title')}</h3>
            {d.eras.length === 0 ? (
              <p className="muted">
                {t('properties.eras.none')}{' '}
                <button type="button" className="btn-link" onClick={onEdit}>
                  {t('properties.eras.link')}
                </button>
              </p>
            ) : (
              <>
                <p className="muted">{t('properties.eras.lead')}</p>
                {d.eras.map((e) => (
                  <div key={e.eraid} className="property-era">
                    <h4>
                      {e.missing ? t('properties.eras.missing', { id: e.eraid }) : e.description}
                      <span className="muted">
                        {' '}
                        · {e.account} · {t('properties.eras.balance', { amount: formatCents(e.balance_snt) })}
                      </span>
                    </h4>
                    <table className="ledger-table compact">
                      <tbody>
                        {e.movements.map((m, i) => (
                          <tr key={`${m.voucher_id}-${i}`} className="clickable" onClick={() => onOpenVoucher(m.voucher_id)}>
                            <td className="num property-col-date">{formatDate(m.date)}</td>
                            <td className="property-col-kind">
                              <span className={`property-move property-move-${m.kind}`}>{t(`properties.eras.kind.${m.kind}`)}</span>
                            </td>
                            <td>{m.description}</td>
                            <td className={`amount ${m.amount_snt < 0 ? 'neg' : ''}`}>{formatCents(m.amount_snt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
          </section>

          {d.disposals.length ? (
            <section className="property-section">
              <h3>{t('properties.sales.title')}</h3>
              <ul className="property-doc-list">
                {d.disposals.map((x) => (
                  <li key={x.voucher_id}>
                    <button type="button" className="btn-link" onClick={() => onOpenVoucher(x.voucher_id)}>
                      {formatDate(x.date)}
                    </button>{' '}
                    {t('properties.sales.line', {
                      price: formatCents(x.price_snt),
                      costs: formatCents(x.price_snt - x.proceeds_snt),
                      proceeds: formatCents(x.proceeds_snt),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Documents id={id} onOpenVoucher={onOpenVoucher} />

          {d.doc.note ? (
            <section className="property-section">
              <h3>{t('properties.field.note')}</h3>
              <p className="property-note-text">{d.doc.note}</p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
