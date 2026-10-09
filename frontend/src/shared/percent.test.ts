import { describe, expect, it } from 'vitest'
import { formatPercentInput, parsePercentInput } from './percent'

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
})
