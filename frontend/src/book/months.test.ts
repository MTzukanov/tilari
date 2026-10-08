import { describe, expect, it } from 'vitest'
import { addMonths, monthEnd, monthKeys } from './months'

describe('months', () => {
  it('lists month keys across a year boundary', () => {
    expect(monthKeys('2024-11-15', '2025-02-01')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
    expect(monthKeys('2025-03-01', '2025-03-31')).toEqual(['2025-03'])
    expect(monthKeys('2025-04-01', '2025-03-31')).toEqual([])
  })

  it('finds month ends, leap years included', () => {
    expect(monthEnd('2024-02-10')).toBe('2024-02-29')
    expect(monthEnd('2025-02')).toBe('2025-02-28')
    expect(monthEnd('2025-12-01')).toBe('2025-12-31')
  })

  it('shifts month keys', () => {
    expect(addMonths('2025-01', -1)).toBe('2024-12')
    expect(addMonths('2025-12', 1)).toBe('2026-01')
    expect(addMonths('2025-06', -12)).toBe('2024-06')
  })
})
