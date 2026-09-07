import { afterEach, describe, expect, it } from 'vitest'
import {
  clearHttpLockerSettings,
  disconnectHttpLocker,
  disconnectSupabaseLocker,
  getActiveLocker,
  getLockerConnection,
  getLockerRemember,
  LOCKER_SUPABASE_KEY,
  loadHttpLockerSettings,
  loadSupabaseSettings,
  lockerSupportsHttpEngine,
  resetLockerProbeForTests,
  saveHttpLockerSettings,
  saveSupabaseSettings,
  setLockerForTests,
  setLockerKind,
} from './active'
import { httpLocker, setHttpLockerSameOrigin } from './httpLocker'
import { MemoryObjectStore } from './objectStore'
import { createSupabaseLocker } from './supabaseLocker'
import { assertLockerBindingForSave, type LockerBinding } from './lockerBinding'

afterEach(() => {
  setLockerForTests(null)
  disconnectSupabaseLocker()
  disconnectHttpLocker()
  resetLockerProbeForTests()
  setLockerKind('http')
})

describe('active locker', () => {
  it('defaults to an unconfigured shelf (not the pack/session httpLocker)', async () => {
    const locker = getActiveLocker()
    expect(locker).not.toBe(httpLocker)
    expect(locker.isReady()).toBe(false)
    expect(lockerSupportsHttpEngine()).toBe(false)
    await expect(locker.put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
    setHttpLockerSameOrigin(true)
    // Same-origin Node alone is not a BYO shelf connection.
    expect(lockerSupportsHttpEngine()).toBe(false)
    await expect(getActiveLocker().put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
  })

  it('test override swaps the backend', () => {
    const locker = createSupabaseLocker(
      { url: 'https://example.supabase.co', anonKey: 'anon', secret: 'test-secret-please' },
      new MemoryObjectStore(),
    )
    setLockerForTests(locker)
    expect(getActiveLocker()).toBe(locker)
    expect(lockerSupportsHttpEngine()).toBe(false)
  })

  it('setLockerKind supabase without settings yields an unconfigured shelf', () => {
    setLockerKind('supabase')
    const locker = getActiveLocker()
    expect(locker.isReady()).toBe(false)
    expect(locker.supportsHttpEngine).toBe(false)
  })

  it('stores url, bucket, anon key, and secret together in sessionStorage', () => {
    const settings = {
      url: 'https://example.supabase.co',
      anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
      bucket: 'firma',
      path: 'firma',
      encrypt: true,
      secret: 'test-secret-please',
    }
    saveSupabaseSettings(settings, false)
    expect(getLockerRemember()).toBe(false)
    expect(loadSupabaseSettings()).toEqual(settings)
    expect(sessionStorage.getItem(LOCKER_SUPABASE_KEY)).toBeTruthy()
    expect(localStorage.getItem(LOCKER_SUPABASE_KEY)).toBeNull()
  })

  it('can remember supabase settings on this computer via localStorage', () => {
    const settings = {
      url: 'https://example.supabase.co',
      anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
      path: 'tilari',
      encrypt: true,
      secret: 'test-secret-please',
    }
    saveSupabaseSettings(settings, true)
    expect(getLockerRemember()).toBe(true)
    expect(localStorage.getItem(LOCKER_SUPABASE_KEY)).toBeTruthy()
    expect(sessionStorage.getItem(LOCKER_SUPABASE_KEY)).toBeNull()
    expect(loadSupabaseSettings()).toEqual({
      ...settings,
      bucket: 'tilari',
    })
  })

  it('reports locker connection snapshot without secrets', async () => {
    expect(getLockerConnection().mode).toBe('off')

    saveSupabaseSettings({
      url: 'https://abc.supabase.co',
      anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
      path: 'tilari/book1',
      encrypt: true,
      secret: 'test-secret-please',
    })
    setLockerKind('supabase')
    expect(getLockerConnection()).toEqual({
      mode: 'supabase',
      endpoint: 'abc.supabase.co',
      path: 'tilari/book1',
      encrypted: true,
    })

    disconnectSupabaseLocker()
    setHttpLockerSameOrigin(true)
    // Local Node alone is not a connection — only an explicit server URL is.
    expect(getLockerConnection().mode).toBe('off')
    await expect(getActiveLocker().list()).rejects.toThrow('locker_not_configured')

    saveHttpLockerSettings(
      { url: 'http://127.0.0.1:8787', path: 'tilari', encrypt: false },
      false,
    )
    setLockerKind('http')
    expect(getLockerConnection()).toEqual({
      mode: 'http',
      endpoint: '127.0.0.1:8787',
      path: 'tilari',
      encrypted: false,
    })
  })

  it('keeps only one BYO backend: connecting supabase clears http settings', () => {
    saveHttpLockerSettings(
      { url: 'https://books.example.com', path: 'tilari/server', encrypt: false },
      false,
    )
    expect(loadHttpLockerSettings()?.path).toBe('tilari/server')
    saveSupabaseSettings(
      {
        url: 'https://abc.supabase.co',
        anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
        path: 'tilari/cloud',
        encrypt: true,
        secret: 'test-secret-please',
      },
      false,
    )
    clearHttpLockerSettings()
    setLockerKind('supabase')
    expect(loadHttpLockerSettings()).toBeNull()
    expect(loadSupabaseSettings()?.path).toBe('tilari/cloud')
  })

  it('refuses primary save when book binding does not match the active connection', () => {
    saveHttpLockerSettings(
      { url: 'https://books.example.com', path: 'tilari', encrypt: false },
      false,
    )
    setLockerKind('http')
    const book: LockerBinding = {
      kind: 'http',
      endpoint: 'other.example.com',
      path: 'tilari',
    }
    expect(() => assertLockerBindingForSave(book, false)).toThrow('locker_mismatch')
    expect(() => assertLockerBindingForSave(book, true)).not.toThrow()
    expect(() =>
      assertLockerBindingForSave(
        { kind: 'http', endpoint: 'books.example.com', path: 'tilari' },
        false,
      ),
    ).not.toThrow()
  })

  it('disposed supabase wrapper cannot reconnect via ready()', async () => {
    const store = new MemoryObjectStore()
    const locker = createSupabaseLocker(
      {
        url: 'https://example.supabase.co',
        anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
        secret: 'test-secret-please',
      },
      store,
    )
    await locker.connect()
    expect(locker.isReady()).toBe(true)
    locker.disconnect()
    expect(locker.isReady()).toBe(false)
    await expect(locker.list()).rejects.toThrow('locker_not_configured')
    await expect(locker.put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
  })
})
