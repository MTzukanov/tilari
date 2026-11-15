import { getBcp47 } from '../../../i18n'
import { BarChart } from '../../../shared/BarChart'
import { formatAxisEur, niceMax } from '../../../shared/chartScale'
import { formatCents } from '../../../shared/money'
import { labelEvery, useChartWidth } from '../../../shared/useChartWidth'
import type { MonthLine, MonthPoint } from '../api'
import { lineText, monthName } from './format'

const TOOLTIP_LINES = 8

function monthLabel(key: string, locale: string, withYear: boolean): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }).format(
    new Date(y, m - 1, 1),
  )
}

function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`
}

/** Income less expenses and interest: the month's cash flow (the third bar, the month lines' sum). */
export function monthNet(m: MonthPoint): number {
  return m.income_snt - m.expense_snt - m.interest_snt
}

/**
 * Income up, expenses (incl. interest) down, per month; `costsUp` draws the expenses up beside the
 * income, `net` adds the cash flow as a third bar. With `lines` a bar's hover text lists the
 * month's lines; with `onSelect` a click on a month opens them (MonthLinesPanel).
 */
export function CashFlowChart({
  months,
  labels,
  lines,
  costsUp = false,
  net = false,
  selectedKey,
  onSelect,
}: {
  months: MonthPoint[]
  labels: { income: string; expense: string; net: string; clickHint?: string; more?: (n: number) => string }
  lines?: MonthLine[]
  costsUp?: boolean
  net?: boolean
  selectedKey?: string | null
  onSelect?: (key: string) => void
}) {
  const locale = getBcp47()
  const byMonth = new Map<string, MonthLine[]>()
  for (const line of lines ?? []) byMonth.set(line.month, [...(byMonth.get(line.month) ?? []), line])
  const points = months.map((m) => ({
    key: m.key,
    income_snt: m.income_snt,
    expense_snt: (costsUp ? 1 : -1) * (m.expense_snt + m.interest_snt),
    net_snt: monthNet(m),
  }))
  const tooltip = (key: string, series: { key: string; label: string }) => {
    const m = months.find((p) => p.key === key)!
    const signed =
      series.key === 'income_snt' ? m.income_snt : series.key === 'net_snt' ? monthNet(m) : -(m.expense_snt + m.interest_snt)
    const out = [`${series.label}, ${monthName(key, locale)}: ${formatCents(signed)}`]
    if (series.key !== 'net_snt') {
      const incomeBar = series.key === 'income_snt'
      const rows = (byMonth.get(key) ?? []).filter((l) => (l.kind === 'income') === incomeBar)
      for (const l of rows.slice(0, TOOLTIP_LINES)) {
        out.push(`${shortDate(l.counted_date)}  ${lineText(l)}  ${formatCents(l.amount_snt)}`)
      }
      if (rows.length > TOOLTIP_LINES && labels.more) out.push(labels.more(rows.length - TOOLTIP_LINES))
    }
    if (onSelect && labels.clickHint) out.push(labels.clickHint)
    return out.join('\n')
  }
  return (
    <BarChart
      className="overview-chart property-chart"
      points={points}
      series={[
        { key: 'income_snt', className: 'property-bar-income', label: labels.income },
        { key: 'expense_snt', className: 'property-bar-expense', label: labels.expense },
        ...(net ? [{ key: 'net_snt' as const, className: 'property-bar-net', label: labels.net }] : []),
      ]}
      labelFor={(key) => monthLabel(key, locale, points.length > 12)}
      labelGap={points.length > 12 ? 48 : 36}
      locale={locale}
      tooltip={lines ? tooltip : undefined}
      nameFor={(key) => monthName(key, locale)}
      selectedKey={selectedKey}
      onSelect={onSelect}
    />
  )
}

/** Money still to recover at each month end: falls as rent comes in, drops to zero on a sale. */
export function PaybackChart({ months, label }: { months: MonthPoint[]; label: string }) {
  const locale = getBcp47()
  const { ref, width } = useChartWidth(680)
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
  const every = labelEvery(months.length, plotW, 56)
  return (
    <svg ref={ref} className="overview-chart property-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
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
