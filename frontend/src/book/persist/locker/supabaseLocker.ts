import { createSupabaseObjectStore } from './supabaseRest'
import { ObjectStoreLockerBackend } from './objectStoreLocker'
import type { LockerObjectStore } from './objectStore'
import type { LockerBackend, SupabaseLockerSettings } from './types'
import { DEFAULT_STORAGE_PATH, objectKeyPrefix, parseStoragePath } from './storagePath'
import { openEncryptedStore, requireSecret } from './vaultCrypto'

export const DEFAULT_BUCKET = DEFAULT_STORAGE_PATH

function jwtRole(token: string): string | undefined {
  try {
    const part = token.split('.')[1]
    if (!part) return undefined
    const padded = part.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: string }
    return payload.role
  } catch {
    return undefined
  }
}

export function parseSupabaseSettings(raw: unknown): SupabaseLockerSettings {
  if (!raw || typeof raw !== 'object') throw new Error('locker_settings')
  const o = raw as Record<string, unknown>
  const url = String(o.url || '').trim().replace(/\/$/, '')
  const anonKey = String(o.anonKey || o.anon_key || '').trim()
  const pathRaw = String(o.path || o.bucket || DEFAULT_STORAGE_PATH).trim() || DEFAULT_STORAGE_PATH
  if (!url || !anonKey) throw new Error('locker_settings')
  if (!/^https:\/\//i.test(url)) throw new Error('locker_url')
  if (jwtRole(anonKey) === 'service_role') throw new Error('locker_service_role')
  const encrypt = o.encrypt !== false && o.encrypt !== 'false'
  let secret: string | undefined
  if (encrypt) secret = requireSecret(String(o.secret || ''))
  return {
    url,
    anonKey,
    bucket: pathRaw,
    path: pathRaw,
    encrypt,
    secret,
  }
}

class UnconfiguredSupabaseLocker implements LockerBackend {
  readonly id = 'supabase' as const
  readonly supportsHttpEngine = false
  async connect(): Promise<void> {
    throw new Error('locker_not_configured')
  }
  disconnect(): void {}
  isReady(): boolean {
    return false
  }
  list(): Promise<never> {
    return Promise.reject(new Error('locker_not_configured'))
  }
  get(): Promise<never> {
    return Promise.reject(new Error('locker_not_configured'))
  }
  put(): Promise<never> {
    return Promise.reject(new Error('locker_not_configured'))
  }
  getAttachmentBlob(): Promise<never> {
    return Promise.reject(new Error('locker_not_configured'))
  }
}

/** @deprecated alias — prefer ObjectStoreLockerBackend */
export type SupabaseLockerBackend = ObjectStoreLockerBackend

export function createUnconfiguredSupabaseLocker(): LockerBackend {
  return new UnconfiguredSupabaseLocker()
}

export async function buildSupabaseLocker(
  settings: SupabaseLockerSettings,
  store?: LockerObjectStore,
): Promise<ObjectStoreLockerBackend> {
  const parsed = parseStoragePath(settings.path || settings.bucket || DEFAULT_STORAGE_PATH)
  const keyPrefix = objectKeyPrefix(parsed, 'supabase')
  const raw =
    store ??
    createSupabaseObjectStore(settings.url, settings.anonKey, parsed.bucket || DEFAULT_BUCKET)
  const encrypt = settings.encrypt !== false
  const ready = encrypt
    ? await openEncryptedStore(raw, requireSecret(String(settings.secret || '')), keyPrefix)
    : raw
  return new ObjectStoreLockerBackend(ready, keyPrefix, {
    id: 'supabase',
    supportsHttpEngine: false,
  })
}

/** Lazy-connecting wrapper so callers can use sync construction. */
export function createSupabaseLocker(
  settings: SupabaseLockerSettings,
  store?: LockerObjectStore,
): LockerBackend {
  if (!store && !(settings.url && settings.anonKey)) return createUnconfiguredSupabaseLocker()

  let backend: ObjectStoreLockerBackend | null = null
  let boot: Promise<ObjectStoreLockerBackend> | null = null

  async function ready(next?: unknown): Promise<ObjectStoreLockerBackend> {
    const s = next ? parseSupabaseSettings(next) : settings
    if (backend && !next) return backend
    boot = buildSupabaseLocker(s, store)
    backend = await boot
    boot = null
    return backend
  }

  return {
    id: 'supabase',
    supportsHttpEngine: false,
    async connect(next?: unknown) {
      await ready(next)
    },
    disconnect() {
      backend = null
    },
    isReady() {
      return Boolean(backend)
    },
    async list() {
      return (await ready()).list()
    },
    async get(id, opts) {
      return (await ready()).get(id, opts)
    },
    async put(id, bytes, name, etag, opts) {
      return (await ready()).put(id, bytes, name, etag, opts)
    },
    async getAttachmentBlob(id, sha, opts) {
      return (await ready()).getAttachmentBlob(id, sha, opts)
    },
    async putAttachmentBlobs(id, shas, blobs, etag, opts) {
      return (await ready()).putAttachmentBlobs!(id, shas, blobs, etag, opts)
    },
    async remove(id) {
      return (await ready()).remove!(id)
    },
    async gcUnusedBlobs() {
      return (await ready()).gcUnusedBlobs!()
    },
  }
}
