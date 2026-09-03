import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FONT_ID,
  FONT_STORAGE_KEY,
  applyFont,
  fontStackFor,
  loadFontId,
  saveFontId,
  setFont,
} from './fontPrefs'

describe('fontPrefs', () => {
  it('defaults when storage is empty', () => {
    localStorage.removeItem(FONT_STORAGE_KEY)
    expect(loadFontId()).toBe(DEFAULT_FONT_ID)
  })

  it('round-trips id and applies CSS var', () => {
    localStorage.clear()
    setFont('georgia')
    expect(loadFontId()).toBe('georgia')
    expect(fontStackFor('georgia')).toContain('Georgia')
    applyFont('georgia')
    expect(document.documentElement.style.getPropertyValue('--tilari-font')).toContain('Georgia')
  })

  it('falls back for unknown ids', () => {
    saveFontId('not-a-font')
    expect(loadFontId()).toBe(DEFAULT_FONT_ID)
    setFont('nope')
    expect(loadFontId()).toBe(DEFAULT_FONT_ID)
  })
})
