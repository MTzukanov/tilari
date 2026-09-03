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

export async function packAttachmentsIntoDb(
  db: SqliteDb,
  store: AttachmentStore,
): Promise<SqliteDb> {
  const copy = await SqliteDb.fromBytes(db.export())
  const rows = copy.all<{ id: number; sha: string | null }>('SELECT id, sha FROM Liite')
  for (const row of rows) {
    const sha = row.sha
    if (!sha) continue
    const data = store.get(sha)
    if (!data) continue
    copy.run('UPDATE Liite SET data = ? WHERE id = ?', [data, row.id])
  }
  return copy
}
