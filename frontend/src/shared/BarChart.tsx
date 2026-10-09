import { formatAxisEur, niceMax } from './chartScale'
import { formatCents } from './money'

export type BarSeries<K extends string> = {
  key: K
  className: string
  label: string
}

/** Grouped bars per point (one per series); negative values hang below the zero line. */
export function BarChart<K extends string>({
  points,
  series,
  labelFor,
  locale,
  className = 'overview-chart',
}: {
  points: ({ key: string } & Record<K, number>)[]
  series: BarSeries<K>[]
  labelFor: (key: string) => string
  locale: string
  className?: string
}) {
  const width = 680
  const height = 240
  const padL = 64
  const padR = 14
  const padT = 18
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const values = points.flatMap((p) => series.map((s) => p[s.key]))
  const rawMax = Math.max(1, ...values.map((v) => Math.abs(v)))
  const maxAbs = niceMax(rawMax)
  const hasNeg = values.some((v) => v < 0)
  const baseline = hasNeg ? padT + plotH / 2 : padT + plotH
  const scale = hasNeg ? plotH / (maxAbs * 2) : plotH / maxAbs
  const groupW = plotW / Math.max(points.length, 1)
  const gap = 2
  const barW = Math.min(16, (groupW * 0.7 - gap * (series.length - 1)) / series.length)
  const clusterW = series.length * barW + (series.length - 1) * gap

  const tickCents = hasNeg
    ? [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]
    : [0, maxAbs / 2, maxAbs]

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img">
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
        return (
          <g key={p.key}>
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
                  <title>
                    {s.label}: {formatCents(value)}
                  </title>
                </rect>
              )
            })}
            <text className="overview-tick" x={cx} y={height - 10} textAnchor="middle">
              {labelFor(p.key)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
