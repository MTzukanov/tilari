import { describe, expect, it } from 'vitest'
import { attachmentSetEtag } from '../../blobStore'
import { sha256hex } from '../../sha256'
import { MemoryObjectStore } from './objectStore'
import { ObjectStoreLockerBackend } from './objectStoreLocker'
import { createSupabaseLocker, parseSupabaseSettings } from './supabaseLocker'
import { parseStoragePath, objectKeyPrefix } from './storagePath'
import { openEncryptedStore, VAULT_PATH } from './vaultCrypto'

function jwt(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ role }))
  return `${header}.${payload}.sig`
}

const settings = {
  url: 'https://example.supabase.co',
  anonKey: jwt('anon'),
  bucket: 'tilari',
  path: 'tilari',
  secret: 'test-secret-please',
  encrypt: true,
}

function startsWithMagic(data: Uint8Array | undefined): boolean {
  if (!data || data.byteLength < 8) return false
  const magic = new TextEncoder().encode('TILARIE1')
  return magic.every((b, i) => data[i] === b)
}

describe('parseStoragePath', () => {
  it('splits bucket and key prefix', () => {
    expect(parseStoragePath('tilari')).toEqual({
      bucket: 'tilari',
      keyPrefix: '',
      storagePath: 'tilari',
    })
    expect(parseStoragePath('tilari/book1')).toEqual({
      bucket: 'tilari',
      keyPrefix: 'book1/',
      storagePath: 'tilari/book1',
    })
    expect(objectKeyPrefix(parseStoragePath('tilari/book1'), 'supabase')).toBe('book1/')
    expect(objectKeyPrefix(parseStoragePath('tilari/book1'), 'http')).toBe('tilari/book1/')
  })
})

