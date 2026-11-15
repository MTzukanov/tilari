import { formatAxisEur, niceMax } from './chartScale'
import { formatCents } from './money'
import { labelEvery, useChartWidth } from './useChartWidth'

export type BarSeries<K extends string> = {
  key: K
  className: string
  label: string
}

/**
 * Grouped bars per point (one per series); negative values hang below the zero line. The side with
 * the larger values gets two grid steps, the other side only the steps its values need. With
 * `onSelect` each point's column is a button (click, Enter or Space) and `selectedKey` is shaded.
 * Drawn at its box's width (`useChartWidth`), so labels thin out instead of shrinking on a phone.
 */
export function BarChart<K extends string>({
  points,
  series,
  labelFor,
  locale,
  className = 'overview-chart',
  tooltip,
  nameFor,
  selectedKey,
  onSelect,
  labelGap = 44,
}: {
  points: ({ key: string } & Record<K, number>)[]
  series: BarSeries<K>[]
  labelFor: (key: string) => string
  locale: string
  className?: string
  /** Bar hover text; default "label: amount". */
  tooltip?: (key: string, series: BarSeries<K>, value: number) => string
  /** Full name of a point (column button label and its hover text). */
  nameFor?: (key: string) => string
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /** Least room per point label (px); labels between are left out. */
  labelGap?: number
}) {
  const { ref, width } = useChartWidth(680)
  const height = 240
  const padL = 64
  const padR = 14
  const padT = 18
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const values = points.flatMap((p) => series.map((s) => p[s.key]))
  const posMax = Math.max(0, ...values)
  const negMax = Math.max(0, ...values.map((v) => -v))
  const maxAbs = niceMax(Math.max(1, posMax, negMax))
  const step = maxAbs / 2
  const top = posMax >= negMax ? maxAbs : Math.ceil(posMax / step) * step
  const bottom = negMax > posMax ? maxAbs : Math.ceil(negMax / step) * step
  const scale = plotH / (top + bottom)
  const baseline = padT + top * scale
  const groupW = plotW / Math.max(points.length, 1)
  const gap = Math.min(2, groupW * 0.08)
  const barW = Math.max(0.5, Math.min(16, (groupW * 0.7 - gap * (series.length - 1)) / series.length))
  const clusterW = series.length * barW + (series.length - 1) * gap
  const every = labelEvery(points.length, plotW, labelGap)

  const tickCents: number[] = []
  for (let v = bottom ? -bottom : 0; v <= top; v += step) tickCents.push(v)

  return (
    <svg ref={ref} className={className} viewBox={`0 0 ${width} ${height}`} role="img">
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
        const name = nameFor?.(p.key) ?? p.key
        return (
          <g
            key={p.key}
            className={onSelect ? 'chart-col' : undefined}
            onClick={onSelect ? () => onSelect(p.key) : undefined}
          >
            {onSelect ? (
              <rect
                className={`chart-col-hit${p.key === selectedKey ? ' is-selected' : ''}`}
                x={padL + groupW * i}
                y={padT}
                width={groupW}
                height={plotH}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-pressed={p.key === selectedKey}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(p.key)
                  }
                }}
              >
                <title>{name}</title>
              </rect>
            ) : null}
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
                  <title>{tooltip ? tooltip(p.key, s, value) : `${s.label}: ${formatCents(value)}`}</title>
                </rect>
              )
            })}
            {i % every === 0 ? (
              <text className="overview-tick" x={cx} y={height - 10} textAnchor="middle">
                {labelFor(p.key)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
