import { getBcp47 } from '../../../i18n'
import { BarChart, type BarSeries } from '../../../shared/BarChart'
import { LineChart, type LineSeries } from '../../../shared/LineChart'
import { formatCents } from '../../../shared/money'
import type { MonthLine, MonthPoint } from '../api'
import { monthNet, type CashFlowOptions } from './chartOptions'
import { lineText, monthName } from './format'

const TOOLTIP_LINES = 8

export function monthLabel(key: string, locale: string, withYear: boolean): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }).format(
    new Date(y, m - 1, 1),
  )
}

function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`
}

/**
 * Income up, expenses (incl. interest) down, per month, each when its option is on; `costsUp` draws
 * the expenses up beside the income, `net` adds the cash flow as a bar and `totals` (one per month)
 * its running total as a line. With `lines` a bar's hover text lists the month's lines; with
 * `onSelect` a click on a month opens them (MonthLinesPanel).
 */
export function CashFlowChart({
  months,
  labels,
  lines,
  options,
  totals,
  selectedKey,
  onSelect,
}: {
  months: MonthPoint[]
  labels: { income: string; expense: string; net: string; total: string; clickHint?: string; more?: (n: number) => string }
  lines?: MonthLine[]
  options: Pick<CashFlowOptions, 'income' | 'expense' | 'net' | 'costsUp'>
  totals?: number[]
  selectedKey?: string | null
  onSelect?: (key: string) => void
}) {
  const locale = getBcp47()
  const byMonth = new Map<string, MonthLine[]>()
  for (const line of lines ?? []) byMonth.set(line.month, [...(byMonth.get(line.month) ?? []), line])
  const points = months.map((m) => ({
    key: m.key,
    income_snt: m.income_snt,
    expense_snt: (options.costsUp ? 1 : -1) * (m.expense_snt + m.interest_snt),
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
  const series: BarSeries<'income_snt' | 'expense_snt' | 'net_snt'>[] = [
    ...(options.income ? [{ key: 'income_snt' as const, className: 'property-bar-income', label: labels.income }] : []),
    ...(options.expense ? [{ key: 'expense_snt' as const, className: 'property-bar-expense', label: labels.expense }] : []),
    ...(options.net ? [{ key: 'net_snt' as const, className: 'property-bar-net', label: labels.net }] : []),
  ]
  return (
    <BarChart
      className="overview-chart property-chart"
      points={points}
      series={series}
      line={
        totals
          ? {
              values: totals,
              className: 'property-total',
              label: labels.total,
              tooltip: (key, value) => `${labels.total}, ${monthName(key, locale)}: ${formatCents(value)}`,
            }
          : undefined
      }
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

/**
 * Money still to recover at each month end (falls as rent comes in, drops to zero on a sale), the
 * cash flow summed from the first month (`totals`, the upper chart's line) and the housing-company
 * loan share (`shares`, dashed) on the same axis.
 */
/** The payback chart's lines, as their legend swatches draw them (`.property-payback`, `.property-total`). */
const PAYBACK_COLORS = { payback: '#2f6fed', total: 'var(--ink)', share: '#c45c26' } as const

export function PaybackChart({
  months,
  totals,
  shares,
  labels,
}: {
  months: MonthPoint[]
  totals?: number[]
  /** The housing-company loan share at each month's end (ADR-034), null where not known; dashed. */
  shares?: (number | null)[]
  labels: { payback: string; total: string; share?: string }
}) {
  const locale = getBcp47()
  const series: LineSeries[] = [
    { key: 'payback', label: labels.payback, values: months.map((m) => m.unrecovered_snt), className: 'property-payback', dots: 'spaced' },
    ...(totals ? [{ key: 'total', label: labels.total, values: totals, className: 'property-total', dots: 'spaced' as const }] : []),
    ...(shares ? [{ key: 'share', label: labels.share ?? '', values: shares, className: 'property-share-line', color: PAYBACK_COLORS.share, dashed: true }] : []),
  ]
  const colorOf = (key: string) => PAYBACK_COLORS[key as keyof typeof PAYBACK_COLORS]
  return (
    <LineChart
      className="overview-chart property-chart"
      keys={months.map((m) => m.key)}
      series={series}
      pointTip={(i) => ({
        title: monthName(months[i].key, locale),
        rows: series.flatMap((s) => (s.values[i] == null ? [] : [{ label: s.label, value: formatCents(s.values[i]!), color: colorOf(s.key) }])),
      })}
      labelFor={(key) => monthLabel(key, locale, true)}
      nameFor={(key) => monthName(key, locale)}
      locale={locale}
      label={labels.payback}
    />
  )
}
