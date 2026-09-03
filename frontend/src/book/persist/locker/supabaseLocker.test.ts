import { describe, expect, it } from 'vitest'
import { encodeAttachmentPack } from '../../attPack'
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

describe('Supabase locker round-trip (memory store, no Node)', () => {
  it('puts, lists, gets, 409s on stale etag, and stores per-sha blobs', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    expect(locker.supportsHttpEngine).toBe(false)
    expect(locker.isReady()).toBe(true)

    const bytes = new TextEncoder().encode('lean-kitsas')
    const saved = await locker.put(null, bytes, 'Firma.kitsas')
    expect(saved.id).toMatch(/^[0-9a-f]+$/)
    expect(saved.sha256).toBe(await sha256hex(bytes))
    expect(saved.attachments_sha256).toBeTruthy()

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
      { [sha]: blob },
      saved2.attachments_sha256!,
    )
    expect(att.attachments_sha256).toBe(await sha256hex(encodeAttachmentPack({ [sha]: blob })))
    expect(startsWithMagic(store.files.get(`tilari/${saved.id}/attachments/${sha}`))).toBe(true)

    await expect(
      locker.putAttachmentBlobs!(saved.id, { [sha]: blob }, saved2.attachments_sha256!),
    ).rejects.toThrow('etag_mismatch')

    const fetched = await locker.getAttachmentBlob(saved.id, sha)
    expect([...fetched]).toEqual([1, 2, 3, 4])
    expect(store.files.has(`tilari/${saved.id}/attachments/${sha}`)).toBe(true)

    await locker.remove!(saved.id)
    expect(await locker.list()).toEqual([])
    expect(store.files.has(VAULT_PATH)).toBe(true)
  })

  it('rejects a wrong secret against an existing vault', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(settings, store)
    await locker.put(null, new TextEncoder().encode('lean-kitsas'), 'Firma.kitsas')

    const other = createSupabaseLocker({ ...settings, secret: 'wrong-secret-here' }, store)
    await expect(other.list()).rejects.toThrow('locker_bad_secret')
  })
})
