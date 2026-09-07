import type { TransferOpts } from '../../http'

export type ListOpts = { limit?: number; offset?: number }

export type LockerObjectStore = {
  list(prefix: string, opts?: ListOpts): Promise<{ name: string }[]>
  /** True if the object exists (ciphertext presence; no download). */
  exists(path: string, opts?: { signal?: AbortSignal }): Promise<boolean>
  download(path: string, opts?: TransferOpts): Promise<Uint8Array>
  upload(
    path: string,
    data: Uint8Array,
    opts?: TransferOpts & { upsert?: boolean; contentType?: string },
  ): Promise<void>
  remove(paths: string[]): Promise<void>
}

/** Page through list until a short page is returned. */
export async function listAllObjects(
  store: LockerObjectStore,
  prefix: string,
  pageSize = 1000,
): Promise<{ name: string }[]> {
  const out: { name: string }[] = []
  let offset = 0
  for (;;) {
    const page = await store.list(prefix, { limit: pageSize, offset })
    out.push(...page)
    if (page.length < pageSize) break
    offset += page.length
  }
  return out
}

/** In-memory Storage stand-in for tests (no Node, no network). */
export class MemoryObjectStore implements LockerObjectStore {
  readonly files = new Map<string, Uint8Array>()

  async list(prefix: string, opts?: ListOpts): Promise<{ name: string }[]> {
    const out: { name: string }[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) out.push({ name: key.slice(prefix.length) })
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
    return data
  }

  async upload(
    path: string,
    data: Uint8Array,
    opts?: { upsert?: boolean },
  ): Promise<void> {
    if (!opts?.upsert && this.files.has(path)) throw new Error('duplicate')
    this.files.set(path, data)
  }

  async remove(paths: string[]): Promise<void> {
    for (const path of paths) this.files.delete(path)
  }
}
