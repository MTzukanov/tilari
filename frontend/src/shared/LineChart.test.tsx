import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineChart, lineTicks } from './LineChart'

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
})
