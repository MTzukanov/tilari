import { describe, expect, it } from 'vitest'
import { isVatLiableSetting } from './settings'

describe('isVatLiableSetting', () => {
  it('matches Kitsas AsetusModel::onko', () => {
    expect(isVatLiableSetting('ON')).toBe(true)
    expect(isVatLiableSetting('on')).toBe(true)
    expect(isVatLiableSetting('EI')).toBe(false)
    expect(isVatLiableSetting('0')).toBe(false)
    expect(isVatLiableSetting('')).toBe(false)
    expect(isVatLiableSetting(null)).toBe(false)
  })
})
