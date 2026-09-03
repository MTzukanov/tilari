import { describe, expect, it } from 'vitest'
import { descriptionIfDifferent } from './assistantRow'

describe('descriptionIfDifferent', () => {
  it('clears a row explanation that only repeats the voucher title', () => {
    expect(descriptionIfDifferent('IBAN-maksu viitteellä 1', 'IBAN-maksu viitteellä 1')).toBe('')
    expect(descriptionIfDifferent('  sama  ', 'sama')).toBe('')
    expect(descriptionIfDifferent('', 'Otsikko')).toBe('')
  })

  it('keeps a distinct row explanation', () => {
    expect(descriptionIfDifferent('Vuokra tammikuu', 'IBAN-maksu')).toBe('Vuokra tammikuu')
  })
})
