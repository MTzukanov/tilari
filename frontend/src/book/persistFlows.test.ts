import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGoldenDb } from './golden'
import { MemoryObjectStore } from './persist/locker/objectStore'
import { ObjectStoreLockerBackend } from './persist/locker/objectStoreLocker'
import { resetLockerProbeForTests, saveHttpLockerSettings, setLockerForTests } from './persist/locker/active'
import { sha256hexSync } from './sha256'
import { WasmBookService } from './wasmService'

vi.mock('./download', () => ({ downloadBytes: vi.fn() }))

const opfsWrites = vi.hoisted(() => ({
  before: null as (() => Promise<void>) | null,
  dirtyFlags: [] as boolean[],
}))

vi.mock('./opfs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs')>()),
  opfsSaveWorking: async (meta: { dirty: boolean }) => {
    opfsWrites.dirtyFlags.push(meta.dirty)
    await opfsWrites.before?.()
  },
}))

/** Working-copy writes wait until the returned function is called. */
function holdWorkingCopyWrites(): () => void {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  opfsWrites.dirtyFlags.length = 0
  opfsWrites.before = () => gate
  return release
}

/** The status history, read as the UI reads it on each change. */
function watchStatus(svc: WasmBookService): boolean[] {
  const seen: boolean[] = []
  svc.onDirtyChange(() => seen.push(svc.isDirty()))
  return seen
}

async function expectSavedOnlyAfterWrite(svc: WasmBookService, save: () => Promise<unknown>) {
  const seen = watchStatus(svc)
  const release = holdWorkingCopyWrites()
  const saving = save()
  await vi.waitFor(() => expect(opfsWrites.dirtyFlags).toContain(false))
  expect(svc.isDirty()).toBe(true)
  expect(seen).not.toContain(false)
  release()
  await saving
  expect(svc.isDirty()).toBe(false)
  expect(seen.at(-1)).toBe(false)
}

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
    opfsWrites.before = null
    opfsWrites.dirtyFlags.length = 0
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
    expect(svc.isDirty()).toBe(true)
  })

  it('the status turns clean only after the working copy records the save', async () => {
    const created = await locker.put(null, (await loadGoldenDb()).export(), 'firma.kitsas')
    const svc = new WasmBookService()
    await svc.openLockerBook(created.id)
    await svc.saveVoucher({ json: { info: 'muutos' } }, 2)
    await svc.flushPersistNow()
    await expectSavedOnlyAfterWrite(svc, () => svc.saveToLocker())
  })
})

describe('browser save status (disk)', () => {
  const linkedFile = () =>
    ({
      getFile: async () => new File([], 'firma.kitsas', { lastModified: 0 }),
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      queryPermission: async () => 'granted',
    }) as unknown as FileSystemFileHandle

  async function editedBook(handle: FileSystemFileHandle | null) {
    const svc = new WasmBookService()
    const bytes = (await loadGoldenDb()).export() as BlobPart
    await svc.openKitsasFile(new File([bytes], 'firma.kitsas', { lastModified: 0 }), handle)
    await svc.saveVoucher({ json: { info: 'muutos' } }, 2)
    await svc.flushPersistNow()
    return svc
  }

  afterEach(() => {
    opfsWrites.before = null
    opfsWrites.dirtyFlags.length = 0
  })

  it('a save to the linked file turns clean only after the working copy records it', async () => {
    const svc = await editedBook(linkedFile())
    await expectSavedOnlyAfterWrite(svc, () => svc.saveLocal())
  })

  it('a download that saves the book turns clean only after the working copy records it', async () => {
    const svc = await editedBook(null)
    await expectSavedOnlyAfterWrite(svc, () => svc.downloadCopy(() => 'firma.kitsas'))
  })

  it('an edit made while the save finishes stays unsaved', async () => {
    const svc = await editedBook(linkedFile())
    const release = holdWorkingCopyWrites()
    const saving = svc.saveLocal()
    await vi.waitFor(() => expect(opfsWrites.dirtyFlags).toContain(false))
    await svc.saveVoucher({ json: { info: 'toinen muutos' } }, 2)
    release()
    await saving
    expect(svc.isDirty()).toBe(true)
    await svc.flushPersistNow()
  })

  it('a failed working-copy write does not keep a saved file unsaved', async () => {
    const svc = await editedBook(linkedFile())
    opfsWrites.before = () => Promise.reject(new Error('quota'))
    await expect(svc.saveLocal()).rejects.toThrow('quota')
    expect(svc.isDirty()).toBe(false)
  })
})
