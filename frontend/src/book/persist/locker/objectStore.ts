import { sha256hexSync } from '../../sha256'
import type { TransferOpts } from '../../http'

export type ListOpts = { limit?: number; offset?: number }

/** `updated_at` (ISO) when the backend reports it; used to spare fresh blobs from GC. */
export type ObjectRow = { name: string; updated_at?: string }

export type LockerObjectStore = {
  list(prefix: string, opts?: ListOpts): Promise<ObjectRow[]>
  /** True if the object exists (ciphertext presence; no download). */
  exists(path: string, opts?: { signal?: AbortSignal }): Promise<boolean>
  download(path: string, opts?: TransferOpts): Promise<Uint8Array>
  upload(
    path: string,
    data: Uint8Array,
    opts?: TransferOpts & { upsert?: boolean; contentType?: string; ifMatch?: string },
  ): Promise<void>
  remove(paths: string[]): Promise<void>
  /**
   * Server ETag of `path` as last downloaded/uploaded here, for an atomic `ifMatch` upload.
   * Absent when the backend has no conditional writes (Supabase).
   */
  etagOf?(path: string): string | undefined
}

/** Page through list until a short page is returned. */
export async function listAllObjects(
  store: LockerObjectStore,
  prefix: string,
  pageSize = 1000,
): Promise<ObjectRow[]> {
  const out: ObjectRow[] = []
  let offset = 0
  for (;;) {
    const page = await store.list(prefix, { limit: pageSize, offset })
    out.push(...page)
    if (page.length < pageSize) break
    offset += page.length
  }
  return out
}

/**
 * In-memory Storage stand-in for tests (no Node, no network). Behaves like the Node object
 * store: ETags (sha256), atomic `ifMatch`, `updated_at` in listings. Instances sharing `files`
 * act like two browser tabs (each remembers its own ETags).
 */
export class MemoryObjectStore implements LockerObjectStore {
  readonly files: Map<string, Uint8Array>
  readonly times: Map<string, string>
  private etags = new Map<string, string>()

  constructor(shared?: { files: Map<string, Uint8Array>; times: Map<string, string> }) {
    this.files = shared?.files ?? new Map()
    this.times = shared?.times ?? new Map()
  }

  etagOf(path: string): string | undefined {
    return this.etags.get(path)
  }

  async list(prefix: string, opts?: ListOpts): Promise<ObjectRow[]> {
    const out: ObjectRow[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const at = this.times.get(key)
        out.push({ name: key.slice(prefix.length), ...(at ? { updated_at: at } : {}) })
      }
    }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const offset = opts?.offset ?? 0
    const limit = opts?.limit
    if (limit == null) return out.slice(offset)
    return out.slice(offset, offset + limit)
  }

  async exists(path: string, opts?: { signal?: AbortSignal }): Promise<boolean> {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return this.files.has(path)
  }

  async download(path: string): Promise<Uint8Array> {
    const data = this.files.get(path)
    if (!data) throw new Error('not_found')
    this.etags.set(path, sha256hexSync(data))
    return data
  }

  async upload(
    path: string,
    data: Uint8Array,
    opts?: { upsert?: boolean; ifMatch?: string },
  ): Promise<void> {
    await Promise.resolve()
    const current = this.files.get(path)
    if (opts?.ifMatch) {
      if (!current || sha256hexSync(current) !== opts.ifMatch) throw new Error('etag_mismatch')
    } else if (!opts?.upsert && current) {
      throw new Error('duplicate')
    }
    this.files.set(path, data)
    this.times.set(path, new Date().toISOString())
    this.etags.set(path, sha256hexSync(data))
  }

  async remove(paths: string[]): Promise<void> {
    for (const path of paths) {
      this.files.delete(path)
      this.times.delete(path)
    }
  }
}
