/** Build a temporary fat .kitsas (large Liite.data) for attachment-progress e2e. */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadGoldenDb } from '../src/book/golden'

/** ~8 MiB blob so OPFS attachment persist is observable and countable. */
export const FAT_ATTACHMENT_BYTES = 8 * 1024 * 1024

export async function writeFatTestBook(fileName = 'tilari-fat-e2e.kitsas'): Promise<string> {
  const db = await loadGoldenDb()
  try {
    const fat = new Uint8Array(FAT_ATTACHMENT_BYTES)
    fat[0] = 0x74 // 't'
    fat[1] = 0x65 // 'e'
    fat[2] = 0x73 // 's'
    fat[3] = 0x74 // 't'
    db.run('UPDATE Liite SET data = ? WHERE id = 1', [fat])
    const out = path.join(tmpdir(), fileName)
    writeFileSync(out, db.export())
    return out
  } finally {
    db.close()
  }
}
