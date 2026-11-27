import { formatAxisEur, niceMax, niceStep } from './chartScale'
import { formatCents } from './money'
import { labelEvery, useChartWidth } from './useChartWidth'

export type BarSeries<K extends string> = {
  key: K
  className: string
  label: string
}

/** A line over the bars, one value per point; `className` styles its path, dots and axis labels. */
export type BarLine = {
  values: number[]
  className: string
  label: string
  /** Dot hover text; default "label: amount". */
  tooltip?: (key: string, value: number) => string
}

/** Grid steps for `values`: the step, and how many above and below zero (the larger side gets two). */
export function axisSteps(values: number[]): { step: number; up: number; down: number } {
  const pos = Math.max(0, ...values)
  const neg = Math.max(0, ...values.map((v) => -v))
  const step = niceMax(Math.max(1, pos, neg)) / 2
  return {
    step,
    up: pos >= neg ? 2 : Math.ceil(pos / step),
    down: neg > pos ? 2 : Math.ceil(neg / step),
  }
}

/**
 * The grid of a chart with `bars` (null: none drawn) and a `line`: steps above and below zero, the
 * left labels' step and the line's. The bars set the grid. A line that fits it shares the bars'
 * scale; a larger one gets the smallest round step that fits, labelled on the right (`rightStep`),
 * so both use their height and the zero lines stay level. A line alone sets the grid itself.
 */
export function chartGrid(bars: number[] | null, line: number[] | null) {
  if (!line || !bars) {
    const a = axisSteps(bars ?? line ?? [])
    return { up: a.up, down: a.down, leftStep: a.step, lineStep: line ? a.step : null, rightStep: null }
  }
  const b = axisSteps(bars)
  const pos = Math.max(0, ...line)
  const neg = Math.max(0, ...line.map((v) => -v))
  const up = Math.max(b.up, pos > 0 ? 1 : 0)
  const down = Math.max(b.down, neg > 0 ? 1 : 0)
  const shared = pos <= up * b.step && neg <= down * b.step
  const lineStep = shared ? b.step : niceStep(Math.max(up ? pos / up : 0, down ? neg / down : 0))
  return { up, down, leftStep: b.step, lineStep, rightStep: shared ? null : lineStep }
}

/**
 * Grouped bars per point (one per series); negative values hang below the zero line. The side with
 * the larger values gets two grid steps, the other side only the steps its values need. A `line`
 * is drawn over the bars on the same grid (`chartGrid`: its own scale on the right if larger). With
 * `onSelect` each point's column is a button (click, Enter or Space) and `selectedKey` is shaded;
 * `pointClass` classes a point's column (e.g. an estimate drawn faded).
 * Drawn at its box's width (`useChartWidth`), so labels thin out instead of shrinking on a phone.
 */
export function BarChart<K extends string>({
  points,
  series,
  line,
  labelFor,
  locale,
  className = 'overview-chart',
  tooltip,
  nameFor,
  selectedKey,
  onSelect,
  labelGap = 44,
  pointClass,
}: {
  points: ({ key: string } & Record<K, number>)[]
  series: BarSeries<K>[]
  line?: BarLine
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
  pointClass?: (key: string) => string | undefined
}) {
  const { ref, width } = useChartWidth(680)
  const { up, down, leftStep, lineStep, rightStep } = chartGrid(
    series.length ? points.flatMap((p) => series.map((s) => p[s.key])) : null,
    line?.values ?? null,
  )
  const height = 240
  const padL = 64
  const padR = rightStep ? 58 : 14
  const padT = 18
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const unit = plotH / (up + down)
  const baseline = padT + up * unit
  const yOf = (value: number, step: number) => baseline - (value / step) * unit
  const groupW = plotW / Math.max(points.length, 1)
  const gap = Math.min(2, groupW * 0.08)
  const barW = Math.max(0.5, Math.min(16, (groupW * 0.7 - gap * (series.length - 1)) / Math.max(1, series.length)))
  const clusterW = series.length * barW + (series.length - 1) * gap
  const every = labelEvery(points.length, plotW, labelGap)
  const centre = (i: number) => padL + groupW * i + groupW / 2
  /** Grid steps from the bottom up; `i - down` keeps the zero step +0 (no "-0 €"). */
  const ticks = Array.from({ length: up + down + 1 }, (_, i) => i - down)

  return (
    <svg ref={ref} className={className} viewBox={`0 0 ${width} ${height}`} role="img">
      {ticks.map((k) => {
        const y = baseline - k * unit
        return (
          <g key={k}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} className={k === 0 ? 'overview-axis' : 'overview-grid'} />
            <text className="overview-y-tick" x={padL - 6} y={y + 3} textAnchor="end">
              {formatAxisEur(k * leftStep, locale)}
            </text>
          </g>
        )
      })}
      {rightStep ? (
        <g className={line!.className}>
          {ticks.map((k) => (
            <text key={k} className="overview-y-tick" x={width - padR + 6} y={baseline - k * unit + 3} textAnchor="start">
              {formatAxisEur(k * rightStep, locale)}
            </text>
          ))}
        </g>
      ) : null}
      {points.map((p, i) => {
        const startX = centre(i) - clusterW / 2
        const name = nameFor?.(p.key) ?? p.key
        return (
          <g
            key={p.key}
            className={[onSelect ? 'chart-col' : '', pointClass?.(p.key) ?? ''].filter(Boolean).join(' ') || undefined}
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
              const h = Math.abs(value / leftStep) * unit
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
              <text className="overview-tick" x={centre(i)} y={height - 10} textAnchor="middle">
                {labelFor(p.key)}
              </text>
            ) : null}
          </g>
        )
      })}
      {line && lineStep ? (
        <g className={line.className}>
          <path
            className="chart-line"
            d={line.values.map((v, i) => `${i ? 'L' : 'M'}${centre(i).toFixed(1)},${yOf(v, lineStep).toFixed(1)}`).join(' ')}
          />
          {points.map((p, i) => (
            <circle
              key={p.key}
              className="chart-line-dot"
              cx={centre(i)}
              cy={yOf(line.values[i], lineStep)}
              r={Math.min(2.4, groupW / 5)}
              onClick={onSelect ? () => onSelect(p.key) : undefined}
            >
              <title>
                {line.tooltip ? line.tooltip(p.key, line.values[i]) : `${line.label}: ${formatCents(line.values[i])}`}
              </title>
            </circle>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
