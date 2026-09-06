import { attachmentSetEtag, SHA_RE } from '../../blobStore'
import { newLedgerId } from '../../ledger'
import { sha256hex } from '../../sha256'
import type { TransferOpts } from '../../http'
import { listAllObjects, type LockerObjectStore } from './objectStore'
import type { LockerBackend, LockerBookInfo, LockerKind, LockerPutResult } from './types'
import { vaultPathForPrefix } from './vaultCrypto'

type MetaFile = {
  id: string
  name: string
  size: number
  sha256: string
  attachments_sha256: string
  attachments_size: number
  attachment_shas: string[]
  split_attachments: boolean
  updated_at: string
}

function normalizeName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._\-]+/g, '_') || 'book.kitsas'
  return base.toLowerCase().endsWith('.kitsas') ? base : `${base}.kitsas`
}

function normalizeShas(shas: Iterable<string>): string[] {
  return [...new Set([...shas].map((s) => s.toLowerCase()).filter((s) => SHA_RE.test(s)))].sort()
}

function notFound(err: unknown, code: string): boolean {
  return err instanceof Error && (err.message === 'not_found' || err.message === code)
}

/**
 * Shared-pool locker over any LockerObjectStore.
 * keyPrefix is '' or 'book1/' (Supabase) or 'tilari/' / 'tilari/book1/' (Node disk).
 */
export class ObjectStoreLockerBackend implements LockerBackend {
  readonly id: LockerKind
  readonly supportsHttpEngine: boolean
  private store: LockerObjectStore
  private readonly root: string

  constructor(
    store: LockerObjectStore,
    keyPrefix: string,
    opts?: { id?: LockerKind; supportsHttpEngine?: boolean },
  ) {
    this.store = store
    this.root = keyPrefix.replace(/^\/+/, '')
    if (this.root && !this.root.endsWith('/')) this.root += '/'
    this.id = opts?.id ?? 'supabase'
    this.supportsHttpEngine = opts?.supportsHttpEngine ?? false
  }

  vaultPath(): string {
    return vaultPathForPrefix(this.root)
  }

  private bookDir(id: string): string {
    return `${this.root}${id}/`
  }
  private kitsasPath(id: string): string {
    return `${this.bookDir(id)}book.kitsas`
  }
  private metaPath(id: string): string {
    return `${this.bookDir(id)}meta.json`
  }
  private blobPath(sha: string): string {
    return `${this.root}blobs/${sha}`
  }

  async connect(): Promise<void> {
    /* store already unlocked by factory */
  }

  disconnect(): void {
    /* no-op; caller drops the instance */
  }

  isReady(): boolean {
    return true
  }

  private async readMeta(id: string): Promise<MetaFile | null> {
    try {
      const bytes = await this.store.download(this.metaPath(id))
      const raw = JSON.parse(new TextDecoder().decode(bytes)) as MetaFile
      if (!Array.isArray(raw.attachment_shas)) raw.attachment_shas = []
      return raw
    } catch (err) {
      if (notFound(err, 'book_not_found')) return null
      throw err
    }
  }

