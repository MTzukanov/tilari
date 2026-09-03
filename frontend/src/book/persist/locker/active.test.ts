import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCKER_SUPABASE_KEY,
  disconnectSupabaseLocker,
  getActiveLocker,
  loadSupabaseSettings,
  lockerSupportsHttpEngine,
  saveSupabaseSettings,
  setLockerForTests,
  setLockerKind,
} from './active'
import { httpLocker } from './httpLocker'
import { MemoryObjectStore } from './objectStore'
import { createSupabaseLocker } from './supabaseLocker'

afterEach(() => {
  setLockerForTests(null)
  disconnectSupabaseLocker()
  sessionStorage.removeItem(LOCKER_SUPABASE_KEY)
})

describe('active locker', () => {
  it('defaults to the Node HTTP locker', () => {
    expect(getActiveLocker()).toBe(httpLocker)
    expect(lockerSupportsHttpEngine()).toBe(true)
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

  it('setLockerKind supabase without settings yields an unready backend', () => {
    setLockerKind('supabase')
    const locker = getActiveLocker()
    expect(locker.id).toBe('supabase')
    expect(locker.isReady()).toBe(false)
    expect(locker.supportsHttpEngine).toBe(false)
  })

  it('stores url, bucket, anon key, and secret together in sessionStorage', () => {
    const settings = {
      url: 'https://example.supabase.co',
      anonKey: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.sig',
      bucket: 'firma',
      secret: 'test-secret-please',
    }
    saveSupabaseSettings(settings)
    expect(JSON.parse(sessionStorage.getItem(LOCKER_SUPABASE_KEY) ?? '{}')).toEqual(settings)
    expect(loadSupabaseSettings()).toEqual(settings)
  })
})
