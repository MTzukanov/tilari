import { describe, expect, it } from 'vitest'
import {
  allTimeRange,
  formatRangeLabel,
  monthRange,
  monthsInPeriods,
  parseISO,
  parseRangeValue,
  periodForRange,
  rangeValue,
  shiftMonth,
  shiftPeriod,
} from './periodNav'

const periods = [
  { starts: '2024-01-01', ends: '2024-12-31' },
  { starts: '2025-01-01', ends: '2025-12-31' },
]

const midYear = [
  { starts: '2022-03-22', ends: '2023-03-21' },
  { starts: '2023-03-22', ends: '2024-03-21' },
]

describe('periodNav', () => {
  it('builds calendar month ranges', () => {
    expect(monthRange(parseISO('2024-03-10'))).toEqual({
      starts: '2024-03-01',
      ends: '2024-03-31',
    })
    expect(monthRange(parseISO('2024-02-01'))).toEqual({
      starts: '2024-02-01',
      ends: '2024-02-29',
    })
  })

  it('shifts months across year boundary', () => {
    expect(shiftMonth('2024-12-01', true)).toEqual({
      starts: '2025-01-01',
      ends: '2025-01-31',
    })
    expect(shiftMonth('2025-01-01', false)).toEqual({
      starts: '2024-12-01',
      ends: '2024-12-31',
    })
  })

  it('shifts fiscal years and stops at ends', () => {
    expect(shiftPeriod(periods, '2024-01-01', '2024-12-31', true)).toEqual({
      starts: '2025-01-01',
      ends: '2025-12-31',
    })
    expect(shiftPeriod(periods, '2024-01-01', '2024-12-31', false)).toBeNull()
    expect(shiftPeriod(periods, '2025-01-01', '2025-12-31', true)).toBeNull()
  })

  it('matches a month range that only overlaps a mid-year fiscal period', () => {
    const found = periodForRange(midYear, '2023-03-01', '2023-03-31')
    expect(found).toEqual({ starts: '2022-03-22', ends: '2023-03-21' })
  })

  it('computes all-time span', () => {
    expect(allTimeRange(periods)).toEqual({
      starts: '2024-01-01',
      ends: '2025-12-31',
    })
    expect(allTimeRange([])).toBeNull()
  })

  it('labels all-time mode', () => {
    expect(formatRangeLabel('all', '2024-01-01', '2025-12-31')).toBe(
      'Kaikki tilikaudet',
    )
  })

  it('lists overlapping months including a mid-year fiscal period', () => {
    const months = monthsInPeriods(midYear)
    expect(months[0]).toEqual({ starts: '2022-03-01', ends: '2022-03-31' })
    expect(months.at(-1)).toEqual({ starts: '2024-03-01', ends: '2024-03-31' })
    expect(months.some((m) => m.starts === '2023-03-01')).toBe(true)
  })

  it('round-trips a range value', () => {
    expect(parseRangeValue(rangeValue('2024-01-01', '2024-12-31'))).toEqual({
      starts: '2024-01-01',
      ends: '2024-12-31',
    })
  })
})
