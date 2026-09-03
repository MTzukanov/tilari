import { probeNodeApi } from '../../http'
import {
  getHttpLockerOrigin,
  httpLocker,
  parseHttpLockerSettings,
  resolveHttpLockerOrigin,
  resetHttpLockerState,
  setHttpLockerOrigin,
  setHttpLockerSameOrigin,
} from './httpLocker'
import { createSupabaseLocker, createUnconfiguredSupabaseLocker, parseSupabaseSettings } from './supabaseLocker'
import type { HttpLockerSettings, LockerBackend, LockerKind, SupabaseLockerSettings } from './types'

export const LOCKER_KIND_KEY = 'tilari.locker.kind'
export const LOCKER_SUPABASE_KEY = 'tilari.locker.supabase'
export const LOCKER_HTTP_KEY = 'tilari.locker.http'

let testOverride: LockerBackend | null = null
let supabaseInstance: LockerBackend | null = null
let sameOriginResult: boolean | null = null
let sameOriginProbe: Promise<boolean> | null = null

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

export function loadHttpLockerSettings(): HttpLockerSettings | null {
  try {
    const raw = sessionStorage.getItem(LOCKER_HTTP_KEY)
    if (!raw) return null
    return parseHttpLockerSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveHttpLockerSettings(settings: HttpLockerSettings): void {
  try {
    sessionStorage.setItem(LOCKER_HTTP_KEY, JSON.stringify(settings))
  } catch {
    /* private mode */
  }
}

export function clearHttpLockerSettings(): void {
  try {
    sessionStorage.removeItem(LOCKER_HTTP_KEY)
  } catch {
    /* private mode */
  }
  setHttpLockerOrigin(null)
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

function hydrateHttpLocker(): void {
  const settings = loadHttpLockerSettings()
  if (!settings) return
  const origin = resolveHttpLockerOrigin(settings.url)
  if (getHttpLockerOrigin() !== origin) setHttpLockerOrigin(origin)
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
  if (readKind() === 'supabase') return supabaseLocker()
  hydrateHttpLocker()
  return httpLocker
}

export async function probeSameOriginNode(opts?: { force?: boolean }): Promise<boolean> {
  if (!opts?.force && sameOriginResult != null) return sameOriginResult
  if (!opts?.force && sameOriginProbe) return sameOriginProbe
  sameOriginProbe = (async () => {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      setHttpLockerSameOrigin(false)
      sameOriginResult = false
      return false
    }
    const ok = await probeNodeApi('/api/health')
    setHttpLockerSameOrigin(ok)
    sameOriginResult = ok
    return ok
  })()
  try {
    return await sameOriginProbe
  } finally {
    sameOriginProbe = null
  }
}

export async function connectHttpLocker(settings: unknown): Promise<LockerBackend> {
  const parsed = parseHttpLockerSettings(settings)
  const origin = resolveHttpLockerOrigin(parsed.url)
  const healthUrl = origin ? `${origin}/api/health` : '/api/health'
  const ok = await probeNodeApi(healthUrl)
  if (!ok) throw new Error('locker_http_unreachable')
  saveHttpLockerSettings(parsed)
  writeKind('http')
  setHttpLockerOrigin(origin)
  if (!origin) {
    setHttpLockerSameOrigin(true)
    sameOriginResult = true
  }
  return httpLocker
}

export function disconnectHttpLocker(): void {
  clearHttpLockerSettings()
  writeKind('http')
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

export function resetLockerProbeForTests(): void {
  sameOriginResult = null
  sameOriginProbe = null
  resetHttpLockerState()
  try {
    sessionStorage.removeItem(LOCKER_HTTP_KEY)
  } catch {
    /* ignore */
  }
}
