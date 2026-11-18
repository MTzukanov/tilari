import { useState, type KeyboardEvent } from 'react'
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
  /**
   * A dot per point with its value on hover; 'spaced' only while the points are `DOT_GAP` px apart
   * at least (a long line of months would turn into a row of blots).
   */
  dots?: boolean | 'spaced'
}

/**
 * What the box by a point says: the month, a label and its value a row (with its line's colour, when
 * lines are told apart by colour), and notes under them.
 */
export type PointTip = { title: string; rows: { label: string; value: string; color?: string }[]; notes?: string[] }

/** The least gap between two points that still draws a dot on each ('spaced'). */
const DOT_GAP = 6

/** A chart narrower than this (px) shows a point's figures under it, not beside the point. */
const NARROW = 480

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
  pointTip,
  onSelect,
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
  /**
   * A box of a point's figures, by the point the pointer is over or the one picked: each month is
   * picked by a click or a tap (again to let go), or by the arrow keys, and keeps a solid guide line.
   */
  pointTip?: (index: number) => PointTip
  /** Told the point picked, or null when let go. */
  onSelect?: (index: number | null) => void
}) {
  const { ref, width } = useChartWidth(680)
  const [hover, setHover] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
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
  const spaced = keys.length < 2 || plotW / (keys.length - 1) >= DOT_GAP
  const half = keys.length === 1 ? plotW / 2 : plotW / (keys.length - 1) / 2
  const column = (i: number) => ({
    x: Math.max(padL, x(i) - half),
    width: Math.min(x(i) + half, width - padR) - Math.max(padL, x(i) - half),
    y: padT,
    height: plotH,
  })
  const pin = (i: number | null) => {
    setPicked(i)
    onSelect?.(i)
  }
  // A pick past the end (the months changed under it) is no pick.
  const shown = pointTip && picked != null && picked < keys.length ? picked : null
  const active = pointTip ? (hover ?? shown) : null
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = keys.length - 1
    const to =
      e.key === 'ArrowRight'
        ? Math.min(last, (shown ?? -1) + 1)
        : e.key === 'ArrowLeft'
          ? Math.max(0, (shown ?? last + 1) - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : e.key === 'Escape'
                ? null
                : undefined
    if (to === undefined) return
    e.preventDefault()
    setHover(null)
    pin(to)
  }
  const svg = (
    <svg
      ref={ref}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role={pointTip ? 'group' : 'img'}
      aria-label={label}
      tabIndex={pointTip ? 0 : undefined}
      onKeyDown={pointTip ? onKeyDown : undefined}
      onMouseLeave={pointTip ? () => setHover(null) : undefined}
    >
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
      {active != null ? (
        <line
          className={`chart-point-guide${active === shown ? ' is-picked' : ''}`}
          x1={x(active)}
          x2={x(active)}
          y1={padT}
          y2={padT + plotH}
        />
      ) : null}
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
          {s.dots && (s.dots === true || spaced)
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
                    {pointTip ? null : <title>{`${s.label}, ${nameFor(keys[i])}: ${formatCents(v)}`}</title>}
                  </circle>
                ),
              )
            : null}
          {active != null && s.values[active] != null ? (
            <circle cx={x(active)} cy={y(s.values[active])} r={4.5} className="chart-line-dot chart-point-mark" style={s.color ? { fill: s.color } : undefined} />
          ) : null}
        </g>
      ))}
      {pointTip
        ? keys.map((key, i) => (
            <rect
              key={`p-${key}`}
              className="chart-point-hit"
              {...column(i)}
              onMouseEnter={() => setHover(i)}
              onClick={() => pin(i === shown ? null : i)}
            />
          ))
        : null}
    </svg>
  )
  if (!pointTip) return svg
  // Over a wide chart the box keeps clear of the point: beside it on the side with more room, and in
  // the half of the plot the point is not in. A narrow one (a phone) has no room beside a point: the
  // month tapped has its figures under the chart, and a pointer passing by moves only the guide.
  const narrow = width < NARROW
  const shownTip = narrow ? shown : active
  const at = shownTip != null ? series.map((s) => s.values[shownTip]).find((v): v is number => v != null) : undefined
  const tip = shownTip != null ? pointTip(shownTip) : null
  const fx = shownTip != null ? x(shownTip) / width : 0
  const low = at != null && y(at) > padT + plotH / 2
  return (
    <div className="line-chart">
      {svg}
      <div
        className={`chart-tip${narrow ? ' is-below' : ''}`}
        role="status"
        hidden={!tip}
        style={
          tip && !narrow
            ? {
                [fx <= 0.5 ? 'left' : 'right']: `calc(${((fx <= 0.5 ? fx : 1 - fx) * 100).toFixed(2)}% + 10px)`,
                [low ? 'top' : 'bottom']: `${(((low ? padT : padB) / height) * 100).toFixed(2)}%`,
              }
            : undefined
        }
      >
        {tip ? (
          <>
            <div className="chart-tip-title">{tip.title}</div>
            {tip.rows.map((r, i) => (
              <div key={i} className="chart-tip-row">
                <span>
                  {r.color ? <i className="chart-tip-swatch" style={{ background: r.color }} /> : null}
                  {r.label}
                </span>
                <span>{r.value}</span>
              </div>
            ))}
            {tip.notes?.map((n) => (
              <div key={n} className="chart-tip-note">
                {n}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  )
}
