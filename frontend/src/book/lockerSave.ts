/** What locker PUTs a save should send. */

import { lockerIdFromPath } from '../app/open/lockerBooks'

export function lockerUploadPlan(
  dirty: boolean,
  attachmentsDirty: boolean,
  lockerId?: string,
): { skip: boolean; needLedger: boolean; needAttachments: boolean } {
  const creating = !lockerId
  return {
    skip: !dirty && !attachmentsDirty && !creating,
    needLedger: dirty || creating,
    needAttachments: attachmentsDirty || creating,
  }
}

/**
 * Id to pass to locker.put. Primary save (`asNew: false`) must never mint a new id —
 * recover from `locker:{id}` when in-memory lockerId was lost (e.g. http session restore).
 */
export function resolveLockerPutId(
  asNew: boolean,
  lockerId: string | null | undefined,
  dbPath?: string | null,
): string | null {
  if (asNew) return null
  const fromMem = lockerId?.trim() || null
  if (fromMem) return fromMem
  const fromPath = lockerIdFromPath(dbPath)
  if (fromPath) return fromPath
  throw new Error('locker_id_missing')
}
