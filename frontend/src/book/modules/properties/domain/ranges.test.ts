import { describe, expect, it } from 'vitest'
import { overlaps } from './ranges'

const span = (s: string) => {
  const [from, to] = s.split('..')
  return { from, to: to || null }
}
const pairs = (items: string[]) => overlaps(items, span).map(([a, b]) => `${a} & ${b}`)

describe('overlaps', () => {
  it('pairs periods that share a day, in start order; the next day is free', () => {
    expect(pairs(['2024-01-01..2024-06-30', '2024-07-01..2024-12-31'])).toEqual([])
    expect(pairs(['2024-07-01..2024-12-31', '2024-01-01..2024-07-01'])).toEqual(['2024-01-01..2024-07-01 & 2024-07-01..2024-12-31'])
  })

  it('an open period runs on; a later one meets the earlier that reaches furthest', () => {
    expect(pairs(['2024-01-01..', '2030-01-01..2030-12-31'])).toEqual(['2024-01-01.. & 2030-01-01..2030-12-31'])
    expect(pairs(['2024-01-01..2024-12-31', '2024-02-01..2024-02-29', '2024-03-01..2024-03-31'])).toEqual([
      '2024-01-01..2024-12-31 & 2024-02-01..2024-02-29',
      '2024-01-01..2024-12-31 & 2024-03-01..2024-03-31',
    ])
    expect(pairs([])).toEqual([])
  })
})
