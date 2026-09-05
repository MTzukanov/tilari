import { describe, expect, it } from 'vitest'
import { attachmentSetEtag } from '../../blobStore'
import { sha256hex } from '../../sha256'
import { MemoryObjectStore } from './objectStore'
import { createSupabaseLocker, parseSupabaseSettings } from './supabaseLocker'
import { MAGIC, VAULT_PATH } from './vaultCrypto'

function jwt(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ role }))
  return `${header}.${payload}.sig`
}

const settings = {
  url: 'https://example.supabase.co',
  anonKey: jwt('anon'),
  bucket: 'tilari',
  secret: 'test-secret-please',
}

function startsWithMagic(data: Uint8Array | undefined): boolean {
  if (!data || data.byteLength < MAGIC.length) return false
  return MAGIC.every((b, i) => data[i] === b)
}

describe('parseSupabaseSettings', () => {
  it('rejects service_role keys', () => {
    expect(() =>
      parseSupabaseSettings({ url: settings.url, anonKey: jwt('service_role'), secret: settings.secret }),
    ).toThrow('locker_service_role')
  })

  it('requires https URL, anon key, and secret', () => {
    expect(() =>
      parseSupabaseSettings({ url: 'http://x', anonKey: jwt('anon'), secret: settings.secret }),
    ).toThrow('locker_url')
    expect(() => parseSupabaseSettings({ url: settings.url, anonKey: '', secret: settings.secret })).toThrow(
      'locker_settings',
    )
    expect(() => parseSupabaseSettings({ url: settings.url, anonKey: jwt('anon'), secret: 'short' })).toThrow(
      'locker_secret',
    )
  })
})

