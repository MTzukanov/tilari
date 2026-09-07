import type { LockerConnection } from './active'
import { getLockerConnection } from './active'

/** Fingerprint of the shelf a locker book was opened/saved against (no secrets). */
export type LockerBinding = {
  kind: 'http' | 'supabase'
  endpoint: string | null
  path: string | null
}

export function lockerBindingFromConnection(conn: LockerConnection = getLockerConnection()): LockerBinding | null {
  if (conn.mode === 'off') return null
  return {
    kind: conn.mode,
    endpoint: conn.endpoint,
    path: conn.path,
  }
}

export function sameLockerBinding(
  a: LockerBinding | null | undefined,
  b: LockerBinding | null | undefined,
): boolean {
  if (!a || !b) return false
  return a.kind === b.kind && a.endpoint === b.endpoint && (a.path || '') === (b.path || '')
}

/**
 * Primary locker I/O must hit the same shelf the book is bound to.
 * `asNew` (Save as…) may target the currently connected locker.
 * Legacy sessions without a binding are allowed once while connected (then restamped on save).
 */
export function assertLockerBindingForSave(
  book: LockerBinding | null | undefined,
  asNew: boolean,
): void {
  const conn = getLockerConnection()
  if (conn.mode === 'off') throw new Error('locker_not_configured')
  if (asNew) return
  if (!book) return
  const current = lockerBindingFromConnection(conn)
  if (!sameLockerBinding(book, current)) throw new Error('locker_mismatch')
}

/** Attachment sync / reload from locker — must match bound shelf. */
export function assertLockerBindingForRead(book: LockerBinding | null | undefined): void {
  const conn = getLockerConnection()
  if (conn.mode === 'off') throw new Error('locker_not_configured')
  if (!book) return
  const current = lockerBindingFromConnection(conn)
  if (!sameLockerBinding(book, current)) throw new Error('locker_mismatch')
}
