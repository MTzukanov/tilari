import { formatAxisEur, niceStep } from './chartScale'
import { formatCents } from './money'
import { labelEvery, useChartWidth } from './useChartWidth'

export type LineSeries = {
  key: string
  label: string
  /** One value (cents) per point, in the points' order; null leaves a gap. */
  values: (number | null)[]
  /** Stroke and dot colour: `.chart-line` and `.chart-line-dot` inside it. */
  className: string
  /** A colour of its own (a series from a palette), over the class's. */
  color?: string
  dashed?: boolean
  /** A dot per point with its value on hover. */
  dots?: boolean
}

/** The SVG path of a line with gaps: a new segment after each null. */
export function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let out = ''
  let open = false
  values.forEach((v, i) => {
    if (v == null) {
      open = false
      return
    }
    out += `${out ? ' ' : ''}${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    open = true
  })
  return out
}

/**
 * Grid lines on one step for the range `min..max` (cents; min <= 0 <= max): about four steps, so a
 * small part below zero still gets a whole step and its tick does not sit on the zero line.
 */
export function lineTicks(min: number, max: number): { ticks: number[]; top: number; bottom: number } {
  const step = niceStep(Math.max(100_00, max - min) / 4)
  const top = Math.max(1, Math.ceil(max / step)) * step
  const bottom = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = bottom; v <= top; v += step) ticks.push(v)
  return { ticks, top, bottom }
}

/**
 * Hand-drawn lines of money over months on one shared axis: zero always shown, a negative part
 * below it when any line goes there.
 */
export function LineChart({
  keys,
  series,
  labelFor,
  nameFor,
  locale,
  label,
  className = 'overview-chart',
  height = 200,
  columnTitle,
}: {
  keys: string[]
  series: LineSeries[]
  labelFor: (key: string) => string
  nameFor: (key: string) => string
  locale: string
  /** The chart's accessible name. */
  label: string
  className?: string
  height?: number
  /** Hover text of a whole month (a column as wide as the month): every line's value there. */
  columnTitle?: (index: number) => string
}) {
  const { ref, width } = useChartWidth(680)
  const padL = 64
  const padR = 14
  const padT = 14
  const padB = 30
  if (!keys.length) return null
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null)
  const { ticks, top: maxV, bottom: minNice } = lineTicks(Math.min(0, ...all), Math.max(0, ...all))
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const x = (i: number) => padL + (keys.length === 1 ? plotW / 2 : (plotW * i) / (keys.length - 1))
  const y = (v: number) => padT + ((maxV - v) / (maxV - minNice)) * plotH
  const every = labelEvery(keys.length, plotW, 56)
  return (
    <svg ref={ref} className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className={v === 0 ? 'overview-axis' : 'overview-grid'} />
          <text className="overview-y-tick" x={padL - 6} y={y(v) + 3} textAnchor="end">
            {formatAxisEur(v, locale)}
          </text>
        </g>
      ))}
      {keys.map((key, i) =>
        i % every === 0 ? (
          // A label this close to the right edge would be cut in half: it ends at the point instead.
          <text key={key} className="overview-tick" x={x(i)} y={height - 8} textAnchor={x(i) > width - padR - 28 ? 'end' : 'middle'}>
            {labelFor(key)}
          </text>
        ) : null,
      )}
      {series.map((s) => (
        <g key={s.key} className={s.className}>
          <path
            className="chart-line"
            d={linePath(s.values, x, y)}
            style={s.color ? { stroke: s.color } : undefined}
            strokeDasharray={s.dashed ? '6 4' : undefined}
          >
            <title>{s.label}</title>
          </path>
          {s.dots
            ? s.values.map((v, i) =>
                v == null ? null : (
                  <circle
                    key={keys[i]}
                    cx={x(i)}
                    cy={y(v)}
                    r={2.2}
                    className="chart-line-dot"
                    style={s.color ? { fill: s.color } : undefined}
                  >
                    <title>{`${s.label}, ${nameFor(keys[i])}: ${formatCents(v)}`}</title>
                  </circle>
                ),
              )
            : null}
        </g>
      ))}
      {columnTitle
        ? keys.map((key, i) => {
            const half = keys.length === 1 ? plotW / 2 : plotW / (keys.length - 1) / 2
            return (
              <rect
                key={`c-${key}`}
                className="chart-column-hover"
                x={Math.max(padL, x(i) - half)}
                width={Math.min(x(i) + half, width - padR) - Math.max(padL, x(i) - half)}
                y={padT}
                height={plotH}
              >
                <title>{columnTitle(i)}</title>
              </rect>
            )
          })
        : null}
    </svg>
  )
}
