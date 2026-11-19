import { useState, type RefObject } from 'react'
import { grossPriceFor } from '../../../book/modules/properties/domain/returns'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import { formatBp, formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { showCutText } from '../../../shared/cutText'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import type { Disposal, PropertyDetail, PropertyDoc, YearRow } from '../api'
import { CashFlowChart, PaybackChart } from './Charts'
import { CapitalSection, ErasSection, FinancingSection, SaleSection, ValuationsSection } from './FinanceEdits'
import { runningTotals, type CashFlowOptions } from './chartOptions'
import { VoucherOpen } from './FormParts'
import { formatEuro } from './format'
import { HousingShareKpi, IrrKpi, Kpi, ResultKpi, T12mKpi } from './Kpi'
import { MonthLinesPanel } from './MonthLines'

function BreakEvenPanel({ d, onTarget }: { d: PropertyDetail; onTarget: (bp: number | null) => void }) {
  const { t } = useI18n()
  const [target, setTarget] = useState(formatPercentInput(d.target?.rate_bp ?? null))
  const be = d.break_even
  if (!be) return null
  const costs = be.sale_costs
  // A debt-free price takes the housing-company loan share with it, and the sale costs' percentage is of it (ADR-034).
  const share = d.summary.housing_share_snt
  const noBookLoss = grossPriceFor(d.summary.book_value_snt, costs, share ?? 0)
  return (
    <section className="overview-panel property-breakeven">
      <h3>{t('properties.breakEven.title')}</h3>
      <div className="property-breakeven-figures">
        <div className="property-breakeven-main">
          <strong className="property-big">{formatEuro(be.price_snt)}</strong>
          <span className="muted">{t('properties.breakEven.caption')}</span>
        </div>
        {share != null ? (
          <div className="property-breakeven-main">
            <strong className="property-big">{formatEuro(be.price_snt + share)}</strong>
            <span className="muted">{t('properties.breakEven.debtFreeCaption', { share: formatEuro(share), date: formatDate(d.as_of) })}</span>
          </div>
        ) : null}
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
      <p className="muted">{t('properties.breakEven.bookLoss', { price: formatEuro(noBookLoss) })}</p>
      <p className="muted">{t('properties.breakEven.taxNote')}</p>
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
            {share != null ? ` · ${t('properties.breakEven.targetDebtFree', { price: formatEuro(d.target.price_snt + share) })}` : ''}
          </span>
        ) : null}
      </div>
    </section>
  )
}

type VoucherLabel = { voucher_id: number; date: string; doc_number: number | null; series: string | null; title: string }

/** A sale's voucher: the pill that opens it, then its title. */
function VoucherButton({ v, onOpen }: { v: VoucherLabel; onOpen: (voucherId: number) => void }) {
  return (
    <>
      <VoucherOpen voucher={v} onOpen={onOpen} /> {v.title}
    </>
  )
}

