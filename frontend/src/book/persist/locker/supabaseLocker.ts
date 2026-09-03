import { encodeAttachmentPack, emptyAttachmentPack } from '../../attPack'
import { newLedgerId } from '../../ledger'
import { sha256hex } from '../../sha256'
import type { TransferOpts } from '../../http'
import { createSupabaseObjectStore } from './supabaseRest'
import type { LockerObjectStore } from './objectStore'
import type {
  LockerBackend,
  LockerBookInfo,
  LockerPutResult,
  SupabaseLockerSettings,
} from './types'
import { openEncryptedStore, requireSecret } from './vaultCrypto'

const SHA_RE = /^[0-9a-f]{64}$/
const PREFIX = 'tilari/'
export const DEFAULT_BUCKET = 'tilari'

type MetaFile = {
  id: string
  name: string
  size: number
  sha256: string
  attachments_sha256: string
  attachments_size: number
  split_attachments: boolean
  updated_at: string
}

function bookDir(id: string): string {
  return `${PREFIX}${id}/`
}
function kitsasPath(id: string): string {
  return `${bookDir(id)}book.kitsas`
}
function metaPath(id: string): string {
  return `${bookDir(id)}meta.json`
}
function blobPath(id: string, sha: string): string {
  return `${bookDir(id)}attachments/${sha}`
}

