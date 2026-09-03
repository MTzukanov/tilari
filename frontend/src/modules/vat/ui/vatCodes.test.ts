import { describe, expect, it } from 'vitest'
import { vatIconKind, vatPercentLabel } from './vatCodes'

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
  it('formats Finnish percent text', () => {
    expect(vatPercentLabel(25.5)).toBe('25,5 %')
    expect(vatPercentLabel(0)).toBe('')
  })
})