/** Each sale as price, costs and cash received, every amount next to the voucher it comes from. */
function Sales({ disposals, onOpenVoucher }: { disposals: Disposal[]; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  return (
    <table className="property-sales" onMouseOver={showCutText}>
      {disposals.map((x) => {
        const costs = x.price_snt - x.proceeds_snt
        // Costs on the sale voucher itself: what the other vouchers do not explain.
        const onSale = costs - x.cost_vouchers.reduce((s, v) => s + v.amount_snt, 0)
        const sources = [...(onSale !== 0 ? [{ ...x, amount_snt: onSale }] : []), ...x.cost_vouchers]
        return (
          <tbody key={x.voucher_id}>
            <tr>
              <th scope="row">{t('properties.sales.price')}</th>
              <td className="num">{formatCents(x.price_snt)}</td>
              <td className="property-sales-voucher">
                <VoucherButton v={x} onOpen={onOpenVoucher} />
              </td>
            </tr>
            <tr>
              <th scope="row">{t('properties.sales.costs')}</th>
              <td className="num">{formatCents(costs)}</td>
              <td className="property-sales-voucher">
                {sources.length === 1 ? <VoucherButton v={sources[0]} onOpen={onOpenVoucher} /> : null}
              </td>
            </tr>
            {sources.length > 1
              ? sources.map((v) => (
                  <tr key={v.voucher_id} className="property-sales-part">
                    <th scope="row" />
                    <td className="num">{formatCents(v.amount_snt)}</td>
                    <td className="property-sales-voucher">
                      <VoucherButton v={v} onOpen={onOpenVoucher} />
                    </td>
                  </tr>
                ))
              : null}
            <tr className="property-sales-total">
              <th scope="row">{t('properties.sales.proceeds')}</th>
              <td className="num">{formatCents(x.proceeds_snt)}</td>
              <td />
            </tr>
          </tbody>
        )
      })}
    </table>
  )
}

function yearColumns(
  t: (key: string, vars?: Record<string, string | number>) => string,
  withInterest: boolean,
  withHousing: boolean,
): TableColumn<YearRow>[] {
  const money = (id: keyof YearRow & string, label: string, title?: string, signed = false, width = 120): TableColumn<YearRow> => ({
    id,
    label,
    title,
    width,
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
    ...(withHousing
      ? [
          money('housing_interest_snt', t('properties.years.housingInterest'), t('properties.years.housingInterestHint'), false, 165),
          money('housing_principal_snt', t('properties.years.housingPrincipal'), t('properties.years.housingPrincipalHint'), true, 190),
        ]
      : []),
    money('capex_snt', t('properties.years.capex'), t('properties.years.capexHint'), true),
    money('proceeds_snt', t('properties.years.proceeds'), t('properties.years.proceedsHint')),
    money('kitsas_result_snt', t('properties.years.result'), t('properties.years.resultHint'), true),
  ]
}

/**
 * The cash flow by month, a month's lines under it on a click, and the payback (on the overview).
 */
export function CashFlowPanel({
  d,
  options,
  onOptions,
  selected,
  onSelectMonth,
  panelRef,
  onOpenAllocation,
  onOpenVoucher,
}: {
  d: PropertyDetail
  options: CashFlowOptions
  onOptions: (options: CashFlowOptions) => void
  /** The month whose lines are open. */
  selected: string | null
  onSelectMonth: (month: string | null) => void
  panelRef: RefObject<HTMLDivElement | null>
  onOpenAllocation: (month?: string) => void
  onOpenVoucher: (voucherId: number, entryId?: number | null) => void
}) {
  const { t } = useI18n()
  const months = options.allMonths ? d.months : d.months.slice(-24)
  if (!d.months.length) return null
  const check = (key: keyof CashFlowOptions, label: string, swatch?: string, disabled = false) => (
    <label className="allocation-check">
      <input
        type="checkbox"
        checked={options[key]}
        disabled={disabled}
        onChange={() => onOptions({ ...options, [key]: !options[key] })}
      />
      {swatch ? <i className={`overview-swatch ${swatch}`} /> : null}
      {label}
    </label>
  )
  return (
    <section className="overview-panel">
      <h3>{t('properties.chart.cashFlow')}</h3>
      <div className="overview-legend">
        {check('income', t('properties.chart.income'), 'property-swatch-income')}
        {check('expense', t('properties.chart.expense'), 'property-swatch-expense')}
        {check('net', t('properties.chart.net'), 'property-swatch-net')}
        {check('total', t('properties.chart.total'), 'property-swatch-total')}
        {check('costsUp', t('properties.chart.costsUp'), undefined, !options.expense)}
        {d.months.length > 24 ? check('allMonths', t('properties.chart.allMonths')) : null}
      </div>
      <CashFlowChart
        months={months}
        lines={d.month_lines}
        options={options}
        totals={options.total ? runningTotals(d.months).slice(-months.length) : undefined}
        selectedKey={selected}
        onSelect={(key) => onSelectMonth(key === selected ? null : key)}
        labels={{
          income: t('properties.chart.income'),
          expense: t('properties.chart.expense'),
          net: t('properties.chart.net'),
          total: t('properties.chart.total'),
          clickHint: t('properties.chart.clickHint'),
          more: (n) => t('properties.chart.more', { n }),
        }}
      />
      {selected ? (
        <div ref={panelRef}>
          <MonthLinesPanel
            month={selected}
            lines={d.month_lines.filter((l) => l.month === selected)}
            locale={getBcp47()}
            labels={{
              income: t('properties.chart.income'),
              expense: t('properties.chart.expense'),
              net: t('properties.chart.net'),
            }}
            onClose={() => onSelectMonth(null)}
            onOpenVoucher={onOpenVoucher}
            onOpenAllocation={() => onOpenAllocation(selected)}
          />
        </div>
      ) : null}
      {d.summary.acquired_on ? (
        <>
          <h3>{t('properties.chart.payback')}</h3>
          <div className="overview-legend">
            <span className="allocation-check">
              <i className="overview-swatch property-swatch-payback" />
              {t('properties.chart.paybackLine')}
            </span>
            <span className="allocation-check">
              <i className="overview-swatch property-swatch-total" />
              {t('properties.chart.total')}
            </span>
          </div>
          <PaybackChart
            months={d.months}
            totals={runningTotals(d.months)}
            labels={{ payback: t('properties.chart.paybackLine'), total: t('properties.chart.total') }}
          />
        </>
      ) : null}
    </section>
  )
}

/**
 * The object's figures (the Talous tab): every key figure, the fiscal years, the break-even price,
 * the acquisition cost and the sales.
 */
export function PropertyFinance({
  d,
  onTarget,
  onSave,
  addValuation = 0,
  onOpenVoucher,
}: {
  d: PropertyDetail
  onTarget: (bp: number | null) => void
  /** Saves the object as a section changed it; none when it cannot be changed (read-only). */
  onSave?: (doc: PropertyDoc) => Promise<void>
  /** Changes when the overview's "+ Hinta-arvio" asks for a new price estimate. */
  addValuation?: number
  onOpenVoucher: (voucherId: number, entryId?: number | null) => void
}) {
  const { t } = useI18n()
  const s = d.summary
  const [addHere, setAddHere] = useState(0)
  return (
    <>
      {onSave ? (
        <div className="property-quick">
          <button type="button" className="btn-secondary" onClick={() => setAddHere((n) => n + 1)}>
            {t('properties.overview.addValuation')}
          </button>
        </div>
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
        {s.interest_snt != null ? <Kpi label={t('properties.kpi.interest')} value={formatEuro(s.interest_snt)} /> : null}
        <ResultKpi d={d} />
        <HousingShareKpi d={d} />
        <T12mKpi d={d} />
        <IrrKpi d={d} />
      </div>

      {d.years.length ? (
        <section className="property-section">
          <h3>{t('properties.years.title')}</h3>
          <SortableTable
            storageKey="tilari.properties.years.cols"
            columns={yearColumns(t, d.summary.interest_snt != null, Boolean(d.doc.housing_loans?.length))}
            rows={d.years}
            rowKey={(y) => y.starts}
            className="compact"
          />
        </section>
      ) : null}

      <BreakEvenPanel key={d.target?.rate_bp ?? 'none'} d={d} onTarget={onTarget} />

      <SaleSection d={d} onSave={onSave} />
      <ValuationsSection d={d} onSave={onSave} addRequest={addValuation + addHere} />
      <ErasSection
        d={d}
        onSave={onSave}
        view={
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
                        <td className="property-col-text">{m.description}</td>
                        <td className={`amount ${m.amount_snt < 0 ? 'neg' : ''}`}>{formatCents(m.amount_snt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        }
      />
      <CapitalSection d={d} onSave={onSave} />
      <FinancingSection d={d} onSave={onSave} />

      {d.disposals.length ? (
        <section className="property-section">
          <h3>{t('properties.sales.title')}</h3>
          <Sales disposals={d.disposals} onOpenVoucher={onOpenVoucher} />
        </section>
      ) : null}
    </>
  )
}
