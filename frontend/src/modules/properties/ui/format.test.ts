import { describe, expect, it } from 'vitest'
import fi from '../../../i18n/locales/fi.json'
import { formatDate } from '../../../shared/dates'
import { dueTile, monthsCovered, returnSoFar, sortWarnings, yearReturnBp, tabMarks, WARNING_TABS, WARNING_WORDS, warningTone } from './format'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`

describe('warning tones', () => {
  it('gives every warning text a place, and has no place without a text', () => {
    // A `_one` key is the singular of its code's text, not a code.
    const codes = Object.keys(fi.properties.warn).filter((k) => !k.endsWith('_one')).sort()
    expect(Object.keys(WARNING_WORDS).sort()).toEqual(codes)
    for (const word of new Set(Object.values(WARNING_WORDS))) {
      if (word !== 'due') expect(fi.properties.alerts.word).toHaveProperty(word)
    }
  })

  it('names the tab where every warning is fixed', () => {
    expect(Object.keys(WARNING_TABS).sort()).toEqual(Object.keys(WARNING_WORDS).sort())
  })

  it('marks a tab with its worst warning, a late reminder as crit, and never with a note', () => {
    const marks = tabMarks(
      t,
      [
        { code: 'lease_suggestions' },
        { code: 'increase_due', params: { tenant: 'A', from_date: '2026-12-01' } },
        { code: 'water_suggestions' },
        { code: 'sale_carried' },
        { code: 'doc_corrupt' },
      ],
      '2026-11-15',
    )
    expect(Object.fromEntries(marks)).toEqual({ leases: { tone: 'warn', count: 2 }, water: { tone: 'doc', count: 1 } })
    const late = tabMarks(t, [{ code: 'lease_suggestions' }, { code: 'lease_ending', params: { tenant: 'A', ends_date: '2026-11-01' } }], '2026-11-15')
    expect(late.get('leases')).toEqual({ tone: 'crit', count: 2 })
  })

  it('reads a missing document and an error as crit, a suggestion as doc, a note as neutral', () => {
    expect(warningTone('lease_contract_missing')).toEqual({ tone: 'crit', word: 'missing' })
    expect(warningTone('lease_overlap')).toEqual({ tone: 'crit', word: 'error' })
    expect(warningTone('rent_arrears')).toEqual({ tone: 'warn', word: 'todo' })
    expect(warningTone('lease_suggestions')).toEqual({ tone: 'doc', word: 'suggestion' })
    expect(warningTone('sale_carried')).toEqual({ tone: 'neutral', word: 'note' })
    expect(warningTone('something_new')).toEqual({ tone: 'warn', word: 'todo' })
  })

  it('lists errors first and notes last, keeping the order within a word', () => {
    const codes = ['sale_carried', 'rent_arrears', 'lease_suggestions', 'water_tenant_owes', 'lease_contract_missing', 'loan_shared']
    expect(sortWarnings(codes.map((code) => ({ code }))).map((w) => w.code)).toEqual([
      'loan_shared',
      'lease_contract_missing',
      'rent_arrears',
      'water_tenant_owes',
      'lease_suggestions',
      'sale_carried',
    ])
  })
})

describe('due tiles', () => {
  it('counts the days left to a lease end like the company deadlines', () => {
    const tile = dueTile(t, { code: 'lease_ending', params: { tenant: 'Testi Vuokralainen', ends_date: '2026-02-28' } }, '2025-12-31')
    expect(tile).toEqual({
      label: 'properties.alerts.due.leaseEnding{"tenant":"Testi Vuokralainen"}',
      due: formatDate('2026-02-28'),
      state: 'properties.alerts.due.left{"days":59}',
      tone: 'warn',
    })
  })

  it('turns an increase whose day has passed red, and names an unknown tenant', () => {
    const tile = dueTile(t, { code: 'increase_due', params: { tenant: '', from_date: '2026-03-01' } }, '2026-03-10')
    expect(tile?.label).toBe('properties.alerts.due.increase{"tenant":"properties.lease.tenantUnknown"}')
    expect(tile?.state).toBe('properties.alerts.due.late{"days":9}')
    expect(tile?.tone).toBe('crit')
  })

  it('is only for the two dated reminders', () => {
    expect(dueTile(t, { code: 'rent_arrears', params: { amount_snt: 100 } }, '2026-03-10')).toBeNull()
  })
})

describe('months covered', () => {
  const year = { starts: '2026-01-01', ends: '2026-12-31' }

  it('counts the months a year has figures for, from its first', () => {
    expect(monthsCovered(year, '2026-10-31')).toBe(10)
    expect(monthsCovered(year, '2026-01-31')).toBe(1)
    expect(monthsCovered({ starts: '2022-03-22', ends: '2022-12-31' }, '2022-10-31')).toBe(8)
    expect(monthsCovered({ starts: '2025-07-01', ends: '2026-06-30' }, '2026-02-28')).toBe(8)
  })

  it('is null for a year the figures reach the end of, and for one not begun', () => {
    expect(monthsCovered(year, '2026-12-31')).toBeNull()
    expect(monthsCovered(year, '2027-03-31')).toBeNull()
    expect(monthsCovered(year, '2025-12-31')).toBeNull()
  })
})

describe('the return of a year and so far', () => {
  it('gives a part year what its months earned, not a year\'s rate', () => {
    // 60 000 in for 2 months weighs 10 000 over a year; 300 earned is 0,5 %.
    expect(yearReturnBp(300_00, 10_000_00, 2)).toBe(50)
    expect(yearReturnBp(2_400_00, 60_000_00, 12)).toBe(400)
    expect(yearReturnBp(300_00, 0, 0)).toBeNull()
  })

  it('chains the years', () => {
    // 0,5 % in the first year's 2 months; then 4 % on top; then nothing in.
    const years = [
      { result_snt: 300_00, money_in_snt: 10_000_00, months: 2 },
      { result_snt: 2_400_00, money_in_snt: 60_000_00, months: 12 },
      { result_snt: 0, money_in_snt: 0, months: 0 },
    ]
    expect(returnSoFar(years)).toEqual([50, 452, 452])
  })

  it('takes a losing year off what had grown', () => {
    expect(returnSoFar([
      { result_snt: 1_000_00, money_in_snt: 10_000_00, months: 12 },
      { result_snt: -1_000_00, money_in_snt: 10_000_00, months: 12 },
    ])).toEqual([1_000, -100])
  })
})