describe('Supabase locker shared blob pool', () => {
  it('puts, lists, gets, and stores blobs under tilari/blobs/{sha}', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    expect(locker.supportsHttpEngine).toBe(false)
    expect(locker.isReady()).toBe(true)

    const bytes = new TextEncoder().encode('lean-kitsas')
    const saved = await locker.put(null, bytes, 'Firma.kitsas')
    expect(saved.id).toMatch(/^[0-9a-f]+$/)
    expect(saved.sha256).toBe(await sha256hex(bytes))
    expect(saved.attachments_sha256).toBe(await attachmentSetEtag([]))

    const listed = await locker.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Firma.kitsas')
    expect(listed[0].sha256).toBe(saved.sha256)
    expect(store.files.has(`tilari/${saved.id}/book.kitsas`)).toBe(true)
    expect(store.files.has(`tilari/${saved.id}/meta.json`)).toBe(true)
    expect(store.files.has(VAULT_PATH)).toBe(true)
    expect(startsWithMagic(store.files.get(`tilari/${saved.id}/book.kitsas`))).toBe(true)
    expect(startsWithMagic(store.files.get(`tilari/${saved.id}/meta.json`))).toBe(true)
    const vaultJson = new TextDecoder().decode(store.files.get(VAULT_PATH))
    expect(vaultJson).toContain('"kdf":"PBKDF2"')
    expect(vaultJson).not.toContain(settings.secret)

    const got = await locker.get(saved.id)
    expect([...got.bytes]).toEqual([...bytes])
    expect(got.etag).toBe(saved.sha256)
    expect(got.name).toBe('Firma.kitsas')

    const updated = new TextEncoder().encode('lean-kitsas-v2')
    await expect(locker.put(saved.id, updated, 'Firma.kitsas', 'deadbeef')).rejects.toThrow(
      'etag_mismatch',
    )

    const saved2 = await locker.put(saved.id, updated, 'Firma.kitsas', saved.sha256)
    expect(saved2.sha256).toBe(await sha256hex(updated))

    const blob = new Uint8Array([1, 2, 3, 4])
    const sha = await sha256hex(blob)
    const att = await locker.putAttachmentBlobs!(
      saved.id,
      [sha],
      { [sha]: blob },
      saved2.attachments_sha256!,
    )
    expect(att.attachments_sha256).toBe(await attachmentSetEtag([sha]))
    expect(startsWithMagic(store.files.get(`tilari/blobs/${sha}`))).toBe(true)
    expect(store.files.has(`tilari/${saved.id}/attachments/${sha}`)).toBe(false)

    await expect(
      locker.putAttachmentBlobs!(saved.id, [sha], { [sha]: blob }, saved2.attachments_sha256!),
    ).rejects.toThrow('etag_mismatch')

    const fetched = await locker.getAttachmentBlob(saved.id, sha)
    expect([...fetched]).toEqual([1, 2, 3, 4])

    await locker.remove!(saved.id)
    expect(await locker.list()).toEqual([])
    expect(store.files.has(VAULT_PATH)).toBe(true)
    // GC after remove drops the unreferenced shared blob.
    expect(store.files.has(`tilari/blobs/${sha}`)).toBe(false)
  })

  it('reuses shared blobs across books and skips re-upload', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    const blob = new Uint8Array([9, 8, 7])
    const sha = await sha256hex(blob)

    const a = await locker.put(null, new TextEncoder().encode('a'), 'A.kitsas')
    await locker.putAttachmentBlobs!(a.id, [sha], { [sha]: blob }, a.attachments_sha256!)
    const path = `tilari/blobs/${sha}`
    expect(store.files.has(path)).toBe(true)
    const firstCipher = store.files.get(path)!

    const b = await locker.put(null, new TextEncoder().encode('b'), 'B.kitsas')
    // Second book: no local bytes — remote exists.
    const att = await locker.putAttachmentBlobs!(b.id, [sha], {}, b.attachments_sha256!)
    expect(att.attachments_sha256).toBe(await attachmentSetEtag([sha]))
    expect(store.files.get(path)).toBe(firstCipher)

    await locker.remove!(a.id)
    expect(store.files.has(path)).toBe(true)
    await locker.remove!(b.id)
    expect(store.files.has(path)).toBe(false)
  })

  it('list ignores the shared blobs directory', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    const saved = await locker.put(null, new TextEncoder().encode('x'), 'X.kitsas')
    store.files.set('tilari/blobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', new Uint8Array([1]))
    const listed = await locker.list()
    expect(listed.map((b) => b.id)).toEqual([saved.id])
  })

  it('reports overall upload progress across blobs', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    const saved = await locker.put(null, new TextEncoder().encode('x'), 'X.kitsas')
    const a = new Uint8Array(100)
    const b = new Uint8Array(50)
    const shaA = await sha256hex(a)
    const shaB = await sha256hex(b)
    const progress: { loaded: number; total: number | null }[] = []
    const stages: string[] = []
    await locker.putAttachmentBlobs!(
      saved.id,
      [shaA, shaB],
      { [shaA]: a, [shaB]: b },
      saved.attachments_sha256!,
      {
        onStage: (s) => stages.push(s),
        onProgress: (p) => progress.push({ loaded: p.loaded, total: p.total }),
      },
    )
    expect(stages[0]).toBe('attachments')
    expect(progress.some((p) => p.total === 150)).toBe(true)
    expect(progress.at(-1)).toEqual({ loaded: 150, total: 150 })
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!.loaded).toBeGreaterThanOrEqual(progress[i - 1]!.loaded)
    }
  })

  it('gc aborts when any meta lacks attachment_shas', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    const saved = await locker.put(null, new TextEncoder().encode('x'), 'X.kitsas')
    const blob = new Uint8Array([1])
    const sha = await sha256hex(blob)
    await locker.putAttachmentBlobs!(saved.id, [sha], { [sha]: blob }, saved.attachments_sha256!)

    // Strip attachment_shas from encrypted meta by rewriting via openEncryptedStore path:
    // download decrypts; re-upload without the field.
    const { openEncryptedStore } = await import('./vaultCrypto')
    const enc = await openEncryptedStore(store, settings.secret)
    const metaBytes = await enc.download(`tilari/${saved.id}/meta.json`)
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as Record<string, unknown>
    delete meta.attachment_shas
    await enc.upload(`tilari/${saved.id}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)), {
      upsert: true,
    })

    const removed = await locker.gcUnusedBlobs!()
    expect(removed).toBe(0)
    expect(store.files.has(`tilari/blobs/${sha}`)).toBe(true)
  })

  it('rejects a wrong secret against an existing vault', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    await locker.put(null, new TextEncoder().encode('lean-kitsas'), 'Firma.kitsas')

    const other = createSupabaseLocker({ ...settings, secret: 'wrong-secret-here' }, store)
    await expect(other.list()).rejects.toThrow('locker_bad_secret')
  })
})
