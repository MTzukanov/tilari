import { describe, expect, it } from 'vitest'
import { formatEurInput, parseEurInput, sanitizeEurInput } from './money'

describe('sanitizeEurInput', () => {
  it('keeps a Finnish decimal draft', () => {
    expect(sanitizeEurInput('12,5')).toBe('12,5')
    expect(sanitizeEurInput('12,50')).toBe('12,50')
    expect(sanitizeEurInput('12,')).toBe('12,')
  })

  it('treats a period as the decimal separator', () => {
    expect(sanitizeEurInput('12.5')).toBe('12,5')
    expect(sanitizeEurInput('.25')).toBe(',25')
  })

  it('keeps only the first separator and two fraction digits', () => {
    expect(sanitizeEurInput('12.34.56')).toBe('12,34')
    expect(sanitizeEurInput('12,,99')).toBe('12,99')
    expect(sanitizeEurInput('12,501')).toBe('12,50')
  })

  it('strips currency junk and allows a leading minus', () => {
    expect(sanitizeEurInput('1 234,56 €')).toBe('1234,56')
    expect(sanitizeEurInput('−12,5')).toBe('-12,5')
    expect(sanitizeEurInput('-')).toBe('-')
  })
})

describe('parseEurInput', () => {
  it('parses comma and period amounts as integer cents', () => {
    expect(parseEurInput('12,50')).toBe(1250)
    expect(parseEurInput('12.5')).toBe(1250)
    expect(parseEurInput('12,')).toBe(1200)
    expect(parseEurInput(',5')).toBe(50)
    expect(parseEurInput('-1,05')).toBe(-105)
    expect(parseEurInput('12.34.56')).toBe(1234)
    expect(parseEurInput('')).toBe(0)
  })
})

describe('formatEurInput', () => {
  it('formats cents with a comma and two decimals', () => {
    expect(formatEurInput(1250)).toBe('12,50')
    expect(formatEurInput(5)).toBe('0,05')
    expect(formatEurInput(-100)).toBe('-1,00')
    expect(formatEurInput(0, { emptyZero: true })).toBe('')
  })
})
