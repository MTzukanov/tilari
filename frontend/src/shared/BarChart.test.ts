import { describe, expect, it } from 'vitest'
import { axisSteps, chartGrid } from './BarChart'
import { niceStep } from './chartScale'

describe('axisSteps', () => {
  it('gives the larger side two steps and the other only what it needs', () => {
    expect(axisSteps([40000, -10000])).toEqual({ step: 25000, up: 2, down: 1 })
    expect(axisSteps([40000, -30000])).toEqual({ step: 25000, up: 2, down: 2 })
    expect(axisSteps([-40000, 1000])).toEqual({ step: 25000, up: 1, down: 2 })
    expect(axisSteps([40000, 0])).toEqual({ step: 25000, up: 2, down: 0 })
  })
})

describe('chartGrid', () => {
  it('puts a line that fits the bars on their scale, without a right axis', () => {
    expect(chartGrid([40000, -10000], [30000, 20000])).toEqual({
      up: 2,
      down: 1,
      leftStep: 25000,
      lineStep: 25000,
      rightStep: null,
    })
  })

  it('gives a larger line the smallest round step that fits the bars\' grid, on the right', () => {
    // Bars up to 400 € and down to 100 €; the total falls to -1 200 € and climbs to 3 000 €.
    expect(chartGrid([40000, -10000], [-120000, 300000])).toEqual({
      up: 2,
      down: 1,
      leftStep: 25000,
      lineStep: 200000,
      rightStep: 200000,
    })
  })

  it('adds a step on a side only the line reaches', () => {
    expect(chartGrid([-40000], [100000])).toEqual({ up: 1, down: 2, leftStep: 25000, lineStep: 100000, rightStep: 100000 })
  })

  it('draws a line alone on the left axis', () => {
    expect(chartGrid(null, [30000, 60000])).toEqual({ up: 2, down: 0, leftStep: 50000, lineStep: 50000, rightStep: null })
  })
})

describe('niceStep', () => {
  it('rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect([1, 150000, 225000, 240000, 300000, 600000].map(niceStep)).toEqual([1, 200000, 250000, 250000, 500000, 1000000])
  })
})
