import { describe, expect, it } from 'vitest'
import { formatPcmInput, formatPercentInput, parsePcmInput, parsePercentInput } from './percent'

describe('percent input', () => {
  it('parses Finnish and dotted decimals to basis points', () => {
    expect(parsePercentInput('4,5')).toBe(450)
    expect(parsePercentInput(' 3.25 % ')).toBe(325)
    expect(parsePercentInput('')).toBeNull()
    expect(parsePercentInput('abc')).toBeNaN()
    expect(parsePercentInput('1,234')).toBeNaN()
  })

  it('formats basis points for editing', () => {
    expect(formatPercentInput(450)).toBe('4,5')
    expect(formatPercentInput(300)).toBe('3')
    expect(formatPercentInput(null)).toBe('')
  })

  it('parses and formats interest rates in 1/1000 %, negative ones too', () => {
    expect(parsePcmInput('2,123')).toBe(2123)
    expect(parsePcmInput('0.8 %')).toBe(800)
    expect(parsePcmInput('-0,25')).toBe(-250)
    expect(parsePcmInput('−0,5')).toBe(-500)
    expect(parsePcmInput('')).toBeNull()
    expect(parsePcmInput('1,2345')).toBeNaN()
    expect(formatPcmInput(2123)).toBe('2,123')
    expect(formatPcmInput(-250)).toBe('-0,25')
    expect(formatPcmInput(null)).toBe('')
  })
})
