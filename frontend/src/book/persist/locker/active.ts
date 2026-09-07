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
import { createHttpObjectLocker } from './httpObjectLocker'
import { createSupabaseLocker, createUnconfiguredSupabaseLocker, parseSupabaseSettings } from './supabaseLocker'
import { createUnconfiguredShelfLocker } from './unconfiguredLocker'
import type { HttpLockerSettings, LockerBackend, LockerKind, SupabaseLockerSettings } from './types'

export const LOCKER_KIND_KEY = 'tilari.locker.kind'
export const LOCKER_SUPABASE_KEY = 'tilari.locker.supabase'
export const LOCKER_HTTP_KEY = 'tilari.locker.http'
export const LOCKER_REMEMBER_KEY = 'tilari.locker.remember'

/** High-level BYO locker link for status UI (no secrets). */
export type LockerConnectionMode = 'off' | 'supabase' | 'http'

export type LockerConnection = {
  mode: LockerConnectionMode
  /** Display host / origin (never anon key or secret). */
  endpoint: string | null
  path: string | null
  encrypted: boolean
}

let testOverride: LockerBackend | null = null
let supabaseInstance: LockerBackend | null = null
let httpObjectInstance: LockerBackend | null = null
let sameOriginResult: boolean | null = null
let sameOriginProbe: Promise<boolean> | null = null
const connectionListeners = new Set<() => void>()
let cachedConnection: LockerConnection | null = null
const unconfiguredShelf = createUnconfiguredShelfLocker()

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '') || url
  }
}

/** Display host for a locker URL (no secrets). */
export function lockerHostOf(url: string): string {
  return hostOf(url)
}

function sameConnection(a: LockerConnection, b: LockerConnection): boolean {
  return (
    a.mode === b.mode &&
    a.endpoint === b.endpoint &&
    a.path === b.path &&
    a.encrypted === b.encrypted
  )
}

function computeLockerConnection(): LockerConnection {
  if (testOverride) {
    if (!testOverride.isReady()) {
      return { mode: 'off', endpoint: null, path: null, encrypted: false }
    }
    if (testOverride.id === 'supabase') {
      const s = loadSupabaseSettings()
      return {
        mode: 'supabase',
        endpoint: s ? hostOf(s.url) : null,
        path: s?.path || s?.bucket || null,
        encrypted: s ? s.encrypt !== false : false,
      }
    }
    const http = loadHttpLockerSettings()
    if (!http) return { mode: 'off', endpoint: null, path: null, encrypted: false }
    return {
      mode: 'http',
      endpoint: hostOf(http.url),
      path: http.path || null,
      encrypted: Boolean(http.encrypt),
    }
  }

  if (readKind() === 'supabase') {
    const s = loadSupabaseSettings()
    if (!s) return { mode: 'off', endpoint: null, path: null, encrypted: false }
    return {
      mode: 'supabase',
      endpoint: hostOf(s.url),
      path: s.path || s.bucket || null,
      encrypted: s.encrypt !== false,
    }
  }

  const http = loadHttpLockerSettings()
  if (http) {
    const origin = getHttpLockerOrigin() || resolveHttpLockerOrigin(http.url)
    return {
      mode: 'http',
      endpoint: origin ? hostOf(origin) : hostOf(http.url),
      path: http.path || null,
      encrypted: Boolean(http.encrypt),
    }
  }

  return { mode: 'off', endpoint: null, path: null, encrypted: false }
}

/** Stable snapshot for useSyncExternalStore (same reference when unchanged). */
export function getLockerConnection(): LockerConnection {
  const next = computeLockerConnection()
  if (cachedConnection && sameConnection(cachedConnection, next)) return cachedConnection
  cachedConnection = next
  return cachedConnection
}

export function notifyLockerConnection(): void {
  for (const fn of connectionListeners) fn()
}

export function subscribeLockerConnection(listener: () => void): () => void {
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}

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

