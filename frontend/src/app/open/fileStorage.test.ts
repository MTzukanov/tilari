import { describe, expect, it } from 'vitest'
import { canPrimarySave, fileStorageKind, needsLockerDisconnectGuard } from './fileStorage'

describe('fileStorageKind', () => {
  it('detects locker, disk, browser, and session copies', () => {
    expect(fileStorageKind('locker:abc', false)).toBe('locker')
    expect(fileStorageKind('local:id/book.kitsas', true)).toBe('disk')
    expect(fileStorageKind('local:id/book.kitsas', false)).toBe('browser')
    expect(fileStorageKind('server:book.kitsas', false, 'http')).toBe('session')
  })
})

describe('canPrimarySave', () => {
  it('requires dirty for wasm locker and disk', () => {
    expect(canPrimarySave('locker', 'wasm', false)).toBe(false)
    expect(canPrimarySave('locker', 'wasm', true)).toBe(true)
    expect(canPrimarySave('disk', 'wasm', true)).toBe(true)
  })

  it('requires dirty for http locker save', () => {
    expect(canPrimarySave('locker', 'http', false)).toBe(false)
    expect(canPrimarySave('locker', 'http', true)).toBe(true)
  })
})

describe('needsLockerDisconnectGuard', () => {
  it('only when a dirty locker book is open', () => {
    expect(needsLockerDisconnectGuard('locker', true)).toBe(true)
    expect(needsLockerDisconnectGuard('locker', false)).toBe(false)
    expect(needsLockerDisconnectGuard('browser', true)).toBe(false)
    expect(needsLockerDisconnectGuard('disk', true)).toBe(false)
    expect(needsLockerDisconnectGuard(null, true)).toBe(false)
  })
})
