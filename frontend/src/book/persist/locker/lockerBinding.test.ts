import { describe, expect, it } from 'vitest'
import {
  assertLockerBindingForRead,
  assertLockerBindingForSave,
  lockerBindingFromConnection,
  sameLockerBinding,
  type LockerBinding,
} from './lockerBinding'
import type { LockerConnection } from './active'

describe('lockerBinding', () => {
  const a: LockerBinding = { kind: 'http', endpoint: 'books.example.com', path: 'tilari' }
  const b: LockerBinding = { kind: 'http', endpoint: 'other.example.com', path: 'tilari' }
  const sb: LockerBinding = { kind: 'supabase', endpoint: 'abc.supabase.co', path: 'tilari/cloud' }

  it('compares kind, endpoint, and path', () => {
    expect(sameLockerBinding(a, { ...a })).toBe(true)
    expect(sameLockerBinding(a, b)).toBe(false)
    expect(sameLockerBinding(a, sb)).toBe(false)
    expect(sameLockerBinding(null, a)).toBe(false)
  })

  it('builds fingerprint from connection snapshot', () => {
    const off: LockerConnection = { mode: 'off', endpoint: null, path: null, encrypted: false }
    expect(lockerBindingFromConnection(off)).toBeNull()
    expect(
      lockerBindingFromConnection({
        mode: 'http',
        endpoint: 'books.example.com',
        path: 'tilari',
        encrypted: false,
      }),
    ).toEqual(a)
  })

  it('assertLockerBindingForSave allows asNew and legacy missing binding when connected via live check', () => {
    // Without a live connection these throw locker_not_configured — covered in active tests.
    expect(() => assertLockerBindingForSave(a, true)).toThrow('locker_not_configured')
    expect(() => assertLockerBindingForRead(a)).toThrow('locker_not_configured')
  })

  it('treats empty and null path as equal', () => {
    expect(
      sameLockerBinding(
        { kind: 'http', endpoint: 'x', path: null },
        { kind: 'http', endpoint: 'x', path: '' },
      ),
    ).toBe(true)
  })
})
