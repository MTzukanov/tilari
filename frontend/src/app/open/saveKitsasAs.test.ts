import { describe, expect, it } from 'vitest'
import { kitsasFileName } from './saveKitsasAs'

describe('kitsasFileName', () => {
  it('adds extension when missing', () => {
    expect(kitsasFileName('Firma')).toBe('Firma.kitsas')
  })

  it('keeps existing extension', () => {
    expect(kitsasFileName('Firma.kitsas')).toBe('Firma.kitsas')
  })
})
