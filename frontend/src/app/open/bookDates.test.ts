import { describe, expect, it } from 'vitest'
import { formatBookDate, formatBookDateShort } from './bookDates'

describe('bookDates', () => {
  it('formats ISO timestamps for list and option labels', () => {
    const iso = '2024-03-15T12:30:00.000Z'
    expect(formatBookDate(iso, 'fi-FI')).toMatch(/2024/)
    expect(formatBookDateShort(iso, 'fi-FI')).toMatch(/15/)
  })

  it('returns null for missing values', () => {
    expect(formatBookDate(null, 'fi-FI')).toBeNull()
    expect(formatBookDateShort('not-a-date', 'fi-FI')).toBeNull()
  })
})
