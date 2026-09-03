import { httpLocker } from './httpLocker'
import { createSupabaseLocker, createUnconfiguredSupabaseLocker, parseSupabaseSettings } from './supabaseLocker'
import type { LockerBackend, LockerKind, SupabaseLockerSettings } from './types'

export const LOCKER_KIND_KEY = 'tilari.locker.kind'
export const LOCKER_SUPABASE_KEY = 'tilari.locker.supabase'

let testOverride: LockerBackend | null = null
let supabaseInstance: LockerBackend | null = null

function readKind(): LockerKind {
  try {
    return localStorage.getItem(LOCKER_KIND_KEY) === 'supabase' ? 'supabase' : 'http'
  } catch {
    return 'http'
  }
}

function writeKind(kind: LockerKind): void {
  try {
    localStorage.setItem(LOCKER_KIND_KEY, kind)
  } catch {
    /* private mode */
  }
}

export function loadSupabaseSettings(): SupabaseLockerSettings | null {
  try {
    const raw = sessionStorage.getItem(LOCKER_SUPABASE_KEY)
    if (!raw) return null
    return parseSupabaseSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSupabaseSettings(settings: SupabaseLockerSettings): void {
  try {
    sessionStorage.setItem(LOCKER_SUPABASE_KEY, JSON.stringify(settings))
  } catch {
    /* private mode */
  }
}

export function clearSupabaseSettings(): void {
  try {
    sessionStorage.removeItem(LOCKER_SUPABASE_KEY)
  } catch {
    /* private mode */
  }
  supabaseInstance = null
}

function supabaseLocker(): LockerBackend {
  if (supabaseInstance) return supabaseInstance
  const settings = loadSupabaseSettings()
  if (!settings) {
    supabaseInstance = createUnconfiguredSupabaseLocker()
    return supabaseInstance
  }
  supabaseInstance = createSupabaseLocker(settings)
  return supabaseInstance
}

export function getLockerKind(): LockerKind {
  if (testOverride) return testOverride.id
  return readKind()
}

export function setLockerKind(kind: LockerKind): void {
  writeKind(kind)
}

export function lockerSupportsHttpEngine(): boolean {
  return getActiveLocker().supportsHttpEngine
}

export function getActiveLocker(): LockerBackend {
  if (testOverride) return testOverride
  return readKind() === 'supabase' ? supabaseLocker() : httpLocker
}

export async function connectSupabaseLocker(settings: unknown): Promise<LockerBackend> {
  const parsed = parseSupabaseSettings(settings)
  saveSupabaseSettings(parsed)
  writeKind('supabase')
  supabaseInstance = createSupabaseLocker(parsed)
  await supabaseInstance.connect(parsed)
  return supabaseInstance
}

export function disconnectSupabaseLocker(): void {
  supabaseInstance?.disconnect()
  clearSupabaseSettings()
  writeKind('http')
}

/** Test hook: replace the active backend. Pass null to restore. */
export function setLockerForTests(backend: LockerBackend | null): void {
  testOverride = backend
}
