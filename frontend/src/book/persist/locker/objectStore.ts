import type { TransferOpts } from '../../http'

export type LockerObjectStore = {
  list(prefix: string): Promise<{ name: string }[]>
  download(path: string, opts?: TransferOpts): Promise<Uint8Array>
  upload(
    path: string,
    data: Uint8Array,
    opts?: TransferOpts & { upsert?: boolean; contentType?: string },
  ): Promise<void>
  remove(paths: string[]): Promise<void>
}

/** In-memory Storage stand-in for tests (no Node, no network). */
export class MemoryObjectStore implements LockerObjectStore {
  readonly files = new Map<string, Uint8Array>()

  async list(prefix: string): Promise<{ name: string }[]> {
    const out: { name: string }[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) out.push({ name: key.slice(prefix.length) })
    }
    return out
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
