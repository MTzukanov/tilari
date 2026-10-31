import { describe, expect, it } from 'vitest'
import { deadlineAlerts, periodDeadlines, type DeadlineInputs } from './deadlines'
import type { DeadlineKey } from './types'

function deadlines(partial: Partial<DeadlineInputs> & { ends: string; asOf: string }) {
  return periodDeadlines({ filled: () => false, notNeeded: () => false, kitsasStatement: false, ...partial })
}

function due(ends: string, key: DeadlineKey): string {
  return deadlines({ ends, asOf: ends }).find((d) => d.key === key)!.due
}

describe('company deadlines', () => {
  it('counts from a year ending in December', () => {
    expect(due('2031-12-31', 'statements_prepared')).toBe('2032-04-30')
    expect(due('2031-12-31', 'agm')).toBe('2032-06-30')
    expect(due('2031-12-31', 'prh_filing')).toBe('2032-08-31')
  })

  it('takes the 6B to the last day of the 4th month after the end month', () => {
    // 30 November 2031 is a Sunday: the example Vero.fi gives for a year ending mid-July.
    expect(due('2031-07-15', 'tax_return')).toBe('2031-12-01')
    expect(due('2032-07-15', 'tax_return')).toBe('2032-11-30')
  })

  it('moves a 6B falling on a day off to the next working day', () => {
    // 30 April 2033 is a Saturday, 30 April 2034 a Sunday.
    expect(due('2032-12-31', 'tax_return')).toBe('2033-05-02')
    expect(due('2033-12-31', 'tax_return')).toBe('2034-05-01')
    expect(due('2034-12-31', 'tax_return')).toBe('2035-04-30')
  })

  it('counts the PRH filing to the day, not to the month end', () => {
    expect(due('2032-02-15', 'prh_filing')).toBe('2032-10-15')
    expect(due('2031-08-31', 'prh_filing')).toBe('2032-04-30')
  })

  it('reads the state from the slot and the date', () => {
    const state = (partial: Partial<DeadlineInputs>, asOf: string) =>
      deadlines({ ends: '2031-12-31', asOf, ...partial }).find((d) => d.key === 'agm')!
    expect(state({}, '2032-01-15').state).toBe('later')
    expect(state({}, '2032-06-10')).toMatchObject({ state: 'upcoming', days: 20 })
    expect(state({}, '2032-07-05')).toMatchObject({ state: 'overdue', days: -5 })
    expect(state({ filled: (k) => k === 'agm_minutes' }, '2032-07-05').state).toBe('done')
    expect(state({ notNeeded: (k) => k === 'agm_minutes' }, '2032-07-05').state).toBe('not_needed')
  })

  it("takes Kitsas's own statement PDF as prepared, and only that deadline", () => {
    const rows = deadlines({ ends: '2031-12-31', asOf: '2032-12-01', kitsasStatement: true })
    expect(rows.find((d) => d.key === 'statements_prepared')!.state).toBe('done')
    expect(rows.find((d) => d.key === 'prh_filing')!.state).toBe('overdue')
  })

  it('alerts when due soon or missed within a year, not for old gaps', () => {
    const agm = (asOf: string) => deadlines({ ends: '2031-12-31', asOf }).find((d) => d.key === 'agm')!
    expect(deadlineAlerts(agm('2032-01-15'))).toBe(false)
    expect(deadlineAlerts(agm('2032-06-10'))).toBe(true)
    expect(deadlineAlerts(agm('2033-06-29'))).toBe(true)
    expect(deadlineAlerts(agm('2033-07-01'))).toBe(false)
  })
})
