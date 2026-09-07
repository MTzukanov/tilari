import { describe, expect, it } from 'vitest'
import { isoFromFileLastModified, normalizeTimestamp } from './timestamps'

describe('timestamps', () => {
  it('normalizes SQLite CURRENT_TIMESTAMP style', () => {
    expect(normalizeTimestamp('2024-03-15 12:30:00')).toBe('2024-03-15T12:30:00.000Z')
  })

  it('normalizes ISO and epoch ms', () => {
    expect(normalizeTimestamp('2024-03-15T12:30:00.000Z')).toBe('2024-03-15T12:30:00.000Z')
    expect(isoFromFileLastModified(Date.UTC(2024, 2, 15, 12, 30))).toBe('2024-03-15T12:30:00.000Z')
  })

  it('returns null for empty values', () => {
    expect(normalizeTimestamp(null)).toBeNull()
    expect(normalizeTimestamp('')).toBeNull()
    expect(isoFromFileLastModified(0)).toBeNull()
  })
})
