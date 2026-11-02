import { describe, expect, it } from 'vitest'
import { deadlineAlerts, dividendReportDue, isDayOff, periodDeadlines, type DeadlineInputs } from './deadlines'
import type { DeadlineKey } from './types'

function deadlines(partial: Partial<DeadlineInputs> & { ends: string; asOf: string }) {
  return periodDeadlines({ filled: () => false, notNeeded: () => false, required: () => true, kitsasStatement: false, ...partial })
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
    // 30 April 2033 is a Saturday, 1 May a Sunday.
    expect(due('2032-12-31', 'tax_return')).toBe('2033-05-02')
    expect(due('2034-12-31', 'tax_return')).toBe('2035-04-30')
  })

  it('moves a 6B past Vappu too: the Sunday before it goes to Tuesday', () => {
    // Vero's notice of 13.1.2023 gave 2.5. for years ending 31.12.2022.
    expect(due('2022-12-31', 'tax_return')).toBe('2023-05-02')
    expect(due('2033-12-31', 'tax_return')).toBe('2034-05-02')
  })

  it('moves a 6B past the holidays around other month ends', () => {
    // 31.12.2028 is a Sunday and 1.1.2029 New Year's Day.
    expect(due('2028-08-31', 'tax_return')).toBe('2029-01-02')
    // 31.3.2028 is a Friday, not a holiday; 31.3.2027 is a Wednesday.
    expect(due('2027-11-30', 'tax_return')).toBe('2028-03-31')
    // 31.5.2029 is a Thursday, and not Ascension Day that year.
    expect(due('2029-01-31', 'tax_return')).toBe('2029-05-31')
  })

  it('dates the annual report on dividends from the year they were paid', () => {
    // 31.1.2033 is a Monday. The period does not matter, only the payment's year.
    expect(dividendReportDue('2032-06-15')).toBe('2033-01-31')
    expect(dividendReportDue('2032-12-31')).toBe('2033-01-31')
    // 31.1.2032 is a Saturday and 31.1.2027 a Sunday, both moving to the Monday.
    expect(dividendReportDue('2031-03-01')).toBe('2032-02-02')
    expect(dividendReportDue('2026-08-01')).toBe('2027-02-01')
  })

  it('has no annual report deadline before a dividend is paid', () => {
    expect(deadlines({ ends: '2031-12-31', asOf: '2032-06-01' }).map((d) => d.key)).not.toContain('dividend_report')
    expect(deadlines({ ends: '2031-12-31', asOf: '2032-06-01', dividendPaid: null }).map((d) => d.key)).not.toContain('dividend_report')
    const report = (asOf: string, partial: Partial<DeadlineInputs> = {}) =>
      deadlines({ ends: '2031-12-31', asOf, dividendPaid: '2032-06-15', ...partial }).find((d) => d.key === 'dividend_report')!
    expect(report('2032-07-01')).toMatchObject({ kind: 'dividend_annual_report', due: '2033-01-31', state: 'later' })
    expect(report('2033-01-20').state).toBe('upcoming')
    expect(report('2033-02-05').state).toBe('overdue')
    expect(report('2033-02-05', { filled: (k) => k === 'dividend_annual_report' }).state).toBe('done')
  })

  it('knows the days off of the deadlines act', () => {
    const off = [
      '2026-01-01', // New Year's Day, a Thursday
      '2026-01-06', // Epiphany
      '2026-04-03', // Good Friday
      '2026-04-06', // Easter Monday
      '2026-05-01', // Vappu
      '2026-05-14', // Ascension Day
      '2026-06-19', // Midsummer Eve
      '2026-12-24', // Christmas Eve
      '2026-12-25',
      '2024-12-06', // Independence Day, a Friday
      '2026-05-02', // a Saturday
      '2026-05-03', // a Sunday
    ]
    expect(off.filter((d) => !isDayOff(d))).toEqual([])
    const working = ['2026-04-02', '2026-04-07', '2026-05-13', '2026-06-18', '2026-06-26', '2026-12-23', '2026-12-28']
    expect(working.filter(isDayOff)).toEqual([])
  })

  it('keeps the other deadlines on their day, a day off or not', () => {
    // 30.4.2034 is a Sunday; 31.8.2025 too.
    expect(due('2033-12-31', 'statements_prepared')).toBe('2034-04-30')
    expect(due('2024-12-31', 'prh_filing')).toBe('2025-08-31')
    expect(due('2024-12-31', 'agm')).toBe('2025-06-30')
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

  it('only says "go and check" after the date when no document is required', () => {
    const prh = (asOf: string, partial: Partial<DeadlineInputs> = {}) =>
      deadlines({ ends: '2031-12-31', asOf, required: (k) => k !== 'prh_filing_receipt', ...partial }).find((d) => d.key === 'prh_filing')!
    expect(prh('2032-03-01').state).toBe('later')
    // Still a reminder before the day: the late fee is real.
    expect(prh('2032-08-20').state).toBe('upcoming')
    expect(deadlineAlerts(prh('2032-08-20'))).toBe(true)
    // After it, Tilari cannot know: not late, and not in the header.
    expect(prh('2032-09-05').state).toBe('unverified')
    expect(deadlineAlerts(prh('2032-09-05'))).toBe(false)
    expect(prh('2032-09-05', { notNeeded: (k) => k === 'prh_filing_receipt' }).state).toBe('not_needed')
    expect(prh('2032-09-05', { filled: (k) => k === 'prh_filing_receipt' }).state).toBe('done')
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
