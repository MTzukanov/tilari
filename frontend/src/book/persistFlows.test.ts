import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGoldenDb } from './golden'
import { MemoryObjectStore } from './persist/locker/objectStore'
import { ObjectStoreLockerBackend } from './persist/locker/objectStoreLocker'
import { resetLockerProbeForTests, saveHttpLockerSettings, setLockerForTests } from './persist/locker/active'
import { sha256hexSync } from './sha256'
import { WasmBookService } from './wasmService'

vi.mock('./download', () => ({ downloadBytes: vi.fn() }))

/** A golden book whose Liite row carries its bytes inline (as Kitsas or the HTTP engine wrote). */
async function bookWithInlineAttachment() {
  const db = await loadGoldenDb()
  const data = new TextEncoder().encode('<html>alv</html>')
  db.run(
    `INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (1, 'alv.html', 'alv', 'text/html', ?, ?)`,
    [sha256hexSync(data), data],
  )
  return { bytes: db.export(), sha: sha256hexSync(data) }
}

describe('browser save flows (locker)', () => {
  let store: MemoryObjectStore
  let locker: ObjectStoreLockerBackend

  beforeEach(() => {
    store = new MemoryObjectStore()
    locker = new ObjectStoreLockerBackend(store, 'tilari', { id: 'http', supportsHttpEngine: false })
    saveHttpLockerSettings({ url: 'http://127.0.0.1:9', path: 'tilari', encrypt: false }, false)
    setLockerForTests(locker)
  })

  afterEach(() => {
    setLockerForTests(null)
    resetLockerProbeForTests()
  })

  it('attachments stored inside the shelf ledger are uploaded on the next save', async () => {
    const { bytes, sha } = await bookWithInlineAttachment()
    const created = await locker.put(null, bytes, 'firma.kitsas')
    const svc = new WasmBookService()
    await svc.openLockerBook(created.id)
    // Extracted into this browser only: the book must be saved again.
    expect(svc.isDirty()).toBe(true)
    await svc.saveToLocker()
    expect(store.files.has(`tilari/blobs/${sha}`)).toBe(true)
    const meta = JSON.parse(new TextDecoder().decode(store.files.get(`tilari/${created.id}/meta.json`)))
    expect(meta.attachment_shas).toContain(sha)
    expect(svc.isDirty()).toBe(false)
  })

  it('downloading a copy does not mark a locker book as saved', async () => {
    const created = await locker.put(null, (await loadGoldenDb()).export(), 'firma.kitsas')
    const svc = new WasmBookService()
    await svc.openLockerBook(created.id)
    await svc.saveVoucher({ json: { info: 'muutos' } }, 2)
    expect(svc.isDirty()).toBe(true)
    await svc.downloadCopy(() => 'kopio.kitsas')
    expect(svc.isDirty()).toBe(true)
    await svc.saveToLocker()
    expect(svc.isDirty()).toBe(false)
  })

  it('a save without an ETag does not overwrite a newer shelf version', async () => {
    const created = await locker.put(null, (await loadGoldenDb()).export(), 'firma.kitsas')
    const svc = new WasmBookService()
    await svc.openLockerBook(created.id)
    await svc.saveVoucher({ json: { info: 'muutos' } }, 2)
    // Someone else saved meanwhile, and this session lost its ETag (old OPFS session).
    const other = new ObjectStoreLockerBackend(new MemoryObjectStore(store), 'tilari')
    const got = await other.get(created.id)
    await new Promise((r) => setTimeout(r, 5))
    await other.put(created.id, got.bytes, 'firma.kitsas', got.etag)
    ;(svc as unknown as { etag: string | undefined }).etag = undefined
    await expect(svc.saveToLocker()).rejects.toThrow('etag_mismatch')
  })
})
