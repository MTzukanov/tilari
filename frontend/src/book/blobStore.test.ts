import { describe, expect, it } from 'vitest'
import { AttachmentStore, blobsToWrite, collectBlobKeepSet, unreferencedBlobNames } from './blobStore'

const shaA = 'a'.repeat(64)
const shaB = 'b'.repeat(64)
const shaC = 'c'.repeat(64)

describe('blob keep-set and persist skip', () => {
  it('unions live SHAs with session meta lists', () => {
    const keep = collectBlobKeepSet([shaA, 'not-a-sha'], [{ attachmentShas: [shaB] }, { attachmentShas: [shaA] }, null])
    expect([...keep].sort()).toEqual([shaA, shaB].sort())
  })

  it('lists on-disk blobs that no session still names', () => {
    expect(unreferencedBlobNames([shaA, shaB, shaC, 'readme'], new Set([shaA, shaC]))).toEqual([shaB])
  })

  it('writes only SHAs that are not already on disk', () => {
    expect(blobsToWrite([shaA, shaB], [shaA, shaC])).toEqual([shaC])
    expect(blobsToWrite([shaA], [shaA])).toEqual([])
  })
})

describe('AttachmentStore memory', () => {
  it('loadShas without OPFS leaves the map empty for unknown names', async () => {
    const store = new AttachmentStore()
    await store.loadShas([shaA])
    expect(store.has(shaA)).toBe(false)
    expect(store.opfsNeedsPersist()).toBe(false)
  })

  it('put is a no-op when the SHA is already in memory', () => {
    const store = new AttachmentStore()
    expect(store.put(shaA, new Uint8Array([1]))).toBe(true)
    expect(store.put(shaA, new Uint8Array([2]))).toBe(false)
    expect(store.get(shaA)).toEqual(new Uint8Array([1]))
  })
})
