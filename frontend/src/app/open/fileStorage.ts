import { isLockerPath } from './lockerBooks'
import type { EngineKind } from '../../book/service'

/** Where the user-facing “original” lives — not where ledger math runs. */
export type FileStorageKind = 'locker' | 'disk' | 'browser' | 'session'

export function fileStorageKind(
  dbPath: string | null | undefined,
  writableLinked: boolean,
  engine?: EngineKind | null,
): FileStorageKind {
  if (isLockerPath(dbPath)) return 'locker'
  if (writableLinked) return 'disk'
  if (engine === 'http') return 'session'
  return 'browser'
}

export function canPrimarySave(
  _kind: FileStorageKind,
  _engine: EngineKind,
  dirty: boolean,
): boolean {
  return dirty
}
