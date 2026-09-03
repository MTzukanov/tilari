import { describe, expect, it } from 'vitest'
import { decodeAttachmentPack, encodeAttachmentPack, sha256hex } from './attPack'
import { sha256hexSync } from './sha256'
import { extractAttachmentsFromDb, packAttachmentsIntoDb } from './attachments'
import { AttachmentStore } from './blobStore'
import { loadGoldenDb } from './golden'
import { lockerUploadPlan } from './lockerSave'
import { attachAttachment } from './posting'
import { getAttachment, getAttachmentMeta } from './vouchers'

describe('TILARIAT pack', () => {
  it('software SHA-256 matches FIPS vectors and Web Crypto', async () => {
    expect(sha256hexSync(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256hexSync(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const blob = new Uint8Array([1, 2, 3])
    expect(sha256hexSync(blob)).toBe(await sha256hex(blob))
  })

  it('round-trips empty and multi-blob packs in sorted sha order', async () => {
    const empty = encodeAttachmentPack(new Map())
    expect(new TextDecoder().decode(empty.subarray(0, 8))).toBe('TILARIAT')
    expect(empty.byteLength).toBe(16)
    expect(decodeAttachmentPack(empty).size).toBe(0)

    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([9, 9])
    const shaA = await sha256hex(a)
    const shaB = await sha256hex(b)
    const pack = encodeAttachmentPack(
      new Map([
        [shaB, b],
        [shaA, a],
      ]),
    )
    const decoded = decodeAttachmentPack(pack)
    expect([...decoded.keys()]).toEqual([shaA, shaB].sort())
    expect([...decoded.get(shaA)!]).toEqual([1, 2, 3])
    expect([...decoded.get(shaB)!]).toEqual([9, 9])
  })
})

describe('lean extract / pack', () => {
  it('moves Liite.data into the store and reassembles a classic file', async () => {
    const db = await loadGoldenDb()
    try {
      const before = getAttachment(db, 1)
      expect(before?.name).toBe('kuitti.txt')
      expect(new TextDecoder().decode(before?.data)).toBe('test-liite\n')

      const store = new AttachmentStore()
      const n = await extractAttachmentsFromDb(db, store)
      expect(n.extracted).toBeGreaterThan(0)
      expect(n.vacuumed).toBe(true)
      expect(getAttachment(db, 1)).toBeNull()
      const meta = getAttachmentMeta(db, 1)
      expect(meta?.sha).toHaveLength(64)
      expect(store.has(meta!.sha)).toBe(true)

      const packed = await packAttachmentsIntoDb(db, store)
      try {
        const restored = getAttachment(packed, 1)
        expect(new TextDecoder().decode(restored?.data)).toBe('test-liite\n')
      } finally {
        packed.close()
      }
    } finally {
      db.close()
    }
  })

  it('vacuums so NULLed BLOBs no longer inflate export size', async () => {
    const db = await loadGoldenDb()
    try {
      const fat = new Uint8Array(400_000)
      fat.set(new TextEncoder().encode('test-liite\n'))
      db.run('UPDATE Liite SET data = ? WHERE id = 1', [fat])
      const beforeSize = db.export().byteLength
      const store = new AttachmentStore()
      const n = await extractAttachmentsFromDb(db, store)
      expect(n.extracted).toBe(1)
      expect(db.export().byteLength).toBeLessThan(beforeSize / 2)
    } finally {
      db.close()
    }
  })

  it('writes lean Liite rows without BLOBs', async () => {
    const db = await loadGoldenDb()
    try {
      const data = new Uint8Array([10, 20, 30])
      const attached = await attachAttachment(db, 1, {
        name: 'x.bin',
        type: 'application/octet-stream',
        data,
        lean: true,
      })
      expect(attached.sha).toHaveLength(64)
      expect(getAttachment(db, attached.id)).toBeNull()
      expect(getAttachmentMeta(db, attached.id)?.sha).toBe(attached.sha)
    } finally {
      db.close()
    }
  })
})

describe('lockerUploadPlan', () => {
  it('uploads lean only when attachments are unchanged', () => {
    expect(lockerUploadPlan(true, false, 'abc')).toEqual({
      skip: false,
      needLedger: true,
      needAttachments: false,
    })
  })

  it('uploads attachments without rewriting the ledger when only blobs changed', () => {
    expect(lockerUploadPlan(false, true, 'abc')).toEqual({
      skip: false,
      needLedger: false,
      needAttachments: true,
    })
  })

  it('skips when nothing is dirty and the book already lives in the locker', () => {
    expect(lockerUploadPlan(false, false, 'abc').skip).toBe(true)
  })

  it('sends both packs on first locker create', () => {
    expect(lockerUploadPlan(false, false, undefined)).toEqual({
      skip: false,
      needLedger: true,
      needAttachments: true,
    })
  })
})
