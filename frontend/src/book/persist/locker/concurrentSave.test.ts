import { describe, expect, it } from 'vitest'
import { MemoryObjectStore } from './objectStore'
import { BLOB_GC_GRACE_MS, ObjectStoreLockerBackend } from './objectStoreLocker'

const enc = (s: string) => new TextEncoder().encode(s)

describe('object store locker: concurrent saves and GC', () => {
  it('two tabs saving the same version at once: exactly one wins', async () => {
    const shared = new MemoryObjectStore()
    const created = await new ObjectStoreLockerBackend(shared, 'tilari').put(null, enc('v1'), 'firma.kitsas')
    const tabA = new ObjectStoreLockerBackend(new MemoryObjectStore(shared), 'tilari')
    const tabB = new ObjectStoreLockerBackend(new MemoryObjectStore(shared), 'tilari')
    const a = await tabA.get(created.id)
    const b = await tabB.get(created.id)
    // Both pass the meta check before either writes; the ledger write is the atomic step.
    const results = await Promise.allSettled([
      tabA.put(created.id, enc('from A'), 'firma.kitsas', a.etag),
      tabB.put(created.id, enc('from B'), 'firma.kitsas', b.etag),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(String(rejected.reason)).toContain('etag_mismatch')
  })

  it('GC spares fresh unreferenced blobs (a save in progress) and removes old ones', async () => {
    const store = new MemoryObjectStore()
    const locker = new ObjectStoreLockerBackend(store, 'tilari')
    store.files.set('tilari/blobs/' + 'a'.repeat(64), enc('fresh'))
    store.times.set('tilari/blobs/' + 'a'.repeat(64), new Date().toISOString())
    store.files.set('tilari/blobs/' + 'b'.repeat(64), enc('old'))
    store.times.set('tilari/blobs/' + 'b'.repeat(64), new Date(Date.now() - BLOB_GC_GRACE_MS - 1000).toISOString())
    expect(await locker.gcUnusedBlobs()).toBe(1)
    expect(store.files.has('tilari/blobs/' + 'a'.repeat(64))).toBe(true)
    expect(store.files.has('tilari/blobs/' + 'b'.repeat(64))).toBe(false)
  })
})
