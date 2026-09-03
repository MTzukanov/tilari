import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALLOCATION_PREFS,
  allocationActiveIn,
  loadAllocationPrefs,
  saveAllocationPrefs,
} from './allocationPrefs'

describe('allocationPrefs', () => {
  it('returns defaults when storage is empty', () => {
    localStorage.clear()
    expect(loadAllocationPrefs()).toEqual(DEFAULT_ALLOCATION_PREFS)
  })

  it('round-trips prefs', () => {
    localStorage.clear()
    saveAllocationPrefs({
      pnlOnly: true,
      includeProjects: false,
      profitMode: 'kitsas',
      hideEnded: true,
    })
    expect(loadAllocationPrefs()).toEqual({
      pnlOnly: true,
      includeProjects: false,
      profitMode: 'kitsas',
      hideEnded: true,
    })
  })

  it('treats missing KP dates as open-ended', () => {
    expect(allocationActiveIn(null, null, '2025-01-01', '2025-12-31')).toBe(true)
    expect(allocationActiveIn('2023-01-01', '2024-12-31', '2025-01-01', '2025-12-31')).toBe(
      false,
    )
    expect(allocationActiveIn('2025-01-01', null, '2024-01-01', '2024-12-31')).toBe(false)
    expect(allocationActiveIn('2024-01-01', '2024-12-31', '2024-09-01', '2024-09-30')).toBe(
      true,
    )
  })
})
