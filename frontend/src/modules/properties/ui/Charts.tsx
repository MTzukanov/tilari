import { getBcp47 } from '../../../i18n'
import { BarChart } from '../../../shared/BarChart'
import { formatAxisEur, niceMax } from '../../../shared/chartScale'
import { formatCents } from '../../../shared/money'
import type { MonthPoint } from '../api'

function monthLabel(key: string, locale: string, withYear: boolean): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }).format(
    new Date(y, m - 1, 1),
  )
}

/** Income up, expenses (incl. interest) down, per month. */
export function CashFlowChart({ months, labels }: { months: MonthPoint[]; labels: { income: string; expense: string } }) {
  const locale = getBcp47()
  const points = months.map((m) => ({
    key: m.key,
    income_snt: m.income_snt,
    expense_snt: -(m.expense_snt + m.interest_snt),
  }))
  const every = Math.ceil(points.length / 12)
  return (
    <BarChart
      className="overview-chart property-chart"
      points={points}
      series={[
        { key: 'income_snt', className: 'property-bar-income', label: labels.income },
        { key: 'expense_snt', className: 'property-bar-expense', label: labels.expense },
      ]}
      labelFor={(key) => {
        const i = points.findIndex((p) => p.key === key)
        return i % every === 0 ? monthLabel(key, locale, points.length > 12) : ''
      }}
      locale={locale}
    />
  )
}

/** Money still to recover at each month end: falls as rent comes in, drops to zero on a sale. */
export function PaybackChart({ months, label }: { months: MonthPoint[]; label: string }) {
  const locale = getBcp47()
  const width = 680
  const height = 200
  const padL = 64
  const padR = 14
  const padT = 14
  const padB = 30
  if (!months.length) return null
  const values = months.map((m) => m.unrecovered_snt)
  const maxV = niceMax(Math.max(1, ...values))
  const minV = Math.min(0, ...values)
  const minNice = minV < 0 ? -niceMax(-minV) : 0
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const x = (i: number) => padL + (months.length === 1 ? plotW / 2 : (plotW * i) / (months.length - 1))
  const y = (v: number) => padT + ((maxV - v) / (maxV - minNice)) * plotH
  const path = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.unrecovered_snt).toFixed(1)}`).join(' ')
  const ticks = minNice < 0 ? [minNice, 0, maxV / 2, maxV] : [0, maxV / 2, maxV]
  const every = Math.ceil(months.length / 10)
  return (
    <svg className="overview-chart property-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className={v === 0 ? 'overview-axis' : 'overview-grid'} />
          <text className="overview-y-tick" x={padL - 6} y={y(v) + 3} textAnchor="end">
            {formatAxisEur(v, locale)}
          </text>
        </g>
      ))}
      <path d={path} className="property-payback-line" />
      {months.map((m, i) =>
        i % every === 0 ? (
          <text key={m.key} className="overview-tick" x={x(i)} y={height - 8} textAnchor="middle">
            {monthLabel(m.key, locale, true)}
          </text>
        ) : null,
      )}
      {months.map((m, i) => (
        <circle key={`p-${m.key}`} cx={x(i)} cy={y(m.unrecovered_snt)} r={2.2} className="property-payback-dot">
          <title>
            {m.key}: {formatCents(m.unrecovered_snt)}
          </title>
        </circle>
      ))}
    </svg>
  )
}
