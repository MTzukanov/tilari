/** Extract BLOBs from Liite into AttachmentStore / reassemble for Kitsas export. */

import { sha256hex } from './attPack'
import type { AttachmentStore } from './blobStore'
import { SqliteDb } from './sqlite'

export async function extractAttachmentsFromDb(
  db: SqliteDb,
  store: AttachmentStore,
): Promise<{ extracted: number; vacuumed: boolean }> {
  const rows = db.all<{ id: number; sha: string | null; data: Uint8Array | null }>(
    'SELECT id, sha, data FROM Liite WHERE data IS NOT NULL',
  )
  let extracted = 0
  for (const row of rows) {
    const raw = row.data
    if (!raw) continue
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
    const sha = row.sha && /^[0-9a-f]{64}$/.test(row.sha) ? row.sha : await sha256hex(data)
    store.put(sha, data)
    db.run('UPDATE Liite SET sha = ?, data = NULL WHERE id = ?', [sha, row.id])
    extracted += 1
  }
  // NULLing BLOBs leaves freelist pages; without VACUUM export() stays huge.
  const vacuumed = extracted > 0 || db.freelistCount() > 0
  if (vacuumed) db.vacuum()
  return { extracted, vacuumed }
}

/**
 * A copy of the book with every attachment's bytes back in Liite.data (a file Kitsas desktop
 * can open). Refuses (`attachments_missing`) when bytes of some attachment are not in this
 * browser yet - e.g. still syncing from the locker - instead of writing empty attachments.
 */
export async function packAttachmentsIntoDb(
  db: SqliteDb,
  store: AttachmentStore,
): Promise<SqliteDb> {
  const copy = await SqliteDb.fromBytes(db.export())
  const rows = copy.all<{ id: number; sha: string | null }>(
    'SELECT id, sha FROM Liite WHERE data IS NULL',
  )
  const missing: number[] = []
  for (const row of rows) {
    const sha = row.sha
    const data = sha ? store.get(sha) : undefined
    if (!data) {
      missing.push(Number(row.id))
      continue
    }
    copy.run('UPDATE Liite SET data = ? WHERE id = ?', [data, row.id])
  }
  if (missing.length) {
    copy.close()
    throw new Error('attachments_missing')
  }
  return copy
}
