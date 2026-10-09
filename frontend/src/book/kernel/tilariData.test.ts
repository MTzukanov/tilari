import { describe, expect, it } from 'vitest'
import { extractAttachmentsFromDb, packAttachmentsIntoDb } from '../attachments'
import { AttachmentStore } from '../blobStore'
import { loadGoldenDb } from '../golden'
import { Ledger } from '../ledger'
import { SqliteDb } from '../sqlite'
import {
  hasTilariData,
  readTilariData,
  readTilariDataPrefix,
  TILARI_DATA_TABLE,
  writeTilariData,
} from './tilariData'

function totalChanges(db: SqliteDb): number {
  return Number(db.get<{ c: number }>('SELECT total_changes() AS c')?.c ?? 0)
}

describe('TilariData table', () => {
  it('reads as empty until the first write creates the table', async () => {
    const db = await loadGoldenDb()
    expect(hasTilariData(db)).toBe(false)
    expect(readTilariData(db, 'property/4')).toBeNull()
    expect(readTilariDataPrefix(db, 'property/')).toEqual([])
    expect(writeTilariData(db, 'property/4', '{"v":1}', '2026-01-01T00:00:00Z')).toBe(true)
    expect(hasTilariData(db)).toBe(true)
    expect(readTilariData(db, 'property/4')).toBe('{"v":1}')
    expect(
      db.get<{ updated: string }>(`SELECT updated FROM ${TILARI_DATA_TABLE} WHERE key = ?`, ['property/4'])
        ?.updated,
    ).toBe('2026-01-01T00:00:00Z')
  })

  it('upserts, deletes, and writes nothing for an unchanged value', async () => {
    const db = await loadGoldenDb()
    writeTilariData(db, 'property/4', '{"v":1}')
    const before = totalChanges(db)
    expect(writeTilariData(db, 'property/4', '{"v":1}')).toBe(false)
    expect(totalChanges(db)).toBe(before)
    expect(writeTilariData(db, 'property/4', '{"v":1,"note":"x"}')).toBe(true)
    expect(readTilariData(db, 'property/4')).toBe('{"v":1,"note":"x"}')
    expect(writeTilariData(db, 'property/4', null)).toBe(true)
    expect(writeTilariData(db, 'property/4', null)).toBe(false)
    expect(readTilariData(db, 'property/4')).toBeNull()
  })

  it('lists by prefix and treats LIKE wildcards literally', async () => {
    const db = await loadGoldenDb()
    writeTilariData(db, 'property/1', 'a')
    writeTilariData(db, 'property/12', 'b')
    writeTilariData(db, 'portfolio', 'c')
    writeTilariData(db, 'prop_x', 'd')
    expect(readTilariDataPrefix(db, 'property/').map((r) => r.key)).toEqual(['property/1', 'property/12'])
    expect(readTilariDataPrefix(db, 'prop_').map((r) => r.key)).toEqual(['prop_x'])
  })

  it('survives the lean working copy, the Kitsas export and a Ledger reopen', async () => {
    const db = await loadGoldenDb()
    writeTilariData(db, 'property/4', '{"v":1}')
    const store = new AttachmentStore()
    await extractAttachmentsFromDb(db, store)
    expect(readTilariData(db, 'property/4')).toBe('{"v":1}')
    const packed = await packAttachmentsIntoDb(db, store)
    expect(readTilariData(packed, 'property/4')).toBe('{"v":1}')

    const ledger = new Ledger()
    await ledger.openBytes(packed.export(), { sourceName: 'copy.kitsas', dbPath: 'copy.kitsas' })
    const reopened = await SqliteDb.fromBytes(ledger.exportBytes())
    expect(readTilariData(reopened, 'property/4')).toBe('{"v":1}')
  })
})
