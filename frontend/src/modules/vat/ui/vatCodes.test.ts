import { describe, expect, it } from 'vitest'
import {
  isZeroVatType,
  VAT_RATES,
  vatFromKey,
  vatIconKind,
  vatKey,
  vatPercentLabel,
  vatTypeChoices,
} from './vatCodes'

describe('vatIconKind', () => {
  it('matches Kitsas netto / brutto letters', () => {
    expect(vatIconKind(11)).toBe('sales-netto')
    expect(vatIconKind(21)).toBe('purchase-netto')
    expect(vatIconKind(12)).toBe('sales-brutto')
    expect(vatIconKind(22)).toBe('purchase-brutto')
  })

  it('uses the base code for tax and deduction companions', () => {
    expect(vatIconKind(111)).toBe('sales-netto')
    expect(vatIconKind(221)).toBe('purchase-netto')
    expect(vatIconKind(418)).toBe('cash')
  })

  it('covers the editor special types', () => {
    expect(vatIconKind(0)).toBe('none')
    expect(vatIconKind(18)).toBe('cash')
    expect(vatIconKind(28)).toBe('cash')
    expect(vatIconKind(19)).toBe('zero')
    expect(vatIconKind(25)).toBe('eu')
    expect(vatIconKind(29)).toBe('globe')
    expect(vatIconKind(901)).toBe('tax')
  })
})

describe('vatPercentLabel', () => {
  it('formats Finnish percent text like Kitsas alvProssa', () => {
    expect(vatPercentLabel(25.5)).toBe('25,50 %')
    expect(vatPercentLabel(14)).toBe('14,00 %')
    expect(vatPercentLabel(0)).toBe('')
  })
})

describe('VAT type / rate split', () => {
  it('lists Kitsas rates in the separate percent box', () => {
    expect([...VAT_RATES]).toEqual([25.5, 24, 14, 13.5, 10])
  })

  it('hides the rate for nollalaji types', () => {
    expect(isZeroVatType(0)).toBe(true)
    expect(isZeroVatType(19)).toBe(true)
    expect(isZeroVatType(21)).toBe(false)
  })

  it('keeps type and rate independent in keys', () => {
    expect(vatKey(21, 13.5)).toBe('21:13.5')
    expect(vatFromKey('21:10').percent).toBe(10)
    expect(vatFromKey('21:10').code).toBe(21)
    expect(vatFromKey('19:25.5').percent).toBe(0)
    expect(vatTypeChoices().some((c) => c.code === 21)).toBe(true)
  })
})
