import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineChart, linePath, lineTicks } from './LineChart'

describe('LineChart', () => {
  const keys = ['2025-01', '2025-02', '2025-03']
  const render = () =>
    renderToStaticMarkup(
      <LineChart
        keys={keys}
        series={[
          { key: 'a', label: 'A', values: [50_000_00, 49_000_00, 48_000_00], className: 'line-a', dots: true },
          { key: 'b', label: 'B', values: [0, -200_00, -1_000_00], className: 'line-b', dots: true },
        ]}
        labelFor={(k) => k}
        nameFor={(k) => k}
        locale="fi-FI"
        label="chart"
      />,
    )

  it('draws a line per series on one axis, a negative part when a line goes below zero', () => {
    const html = render()
    expect(html.match(/class="chart-line"/g)).toHaveLength(2)
    expect(html.match(/class="chart-line-dot"/g)).toHaveLength(6)
    expect(html).toContain('class="line-b"')
    expect(html).toContain('B, 2025-03: ')
    // Ticks a step of 20 000 EUR apart: -20 000 ... 60 000.
    expect(html.match(/class="overview-y-tick"/g)).toHaveLength(5)
  })

  it('puts the ticks on one step, a whole step below zero when a line dips under it', () => {
    expect(lineTicks(-1_000_00, 50_000_00).ticks).toEqual([-20_000_00, 0, 20_000_00, 40_000_00, 60_000_00])
    expect(lineTicks(0, 50_000_00).ticks).toEqual([0, 20_000_00, 40_000_00, 60_000_00])
    expect(lineTicks(0, 0).ticks).toEqual([0, 25_00])
  })

  it('makes each point pickable when a box of figures is asked for, the box hidden until one is', () => {
    const html = renderToStaticMarkup(
      <LineChart
        keys={keys}
        series={[{ key: 'a', label: 'A', values: [3, 2, 1], className: 'line-a', dots: true }]}
        labelFor={(k) => k}
        nameFor={(k) => k}
        locale="fi-FI"
        label="chart"
        pointTip={(i) => ({ title: keys[i], rows: [{ label: 'A', value: String(i) }] })}
      />,
    )
    expect(html).toMatch(/^<div class="line-chart"><svg[^>]* role="group" aria-label="chart" tabindex="0"/)
    expect(html.match(/class="chart-point-hit"/g)).toHaveLength(3)
    // The box replaces the dots' own hover text.
    expect(html).not.toContain('<title>A, 2025-01')
    expect(html).toContain('<div class="chart-tip" role="status" hidden="">')
  })

  it("draws 'spaced' dots only while the points are apart enough to tell", () => {
    const many = Array.from({ length: 240 }, (_, i) => `m${i}`)
    const chart = (dots: true | 'spaced', count: number) =>
      renderToStaticMarkup(
        <LineChart
          keys={many.slice(0, count)}
          series={[{ key: 'a', label: 'A', values: many.slice(0, count).map((_, i) => 1000 - i), className: 'line-a', dots }]}
          labelFor={(k) => k}
          nameFor={(k) => k}
          locale="fi-FI"
          label="chart"
        />,
      ).match(/class="chart-line-dot"/g)?.length ?? 0
    expect(chart('spaced', 37)).toBe(37)
    expect(chart('spaced', 240)).toBe(0)
    expect(chart(true, 240)).toBe(240)
  })

  it('leaves a gap where a value is null', () => {
    expect(linePath([null, 1, 2, null, 3], (i) => i, (v) => v)).toBe('M1.0,1.0 L2.0,2.0 M4.0,3.0')
    expect(linePath([null, null], (i) => i, (v) => v)).toBe('')
  })
})
