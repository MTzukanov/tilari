import { loadBookSession } from '../app/open/lastBook'
import { canPickWritableLocalFile } from '../app/open/pickLocalKitsas'
import { HttpBookService } from './httpService'
import { WASM_SESSION_METHODS, wrapSessionMethods } from './persist/wrapSession'
import type { AttachmentSyncState, BookService, EngineKind, SessionPersistState } from './service'
import { WasmBookService } from './wasmService'

export type { AttachmentSyncState, EngineKind, SessionPersistState } from './service'

export const ENGINE_KEY = 'tilari.engine'

export function getEngine(): EngineKind {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'http' ? 'http' : 'wasm'
  } catch {
    return 'wasm'
  }
}

/** Engine for the live book session, else the user's default preference. */
export function resolveEngine(): EngineKind {
  if (activeEngine) return activeEngine
  const session = loadBookSession()
  if (session?.engine === 'http' || session?.engine === 'wasm') return session.engine
  return getEngine()
}

/** Pin engine choice for the duration of `fn` (sync or async). */
export async function withEngine<T>(kind: EngineKind, fn: () => T | Promise<T>): Promise<T> {
  const prev = activeEngine
  activeEngine = kind
  try {
    return await fn()
  } finally {
    activeEngine = prev
  }
}

/** Persist engine preference. Call resetBookService() after; reopen the book. */
export function setEngine(kind: EngineKind): void {
  try {
    localStorage.setItem(ENGINE_KEY, kind)
  } catch {
    /* private mode */
  }
}

let instance: BookService | null = null
let instanceEngine: EngineKind | null = null
let serviceEpoch = 0
/** When set, getBookService() uses this engine (e.g. while opening a book). */
let activeEngine: EngineKind | null = null

export function getBookServiceEpoch(): number {
  return serviceEpoch
}

export function getBookService(): BookService {
  const kind = resolveEngine()
  if (instance && instanceEngine !== kind) {
    disposeBookService()
  }
  if (!instance) {
    instance = kind === 'http' ? new HttpBookService() : wrapWasmBookService(new WasmBookService())
    instanceEngine = kind
  }
  return instance
}

function wrapWasmBookService(svc: WasmBookService): BookService {
  return wrapSessionMethods(svc, () => svc.prepareSession(), WASM_SESSION_METHODS)
}

function disposeBookService(): void {
  const prev = instance
  instance = null
  instanceEngine = null
  if (prev && 'dispose' in prev && typeof (prev as WasmBookService).dispose === 'function') {
    ;(prev as WasmBookService).dispose()
  }
  serviceEpoch += 1
}

export function resetBookService(): void {
  disposeBookService()
}

export function onAttachmentSync(listener: (state: AttachmentSyncState) => void): () => void {
  const svc = getBookService()
  if (svc.onAttachmentSync) return svc.onAttachmentSync(listener)
  listener({ status: 'idle', loaded: 0, total: null })
  return () => undefined
}

export function onDirtyChange(listener: () => void): () => void {
  const svc = getBookService()
  if (svc.onDirtyChange) return svc.onDirtyChange(listener)
  listener()
  return () => undefined
}

export function onSessionChange(listener: () => void): () => void {
  const svc = getBookService()
  if (svc.onSessionChange) return svc.onSessionChange(listener)
  listener()
  return () => undefined
}

export function onLocalLinkChange(listener: () => void): () => void {
  const svc = getBookService()
  if (svc.onLocalLinkChange) return svc.onLocalLinkChange(listener)
  listener()
  return () => undefined
}

export function hasWritableLocalFile(): boolean {
  return getBookService().hasWritableLocalFile()
}

export function canLinkWritableFile(): boolean {
  return canPickWritableLocalFile()
}

export function linkWritableFile(): Promise<void> {
  return getBookService().linkWritableFile()
}

export function getAttachmentSyncState(): AttachmentSyncState {
  return getBookService().getAttachmentSyncState?.() ?? { status: 'idle', loaded: 0, total: null }
}

export function onSessionPersist(listener: (state: SessionPersistState) => void): () => void {
  const svc = getBookService()
  if (svc.onSessionPersist) return svc.onSessionPersist(listener)
  listener(null)
  return () => undefined
}

export function getSessionPersistState(): SessionPersistState {
  return getBookService().getSessionPersistState?.() ?? null
}

export function flushSessionPersist(): Promise<void> {
  return getBookService().flushPersistNow?.() ?? Promise.resolve()
}
