import { describe, expect, it } from 'vitest'
import {
  forgetLocale,
  getBcp47,
  getFormatLocale,
  initLocale,
  isLocaleChosen,
  setFormatLocale,
  setLocale,
  t,
} from './engine'
import { STORAGE_KEY } from './types'
import { formatDate } from '../shared/dates'
import { formatCents } from '../shared/money'
import fi from './locales/fi.json'
import sv from './locales/sv.json'
import en from './locales/en.json'
import de from './locales/de.json'
import type { MessageDict } from './types'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

function assertSameCatalog(source: MessageDict, other: MessageDict, path = ''): void {
  const sourceKeys = Object.keys(source).sort()
  const otherKeys = Object.keys(other).sort()
  expect(otherKeys, path || 'root').toEqual(sourceKeys)
  for (const name of sourceKeys) {
    const next = path ? `${path}.${name}` : name
    const sourceValue = source[name]
    const otherValue = other[name]
    if (typeof sourceValue === 'string') {
      expect(typeof otherValue, next).toBe('string')
      if (typeof otherValue === 'string') {
        expect(placeholders(otherValue), next).toEqual(placeholders(sourceValue))
      }
    } else {
      expect(otherValue && typeof otherValue === 'object', next).toBe(true)
      assertSameCatalog(sourceValue, otherValue as MessageDict, next)
    }
  }
}

describe('i18n engine', () => {
  it('returns Finnish strings by default', () => {
    initLocale('fi', 'fi')
    expect(t('nav.browse')).toBe('Selaa')
    expect(t('browse.allStatuses')).toBe('Kaikki')
    expect(t('browse.groupVouchers')).toBe('Tositteet')
    expect(t('voucherType.200')).toBe('Tulo')
    expect(t('app.asOf', { date: '2026-12-31' })).toBe('Tilanne 2026-12-31')
    expect(t('vat.types.21')).toContain('osto')
  })

  it('returns translated strings for English, Swedish, and German', () => {
    initLocale('en', 'fi')
    expect(t('nav.browse')).toBe('Browse')
    expect(t('voucherType.200')).toBe('Income')
    expect(t('app.asOf', { date: '2026-12-31' })).toBe('As of 2026-12-31')
    initLocale('sv', 'fi')
    expect(t('nav.browse')).toBe('Bläddra')
    expect(t('voucherType.200')).toBe('Inkomst')
    initLocale('de', 'fi')
    expect(t('nav.browse')).toBe('Durchsuchen')
    expect(t('voucherType.200')).toBe('Einnahme')
    initLocale('fi', 'fi')
  })

  it('falls back to Finnish when a key is missing from the active catalog', () => {
    initLocale('de', 'fi')
    expect(t('does.not.exist')).toBe('does.not.exist')
    expect(getBcp47()).toBe('fi-FI')
    initLocale('fi', 'fi')
  })

  it('keeps Finnish number and date formats when the language changes', () => {
    initLocale('fi', 'fi')
    setLocale('en')
    expect(getFormatLocale()).toBe('fi')
    expect(getBcp47()).toBe('fi-FI')
    expect(formatDate('2026-01-02')).toBe(
      new Intl.DateTimeFormat('fi-FI', { dateStyle: 'short' }).format(new Date(2026, 0, 2)),
    )
    expect(formatCents(110500)).toBe(
      new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(1105),
    )
    setLocale('fi')
  })

  it('formats money and dates from the format locale, not the UI language', () => {
    initLocale('fi', 'fi')
    setFormatLocale('en')
    expect(getBcp47()).toBe('en-GB')
    expect(formatDate('2026-01-02')).toBe(
      new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(new Date(2026, 0, 2)),
    )
    expect(formatCents(110500)).toBe(
      new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(1105),
    )
    setFormatLocale('fi')
  })

  it('returns the key when nothing is defined', () => {
    expect(t('does.not.exist')).toBe('does.not.exist')
  })

  it('persists a first-run Finnish choice even when Finnish is already the default', () => {
    localStorage.removeItem(STORAGE_KEY)
    initLocale()
    expect(isLocaleChosen()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    setLocale('fi')
    expect(isLocaleChosen()).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fi')
    forgetLocale()
    expect(isLocaleChosen()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    initLocale('fi', 'fi')
  })
})

describe('locale catalogs', () => {
  it.each([
    ['sv', sv],
    ['en', en],
    ['de', de],
  ] as const)('%s has the same keys and placeholders as Finnish', (_id, catalog) => {
    assertSameCatalog(fi as MessageDict, catalog as MessageDict)
  })
})