describe('parseSupabaseSettings', () => {
  it('rejects service_role keys', () => {
    expect(() =>
      parseSupabaseSettings({ url: settings.url, anonKey: jwt('service_role'), secret: settings.secret }),
    ).toThrow('locker_service_role')
  })

  it('requires https URL, anon key, and secret when encrypting', () => {
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

  it('allows encrypt false without secret', () => {
    const s = parseSupabaseSettings({
      url: settings.url,
      anonKey: jwt('anon'),
      encrypt: false,
      path: 'tilari/book1',
    })
    expect(s.encrypt).toBe(false)
    expect(s.path).toBe('tilari/book1')
  })
})

describe('ObjectStoreLockerBackend shared pool', () => {
  it('puts, lists, gets, and stores blobs under prefix/blobs/{sha}', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)

    const bytes = new TextEncoder().encode('lean-kitsas')
    const saved = await locker.put(null, bytes, 'Firma.kitsas')
    expect(saved.id).toMatch(/^[0-9a-f]+$/)
    expect(saved.sha256).toBe(await sha256hex(bytes))
    expect(saved.attachments_sha256).toBe(await attachmentSetEtag([]))

    const listed = await locker.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Firma.kitsas')
    expect(store.files.has(`${saved.id}/book.kitsas`)).toBe(true)
    expect(store.files.has(`${saved.id}/meta.json`)).toBe(true)
    expect(store.files.has(VAULT_PATH)).toBe(true)
    expect(startsWithMagic(store.files.get(`${saved.id}/book.kitsas`))).toBe(true)

    const blob = new Uint8Array([1, 2, 3, 4])
    const sha = await sha256hex(blob)
    const att = await locker.putAttachmentBlobs!(
      saved.id,
      [sha],
      { [sha]: blob },
      saved.attachments_sha256!,
    )
    expect(att.attachments_sha256).toBe(await attachmentSetEtag([sha]))
    expect(startsWithMagic(store.files.get(`blobs/${sha}`))).toBe(true)

    const fetched = await locker.getAttachmentBlob(saved.id, sha)
    expect([...fetched]).toEqual([1, 2, 3, 4])

    await locker.remove!(saved.id)
    expect(await locker.list()).toEqual([])
    expect(store.files.has(VAULT_PATH)).toBe(true)
    expect(store.files.has(`blobs/${sha}`)).toBe(false)
  })

  it('isolates attachment pools by path prefix', async () => {
    const store = new MemoryObjectStore()
    const a = new ObjectStoreLockerBackend(
      await openEncryptedStore(store, settings.secret!, 'book1/'),
      'book1/',
    )
    const b = new ObjectStoreLockerBackend(
      await openEncryptedStore(store, settings.secret!, 'book2/'),
      'book2/',
    )
    const blob = new Uint8Array([9])
    const sha = await sha256hex(blob)
    const savedA = await a.put(null, new TextEncoder().encode('a'), 'A.kitsas')
    await a.putAttachmentBlobs!(savedA.id, [sha], { [sha]: blob }, savedA.attachments_sha256!)
    expect(store.files.has(`book1/blobs/${sha}`)).toBe(true)
    expect(store.files.has(`book2/blobs/${sha}`)).toBe(false)

    const savedB = await b.put(null, new TextEncoder().encode('b'), 'B.kitsas')
    await expect(
      b.putAttachmentBlobs!(savedB.id, [sha], {}, savedB.attachments_sha256!),
    ).rejects.toThrow('attachment_missing')
  })

  it('reuses shared blobs across books in the same prefix', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker({ ...settings, encrypt: false }, store)
    const blob = new Uint8Array([9, 8, 7])
    const sha = await sha256hex(blob)

    const first = await locker.put(null, new TextEncoder().encode('a'), 'A.kitsas')
    await locker.putAttachmentBlobs!(first.id, [sha], { [sha]: blob }, first.attachments_sha256!)
    const path = `blobs/${sha}`
    expect(store.files.has(path)).toBe(true)

    const second = await locker.put(null, new TextEncoder().encode('b'), 'B.kitsas')
    await locker.putAttachmentBlobs!(second.id, [sha], {}, second.attachments_sha256!)
    expect(store.files.has(path)).toBe(true)

    await locker.remove!(first.id)
    expect(store.files.has(path)).toBe(true)
    await locker.remove!(second.id)
    expect(store.files.has(path)).toBe(false)
  })

  it('lists the blob pool instead of failing when many shared blobs are reused', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker({ ...settings, encrypt: false }, store)
    const blobs: Record<string, Uint8Array> = {}
    const shas: string[] = []
    for (let i = 0; i < 20; i++) {
      const blob = new Uint8Array([i, i + 1, i + 2])
      const sha = await sha256hex(blob)
      blobs[sha] = blob
      shas.push(sha)
    }
    const first = await locker.put(null, new TextEncoder().encode('a'), 'A.kitsas')
    const stages: string[] = []
    await locker.putAttachmentBlobs!(first.id, shas, blobs, first.attachments_sha256!, {
      onStage: (stage) => stages.push(stage),
    })
    expect(stages).toContain('attachments_check')
    expect(stages).toContain('attachments')

    const second = await locker.put(null, new TextEncoder().encode('b'), 'B.kitsas')
    await locker.putAttachmentBlobs!(second.id, shas, {}, second.attachments_sha256!)
    for (const sha of shas) {
      expect(store.files.has(`blobs/${sha}`)).toBe(true)
    }
  })

  it('aborts putAttachmentBlobs when the signal is aborted', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker({ ...settings, encrypt: false }, store)
    const first = await locker.put(null, new TextEncoder().encode('a'), 'A.kitsas')
    const blob = new Uint8Array([1, 2, 3])
    const sha = await sha256hex(blob)
    const ac = new AbortController()
    ac.abort()
    await expect(
      locker.putAttachmentBlobs!(first.id, [sha], { [sha]: blob }, first.attachments_sha256!, {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('skips books with malformed attachment_shas during GC', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker({ ...settings, encrypt: false }, store)
    const keepBlob = new Uint8Array([9, 9, 9])
    const keepSha = await sha256hex(keepBlob)
    const staleBlob = new Uint8Array([8, 8, 8])
    const staleSha = await sha256hex(staleBlob)
    store.files.set(`blobs/${staleSha}`, staleBlob)

    const good = await locker.put(null, new TextEncoder().encode('good'), 'Good.kitsas')
    await locker.putAttachmentBlobs!(good.id, [keepSha], { [keepSha]: keepBlob }, good.attachments_sha256!)

    const bad = await locker.put(null, new TextEncoder().encode('bad'), 'Bad.kitsas')
    const badMeta = JSON.parse(new TextDecoder().decode(store.files.get(`${bad.id}/meta.json`)!)) as Record<
      string,
      unknown
    >
    badMeta.attachment_shas = 'not-an-array'
    store.files.set(`${bad.id}/meta.json`, new TextEncoder().encode(JSON.stringify(badMeta)))

    const removed = await locker.gcUnusedBlobs!()
    expect(removed).toBe(1)
    expect(store.files.has(`blobs/${staleSha}`)).toBe(false)
    expect(store.files.has(`blobs/${keepSha}`)).toBe(true)
  })

  it('removes a book created for as-new after cancel revert', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker({ ...settings, encrypt: false }, store)
    const saved = await locker.put(null, new TextEncoder().encode('lean'), 'Temp.kitsas')
    expect(await locker.list()).toHaveLength(1)
    await locker.remove!(saved.id)
    expect(await locker.list()).toEqual([])
    expect(store.files.has(`${saved.id}/book.kitsas`)).toBe(false)
    expect(store.files.has(`${saved.id}/meta.json`)).toBe(false)
  })

  it('rejects a wrong secret against an existing vault', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    await locker.put(null, new TextEncoder().encode('lean-kitsas'), 'Firma.kitsas')

    const other = createSupabaseLocker({ ...settings, secret: 'wrong-secret-here' }, store)
    await expect(other.list()).rejects.toThrow('locker_bad_secret')
  })
})
