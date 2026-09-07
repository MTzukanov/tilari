import { createHttpObjectStore } from './httpObjectStore'
import { ObjectStoreLockerBackend } from './objectStoreLocker'
import type { HttpLockerSettings, LockerBackend } from './types'
import { objectKeyPrefix, parseStoragePath } from './storagePath'
import { openEncryptedStore, requireSecret } from './vaultCrypto'
import { getHttpLockerOrigin, httpLockerNodeReachable, httpLockerUsesSameOrigin, parseHttpLockerSettings } from './httpLocker'

export async function buildHttpObjectLocker(
  settings: HttpLockerSettings,
  origin: string | null = getHttpLockerOrigin(),
): Promise<ObjectStoreLockerBackend> {
  const parsed = parseStoragePath(settings.path || 'tilari')
  const keyPrefix = objectKeyPrefix(parsed, 'http')
  const raw = createHttpObjectStore(origin)
  const encrypt = Boolean(settings.encrypt)
  const ready = encrypt
    ? await openEncryptedStore(raw, requireSecret(String(settings.secret || '')), keyPrefix)
    : raw
  // Ledger /api is page-relative (or Vite-proxied). Allow On the server when Node is
  // reachable here and the shelf is plaintext — locker URL may differ (e.g. :8000).
  const supportsHttpEngine = !encrypt && (origin === null || httpLockerNodeReachable())
  return new ObjectStoreLockerBackend(ready, keyPrefix, {
    id: 'http',
    supportsHttpEngine,
  })
}

/** Lazy wrapper matching createSupabaseLocker. */
export function createHttpObjectLocker(settings: HttpLockerSettings, origin?: string | null): LockerBackend {
  let backend: ObjectStoreLockerBackend | null = null
  const encrypt = Boolean(settings.encrypt)
  let disposed = false

  async function ready(next?: unknown): Promise<ObjectStoreLockerBackend> {
    if (disposed) throw new Error('locker_not_configured')
    const s = next ? parseHttpLockerSettings(next) : settings
    backend = await buildHttpObjectLocker(s, origin === undefined ? getHttpLockerOrigin() : origin)
    if (disposed) {
      backend = null
      throw new Error('locker_not_configured')
    }
    return backend
  }

  return {
    id: 'http',
    get supportsHttpEngine() {
      if (disposed || encrypt) return false
      if (backend) return backend.supportsHttpEngine
      const o = origin === undefined ? getHttpLockerOrigin() : origin
      return o === null || httpLockerNodeReachable() || httpLockerUsesSameOrigin()
    },
    async connect(next?: unknown) {
      if (disposed) throw new Error('locker_not_configured')
      await ready(next)
    },
    disconnect() {
      disposed = true
      backend = null
    },
    isReady() {
      return Boolean(backend) && !disposed
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