  private async writeMeta(meta: MetaFile, opts?: TransferOpts): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(meta))
    await this.store.upload(this.metaPath(meta.id), bytes, {
      ...opts,
      upsert: true,
      contentType: 'application/json',
    })
  }

  async list(): Promise<LockerBookInfo[]> {
    const rows = await listAllObjects(this.store, this.root)
    const seen = new Set<string>()
    const metas: LockerBookInfo[] = []
    for (const row of rows) {
      const name = row.name.replace(/^\//, '').replace(/\/$/, '')
      const nested = name.match(/^([^/]+)\/meta\.json$/)
      const id = nested?.[1] ?? null
      if (!id || id === 'vault.json' || id === 'blobs' || seen.has(id)) continue
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
    const bytes = await this.store.download(this.kitsasPath(id), opts)
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
    const bookId = id ?? newLedgerId()
    const existing = await this.readMeta(bookId)
    if (existing) {
      if (!etag || existing.sha256 !== etag) throw new Error('etag_mismatch')
    }
    const sha = await sha256hex(bytes)
    const emptyAttSha = existing?.attachments_sha256 || (await attachmentSetEtag([]))
    await this.store.upload(this.kitsasPath(bookId), bytes, { ...opts, upsert: Boolean(existing) })
    const meta: MetaFile = {
      id: bookId,
      name: normalizeName(name),
      size: bytes.byteLength,
      sha256: sha,
      attachments_sha256: emptyAttSha,
      attachments_size: existing?.attachments_size ?? 0,
      attachment_shas: existing?.attachment_shas ?? [],
      split_attachments: true,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      meta.attachments_sha256 = existing.attachments_sha256
      meta.attachments_size = existing.attachments_size
      meta.attachment_shas = existing.attachment_shas ?? []
    }
    await this.writeMeta(meta, opts)
    return { id: bookId, sha256: sha, attachments_sha256: meta.attachments_sha256 }
  }

  async getAttachmentBlob(_id: string, sha: string, opts?: TransferOpts): Promise<Uint8Array> {
    const s = sha.toLowerCase()
    if (!SHA_RE.test(s)) throw new Error('attachment_not_found')
    try {
      return await this.store.download(this.blobPath(s), opts)
    } catch (err) {
      if (notFound(err, 'attachment_not_found')) throw new Error('attachment_not_found')
      throw err
    }
  }

  async putAttachmentBlobs(
    id: string,
    attachmentShas: string[],
    blobs: Record<string, Uint8Array>,
    etag: string,
    opts?: TransferOpts,
  ): Promise<{ attachments_sha256: string }> {
    if (!etag) throw new Error('etag_mismatch')
    const existing = await this.readMeta(id)
    if (!existing) throw new Error('book_not_found')
    if (existing.attachments_sha256 !== etag) throw new Error('etag_mismatch')
    const shas = normalizeShas(attachmentShas)
    const toUpload: [string, Uint8Array][] = []
    for (const sha of shas) {
      const path = this.blobPath(sha)
      if (await this.store.exists(path)) continue
      const data = blobs[sha]
      if (!data) throw new Error('attachment_missing')
      toUpload.push([sha, data])
    }

    opts?.onStage?.('attachments')
    const totalBytes = toUpload.reduce((sum, [, data]) => sum + data.byteLength, 0)
    let bytesCompleted = 0
    if (totalBytes > 0) opts?.onProgress?.({ loaded: 0, total: totalBytes })

    for (const [sha, data] of toUpload) {
      const size = data.byteLength
      try {
        await this.store.upload(this.blobPath(sha), data, {
          signal: opts?.signal,
          upsert: false,
          onProgress: (p) => {
            opts?.onProgress?.({
              loaded: bytesCompleted + p.loaded,
              total: totalBytes,
            })
          },
        })
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'duplicate') throw err
      }
      bytesCompleted += size
      opts?.onProgress?.({ loaded: bytesCompleted, total: totalBytes })
    }

    let attachmentsSize = 0
    for (const sha of shas) {
      const data = blobs[sha]
      if (data) attachmentsSize += data.byteLength
    }
    if (attachmentsSize === 0 && existing.attachments_size > 0 && shas.length > 0) {
      attachmentsSize = existing.attachments_size
    }

    const attSha = await attachmentSetEtag(shas)
    const meta: MetaFile = {
      ...existing,
      attachment_shas: shas,
      attachments_sha256: attSha,
      attachments_size: attachmentsSize,
      split_attachments: true,
      updated_at: new Date().toISOString(),
    }
    await this.writeMeta(meta, { signal: opts?.signal })
    return { attachments_sha256: attSha }
  }

  async remove(id: string): Promise<void> {
    const listed = await listAllObjects(this.store, this.bookDir(id))
    const paths = listed.map((row) => `${this.bookDir(id)}${row.name.replace(/^\//, '')}`)
    await this.store.remove(paths)
    await this.gcUnusedBlobs()
  }

  async gcUnusedBlobs(): Promise<number> {
    const rows = await listAllObjects(this.store, this.root)
    const bookIds = new Set<string>()
    for (const row of rows) {
      const name = row.name.replace(/^\//, '')
      const nested = name.match(/^([^/]+)\/meta\.json$/)
      if (nested?.[1] && nested[1] !== 'blobs') bookIds.add(nested[1])
    }

    const keep = new Set<string>()
    for (const bookId of bookIds) {
      let raw: { attachment_shas?: unknown }
      try {
        const bytes = await this.store.download(this.metaPath(bookId))
        raw = JSON.parse(new TextDecoder().decode(bytes)) as { attachment_shas?: unknown }
      } catch (err) {
        if (notFound(err, 'book_not_found')) continue
        throw err
      }
      if (!Array.isArray(raw.attachment_shas)) return 0
      for (const sha of raw.attachment_shas) {
        if (typeof sha === 'string' && SHA_RE.test(sha)) keep.add(sha)
      }
    }

    const blobRows = await listAllObjects(this.store, `${this.root}blobs/`)
    const stale = blobRows
      .map((row) => row.name.replace(/^\//, ''))
      .filter((name) => SHA_RE.test(name) && !keep.has(name))
    if (!stale.length) return 0
    await this.store.remove(stale.map((sha) => this.blobPath(sha)))
    return stale.length
  }
}