function normalizeName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._\-]+/g, '_') || 'book.kitsas'
  return base.toLowerCase().endsWith('.kitsas') ? base : `${base}.kitsas`
}

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
  const bucket = String(o.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
  if (!url || !anonKey) throw new Error('locker_settings')
  if (!/^https:\/\//i.test(url)) throw new Error('locker_url')
  if (jwtRole(anonKey) === 'service_role') throw new Error('locker_service_role')
  const secret = requireSecret(String(o.secret || ''))
  return { url, anonKey, bucket, secret }
}

function notFound(err: unknown, code: string): boolean {
  return err instanceof Error && (err.message === 'not_found' || err.message === code)
}

export class SupabaseLockerBackend implements LockerBackend {
  readonly id = 'supabase' as const
  readonly supportsHttpEngine = false
  private rawStore: LockerObjectStore | null
  private encStore: LockerObjectStore | null
  private settings: SupabaseLockerSettings | null

  constructor(store?: LockerObjectStore, settings?: SupabaseLockerSettings) {
    this.settings = settings ?? null
    this.encStore = null
    if (store) {
      this.rawStore = store
    } else if (settings?.url && settings.anonKey && settings.secret && settings.url.startsWith('https://')) {
      this.rawStore = createSupabaseObjectStore(
        settings.url,
        settings.anonKey,
        settings.bucket || DEFAULT_BUCKET,
      )
    } else {
      this.rawStore = null
    }
  }

  async connect(settings?: unknown): Promise<void> {
    const parsed = parseSupabaseSettings(settings ?? this.settings)
    this.settings = parsed
    this.encStore = null
    if (!this.rawStore) {
      this.rawStore = createSupabaseObjectStore(parsed.url, parsed.anonKey, parsed.bucket || DEFAULT_BUCKET)
    }
    await this.readyStore()
  }

  disconnect(): void {
    this.rawStore = null
    this.encStore = null
    this.settings = null
  }

  isReady(): boolean {
    return Boolean(this.rawStore && this.settings?.secret)
  }

  private async readyStore(): Promise<LockerObjectStore> {
    if (this.encStore) return this.encStore
    if (!this.rawStore || !this.settings?.secret) throw new Error('locker_not_configured')
    this.encStore = await openEncryptedStore(this.rawStore, this.settings.secret)
    return this.encStore
  }

  private async readMeta(id: string): Promise<MetaFile | null> {
    try {
      const bytes = await (await this.readyStore()).download(metaPath(id))
      return JSON.parse(new TextDecoder().decode(bytes)) as MetaFile
    } catch (err) {
      if (notFound(err, 'book_not_found')) return null
      throw err
    }
  }

  private async writeMeta(meta: MetaFile, opts?: TransferOpts): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(meta))
    await (await this.readyStore()).upload(metaPath(meta.id), bytes, {
      ...opts,
      upsert: true,
      contentType: 'application/json',
    })
  }

  async list(): Promise<LockerBookInfo[]> {
    const store = await this.readyStore()
    const rows = await store.list(PREFIX)
    const seen = new Set<string>()
    const metas: LockerBookInfo[] = []
    for (const row of rows) {
      const name = row.name.replace(/^\//, '').replace(/\/$/, '')
      const nested = name.match(/^([^/]+)\/meta\.json$/)
      const id = nested?.[1] ?? (name.includes('/') ? null : name)
      if (!id || id === 'vault.json' || seen.has(id)) continue
      seen.add(id)
      const meta = await this.readMeta(id)
      if (meta?.id) metas.push(meta)
    }
    metas.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
    return metas
  }

  async get(id: string, opts?: TransferOpts) {
    const meta = await this.readMeta(id)
    if (!meta) throw new Error('book_not_found')
    const bytes = await (await this.readyStore()).download(kitsasPath(id), opts)
    return {
      bytes,
      etag: meta.sha256,
      attachmentsEtag: meta.attachments_sha256,
      name: meta.name,
    }
  }

  async put(
    id: string | null,
    bytes: Uint8Array,
    name: string,
    etag?: string,
    opts?: TransferOpts,
  ): Promise<LockerPutResult> {
    const store = await this.readyStore()
    const bookId = id ?? newLedgerId()
    const existing = await this.readMeta(bookId)
    if (existing) {
      if (!etag || existing.sha256 !== etag) throw new Error('etag_mismatch')
    }
    const sha = await sha256hex(bytes)
    const emptyPack = emptyAttachmentPack()
    const emptySha = existing?.attachments_sha256 || (await sha256hex(emptyPack))
    await store.upload(kitsasPath(bookId), bytes, { ...opts, upsert: Boolean(existing) })
    const meta: MetaFile = {
      id: bookId,
      name: normalizeName(name),
      size: bytes.byteLength,
      sha256: sha,
      attachments_sha256: emptySha,
      attachments_size: existing?.attachments_size ?? emptyPack.byteLength,
      split_attachments: true,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      meta.attachments_sha256 = existing.attachments_sha256
      meta.attachments_size = existing.attachments_size
    }
    await this.writeMeta(meta, opts)
    return { id: bookId, sha256: sha, attachments_sha256: meta.attachments_sha256 }
  }

  async getAttachmentBlob(id: string, sha: string, opts?: TransferOpts): Promise<Uint8Array> {
    const s = sha.toLowerCase()
    if (!SHA_RE.test(s)) throw new Error('attachment_not_found')
    try {
      return await (await this.readyStore()).download(blobPath(id, s), opts)
    } catch (err) {
      if (notFound(err, 'attachment_not_found')) throw new Error('attachment_not_found')
      throw err
    }
  }

  async putAttachmentBlobs(
    id: string,
    blobs: Record<string, Uint8Array>,
    etag: string,
    opts?: TransferOpts,
  ): Promise<{ attachments_sha256: string }> {
    if (!etag) throw new Error('etag_mismatch')
    const existing = await this.readMeta(id)
    if (!existing) throw new Error('book_not_found')
    if (existing.attachments_sha256 !== etag) throw new Error('etag_mismatch')
    const store = await this.readyStore()
    const entries = Object.entries(blobs)
    for (const [sha, data] of entries) {
      if (!SHA_RE.test(sha)) throw new Error('invalid_sha')
      await store.upload(blobPath(id, sha), data, { ...opts, upsert: true })
    }
    const pack = encodeAttachmentPack(blobs)
    const attSha = await sha256hex(pack)
    const meta: MetaFile = {
      ...existing,
      attachments_sha256: attSha,
      attachments_size: pack.byteLength,
      split_attachments: true,
      updated_at: new Date().toISOString(),
    }
    await this.writeMeta(meta, opts)
    return { attachments_sha256: attSha }
  }

  async remove(id: string): Promise<void> {
    const store = await this.readyStore()
    const listed = await store.list(bookDir(id))
    const paths = listed.map((row) => `${bookDir(id)}${row.name.replace(/^\//, '')}`)
    await store.remove(paths)
  }
}

export function createUnconfiguredSupabaseLocker(): SupabaseLockerBackend {
  return new SupabaseLockerBackend()
}

export function createSupabaseLocker(
  settings: SupabaseLockerSettings,
  store?: LockerObjectStore,
): SupabaseLockerBackend {
  const locker = new SupabaseLockerBackend(store, settings)
  return locker
}
