import { describe, expect, it } from 'vitest'
import fi from '../../../i18n/locales/fi.json'
import { formatDate } from '../../../shared/dates'
import { dueTile, sortWarnings, WARNING_WORDS, warningTone } from './format'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`

describe('warning tones', () => {
  it('gives every warning text a place, and has no place without a text', () => {
    const codes = Object.keys(fi.properties.warn).sort()
    expect(Object.keys(WARNING_WORDS).sort()).toEqual(codes)
    for (const word of new Set(Object.values(WARNING_WORDS))) {
      if (word !== 'due') expect(fi.properties.alerts.word).toHaveProperty(word)
    }
  })

  it('reads a missing document and an error as crit, a suggestion as doc, a note as neutral', () => {
    expect(warningTone('lease_contract_missing')).toEqual({ tone: 'crit', word: 'missing' })
    expect(warningTone('lease_overlap')).toEqual({ tone: 'crit', word: 'error' })
    expect(warningTone('rent_arrears')).toEqual({ tone: 'warn', word: 'todo' })
    expect(warningTone('lease_suggestions')).toEqual({ tone: 'doc', word: 'suggestion' })
    expect(warningTone('sale_costs_unset')).toEqual({ tone: 'neutral', word: 'note' })
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