function readStorageItem(key: string): string | null {
  try {
    const session = sessionStorage.getItem(key)
    if (session) return session
  } catch {
    /* private mode */
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageItem(key: string, value: string, remember: boolean): void {
  try {
    if (remember) {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    }
  } catch {
    /* private mode */
  }
}

function removeStorageItem(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function getLockerRemember(): boolean {
  try {
    if (localStorage.getItem(LOCKER_REMEMBER_KEY) === '1') return true
    if (localStorage.getItem(LOCKER_REMEMBER_KEY) === '0') return false
    // Legacy / inferred: credentials only in localStorage.
    return Boolean(localStorage.getItem(LOCKER_SUPABASE_KEY) || localStorage.getItem(LOCKER_HTTP_KEY))
  } catch {
    return false
  }
}

export function setLockerRemember(remember: boolean): void {
  try {
    localStorage.setItem(LOCKER_REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function loadSupabaseSettings(): SupabaseLockerSettings | null {
  try {
    const raw = readStorageItem(LOCKER_SUPABASE_KEY)
    if (!raw) return null
    return parseSupabaseSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSupabaseSettings(settings: SupabaseLockerSettings, remember = getLockerRemember()): void {
  setLockerRemember(remember)
  writeStorageItem(LOCKER_SUPABASE_KEY, JSON.stringify(settings), remember)
}

export function clearSupabaseSettings(): void {
  removeStorageItem(LOCKER_SUPABASE_KEY)
  supabaseInstance = null
}

export function loadHttpLockerSettings(): HttpLockerSettings | null {
  try {
    const raw = readStorageItem(LOCKER_HTTP_KEY)
    if (!raw) return null
    return parseHttpLockerSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveHttpLockerSettings(settings: HttpLockerSettings, remember = getLockerRemember()): void {
  setLockerRemember(remember)
  writeStorageItem(LOCKER_HTTP_KEY, JSON.stringify(settings), remember)
}

export function clearHttpLockerSettings(): void {
  httpObjectInstance?.disconnect()
  removeStorageItem(LOCKER_HTTP_KEY)
  setHttpLockerOrigin(null)
  httpObjectInstance = null
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
  if (!origin) {
    // Same-page URL → relative /api; allow HTTP engine after reload before probe finishes.
    setHttpLockerSameOrigin(true)
    sameOriginResult = true
  }
  if (!httpObjectInstance) {
    httpObjectInstance = createHttpObjectLocker(settings, origin)
  }
}

export function getLockerKind(): LockerKind {
  if (testOverride) return testOverride.id
  return readKind()
}

export function setLockerKind(kind: LockerKind): void {
  writeKind(kind)
  notifyLockerConnection()
}

export function lockerSupportsHttpEngine(): boolean {
  return getActiveLocker().supportsHttpEngine
}

/** Explicitly connected BYO shelf only — never the pack/session httpLocker singleton. */
export function getActiveLocker(): LockerBackend {
  if (testOverride) return testOverride
  if (getLockerConnection().mode === 'off') return unconfiguredShelf
  if (readKind() === 'supabase') return supabaseLocker()
  hydrateHttpLocker()
  if (httpObjectInstance) return httpObjectInstance
  return unconfiguredShelf
}

/** Pack /api/books client — HTTP-engine session helpers only; not the BYO shelf. */
export function getHttpBooksLocker(): LockerBackend {
  return httpLocker
}

export async function probeSameOriginNode(opts?: { force?: boolean }): Promise<boolean> {
  if (!opts?.force && sameOriginResult != null) return sameOriginResult
  if (!opts?.force && sameOriginProbe) return sameOriginProbe
  sameOriginProbe = (async () => {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      setHttpLockerSameOrigin(false)
      sameOriginResult = false
      notifyLockerConnection()
      return false
    }
    const ok = await probeNodeApi('/api/health')
    setHttpLockerSameOrigin(ok)
    sameOriginResult = ok
    notifyLockerConnection()
    return ok
  })()
  try {
    return await sameOriginProbe
  } finally {
    sameOriginProbe = null
  }
}

export async function connectHttpLocker(settings: unknown, remember = getLockerRemember()): Promise<LockerBackend> {
  const parsed = parseHttpLockerSettings(settings)
  const origin = resolveHttpLockerOrigin(parsed.url)
  const healthUrl = origin ? `${origin}/api/health` : '/api/health'
  const ok = await probeNodeApi(healthUrl)
  if (!ok) throw new Error('locker_http_unreachable')
  // Exclusive: only one BYO connection at a time.
  supabaseInstance?.disconnect()
  clearSupabaseSettings()
  saveHttpLockerSettings(parsed, remember)
  writeKind('http')
  setHttpLockerOrigin(origin)
  if (!origin) {
    setHttpLockerSameOrigin(true)
    sameOriginResult = true
  } else {
    // Ledger APIs are page-relative; record whether this UI can reach Node (e.g. Vite proxy).
    const pageOk = await probeNodeApi('/api/health')
    setHttpLockerSameOrigin(pageOk)
    sameOriginResult = pageOk
  }
  httpObjectInstance = createHttpObjectLocker(parsed, origin)
  await httpObjectInstance.connect()
  notifyLockerConnection()
  return httpObjectInstance
}

export function disconnectHttpLocker(): void {
  clearHttpLockerSettings()
  writeKind('http')
  notifyLockerConnection()
}

export async function connectSupabaseLocker(
  settings: unknown,
  remember = getLockerRemember(),
): Promise<LockerBackend> {
  const parsed = parseSupabaseSettings(settings)
  // Exclusive: drop Tilari-server settings so credentials cannot mix.
  clearHttpLockerSettings()
  saveSupabaseSettings(parsed, remember)
  writeKind('supabase')
  supabaseInstance = createSupabaseLocker(parsed)
  await supabaseInstance.connect(parsed)
  notifyLockerConnection()
  return supabaseInstance
}

export function disconnectSupabaseLocker(): void {
  supabaseInstance?.disconnect()
  clearSupabaseSettings()
  writeKind('http')
  notifyLockerConnection()
}

/** Test hook: replace the active backend. Pass null to restore. */
export function setLockerForTests(backend: LockerBackend | null): void {
  testOverride = backend
}

export function resetLockerProbeForTests(): void {
  sameOriginResult = null
  sameOriginProbe = null
  httpObjectInstance = null
  resetHttpLockerState()
  removeStorageItem(LOCKER_HTTP_KEY)
  removeStorageItem(LOCKER_SUPABASE_KEY)
  try {
    localStorage.removeItem(LOCKER_REMEMBER_KEY)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem('tilari.locker.skipSameOrigin')
  } catch {
    /* ignore legacy key */
  }
}
