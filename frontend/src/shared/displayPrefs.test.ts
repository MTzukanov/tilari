import { describe, expect, it, beforeEach } from 'vitest'
import {
  DISPLAY_STORAGE_KEY,
  applyDisplayPrefs,
  loadDisplayPrefs,
  setDisplayPrefs,
  stepTextScale,
  textScaleMax,
  textScaleMin,
  textScalePercent,
} from './displayPrefs'

describe('displayPrefs', () => {
  beforeEach(() => {
    localStorage.removeItem(DISPLAY_STORAGE_KEY)
    document.documentElement.style.removeProperty('--tilari-text-scale')
    document.documentElement.style.removeProperty('--tilari-content-max')
  })

  it('defaults to 100% and normal width', () => {
    expect(loadDisplayPrefs()).toEqual({ textScale: 1, contentWidth: 'normal' })
  })

  it('persists and applies CSS vars', () => {
    const next = setDisplayPrefs({ textScale: 1.25, contentWidth: 'wide' })
    expect(next.textScale).toBe(1.25)
    expect(loadDisplayPrefs().contentWidth).toBe('wide')
    applyDisplayPrefs(next)
    expect(document.documentElement.style.getPropertyValue('--tilari-text-scale')).toBe('1.25')
    expect(document.documentElement.style.getPropertyValue('--tilari-content-max')).toBe('1600px')
  })

  it('steps text scale within bounds', () => {
    expect(stepTextScale(1, 1)).toBe(1.125)
    expect(stepTextScale(1.375, 1)).toBe(1.375)
    expect(stepTextScale(0.3, -1)).toBe(0.3)
    expect(stepTextScale(0.4, -1)).toBe(0.3)
    expect(stepTextScale(0.875, -1)).toBe(0.75)
    expect(textScalePercent(1.125)).toBe(113)
    expect(textScalePercent(0.3)).toBe(30)
  })

  it('exposes min and max from steps', () => {
    expect(textScaleMin()).toBe(0.3)
    expect(textScaleMax()).toBe(1.375)
  })

  it('maps full width to 100%', () => {
    setDisplayPrefs({ contentWidth: 'full' })
    applyDisplayPrefs()
    expect(document.documentElement.style.getPropertyValue('--tilari-content-max')).toBe('100%')
  })
})
