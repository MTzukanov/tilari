import { createHttpObjectStore } from './httpObjectStore'
import { ObjectStoreLockerBackend } from './objectStoreLocker'
import type { HttpLockerSettings, LockerBackend } from './types'
import { objectKeyPrefix, parseStoragePath } from './storagePath'
import { openEncryptedStore, requireSecret } from './vaultCrypto'
import { getHttpLockerOrigin, httpLockerUsesSameOrigin, parseHttpLockerSettings } from './httpLocker'

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
  return new ObjectStoreLockerBackend(ready, keyPrefix, {
    id: 'http',
    supportsHttpEngine: httpLockerUsesSameOrigin(),
  })
}

/** Lazy wrapper matching createSupabaseLocker. */
export function createHttpObjectLocker(settings: HttpLockerSettings, origin?: string | null): LockerBackend {
  let backend: ObjectStoreLockerBackend | null = null

  async function ready(next?: unknown): Promise<ObjectStoreLockerBackend> {
    const s = next ? parseHttpLockerSettings(next) : settings
    backend = await buildHttpObjectLocker(s, origin === undefined ? getHttpLockerOrigin() : origin)
    return backend
  }

  return {
    id: 'http',
    get supportsHttpEngine() {
      return httpLockerUsesSameOrigin()
    },
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
