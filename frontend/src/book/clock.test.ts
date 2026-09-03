import { afterEach, describe, expect, it } from 'vitest'
import {
  clearStoredPracticeDate,
  isIsoDate,
  isPracticeValue,
  loadStoredPracticeDate,
  practiceStorageKey,
  saveStoredPracticeDate,
  wallToday,
} from './clock'

describe('isPracticeValue', () => {
  it('matches Kitsas onko() truthiness', () => {
    expect(isPracticeValue('ON')).toBe(true)
    expect(isPracticeValue('1')).toBe(true)
    expect(isPracticeValue('true')).toBe(true)
    expect(isPracticeValue('EI')).toBe(false)
    expect(isPracticeValue('ei')).toBe(false)
    expect(isPracticeValue('0')).toBe(false)
    expect(isPracticeValue('')).toBe(false)
    expect(isPracticeValue(null)).toBe(false)
    expect(isPracticeValue(undefined)).toBe(false)
  })
})

describe('wallToday', () => {
  it('returns a valid local ISO date', () => {
    expect(isIsoDate(wallToday())).toBe(true)
  })
})

describe('isIsoDate', () => {
  it('rejects impossible calendar days', () => {
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2025-02-29')).toBe(false)
    expect(isIsoDate('2024-13-01')).toBe(false)
    expect(isIsoDate('2024-01-1')).toBe(false)
  })
})

describe('sessionStorage practice date', () => {
  afterEach(() => {
    clearStoredPracticeDate('book-a')
  })

  it('round-trips a date and ignores junk', () => {
    expect(practiceStorageKey('book-a')).toBe('tilari.practiceDate:book-a')
    saveStoredPracticeDate('book-a', '2024-06-15')
    expect(loadStoredPracticeDate('book-a')).toBe('2024-06-15')
    sessionStorage.setItem(practiceStorageKey('book-a'), 'nope')
    expect(loadStoredPracticeDate('book-a')).toBeNull()
  })
})
