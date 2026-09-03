/** In-memory + OPFS content-addressed attachment store (sha -> bytes). */

import { encodeAttachmentPack } from './attPack'
import { OPFS_BLOBS_DIR, OPFS_ROOT_DIR, opfsListSessionMetas } from './opfs'

export const SHA_RE = /^[0-9a-f]{64}$/

export function collectBlobKeepSet(
  live: Iterable<string>,
  metas: Array<{ attachmentShas?: string[] } | null | undefined>,
): Set<string> {
  const keep = new Set<string>()
  for (const sha of live) {
    if (SHA_RE.test(sha)) keep.add(sha)
  }
  for (const meta of metas) {
    for (const sha of meta?.attachmentShas ?? []) {
      if (SHA_RE.test(sha)) keep.add(sha)
    }
  }
  return keep
}

export function unreferencedBlobNames(onDisk: Iterable<string>, keep: Set<string>): string[] {
  return [...onDisk].filter((name) => SHA_RE.test(name) && !keep.has(name))
}

export function blobsToWrite(existing: Iterable<string>, keys: Iterable<string>): string[] {
  const have = new Set(existing)
  return [...keys].filter((sha) => SHA_RE.test(sha) && !have.has(sha))
}

async function tilariRoot(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const nav = globalThis.navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
  }
  if (!nav.storage?.getDirectory) return null
  try {
    const opfs = await nav.storage.getDirectory()
    return opfs.getDirectoryHandle(OPFS_ROOT_DIR, { create })
  } catch {
    return null
  }
}

async function blobsDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await tilariRoot(create)
  if (!root) return null
  try {
    return await root.getDirectoryHandle(OPFS_BLOBS_DIR, { create })
  } catch {
    return null
  }
}

export async function sweepUnreferencedBlobs(extraKeep: Iterable<string> = []): Promise<number> {
  const metas = await opfsListSessionMetas()
  // Pre-cache sessions have no sha list; do not guess what they still need.
  if (metas.some((meta) => !meta.attachmentShas)) return 0
  return gcOpfsBlobs(collectBlobKeepSet(extraKeep, metas))
}

export async function gcOpfsBlobs(keep: Set<string>): Promise<number> {
  const dir = await blobsDir(false)
  if (!dir) return 0
  const names: string[] = []
  for await (const [name] of dir.entries()) names.push(name)
  const stale = unreferencedBlobNames(names, keep)
  let removed = 0
  for (const name of stale) {
    try {
      await dir.removeEntry(name)
      removed += 1
    } catch {
      /* ignore */
    }
  }
  return removed
}

export class AttachmentStore {
  private mem = new Map<string, Uint8Array>()
  private bookId = ''
  private opfsDirty = false

  clear() {
    this.mem.clear()
    this.bookId = ''
    this.opfsDirty = false
  }

  opfsNeedsPersist(): boolean {
    return this.opfsDirty
  }

  bindBook(bookId: string) {
    this.bookId = bookId
  }

  has(sha: string): boolean {
    return this.mem.has(sha)
  }

  get(sha: string): Uint8Array | undefined {
    return this.mem.get(sha)
  }

  /** Returns true if this was a new blob (store grew). */
  put(sha: string, data: Uint8Array): boolean {
    if (this.mem.has(sha)) return false
    this.mem.set(sha, data)
    this.opfsDirty = true
    return true
  }

  merge(blobs: Map<string, Uint8Array> | Iterable<[string, Uint8Array]>): number {
    let added = 0
    for (const [sha, data] of blobs) {
      if (this.put(sha, data)) added += 1
    }
    return added
  }

  keys(): string[] {
    return [...this.mem.keys()].sort()
  }

  size(): number {
    return this.mem.size
  }

  byteSize(): number {
    let bytes = 0
    for (const data of this.mem.values()) bytes += data.byteLength
    return bytes
  }

  /** Drop blobs that are no longer referenced. Returns true if anything was removed. */
  retain(live: Set<string>): boolean {
    let changed = false
    for (const sha of [...this.mem.keys()]) {
      if (!live.has(sha)) {
        this.mem.delete(sha)
        changed = true
      }
    }
    if (changed) this.opfsDirty = true
    return changed
  }

  toPack(): Uint8Array {
    return encodeAttachmentPack(this.mem)
  }

  /** Move every leftover `{bookId}/attachments/` into `tilari/blobs/`. */
  async migrateAllLegacy(): Promise<void> {
    const root = await tilariRoot(false)
    if (!root) return
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory' || name === OPFS_BLOBS_DIR) continue
      await this.migrateLegacy(name)
    }
  }

  /** Copy leftover `{bookId}/attachments/{sha}` into `tilari/blobs/`, then drop the old dir. */
  async migrateLegacy(bookId = this.bookId): Promise<void> {
    if (!bookId) return
    const root = await tilariRoot(false)
    if (!root) return
    let book: FileSystemDirectoryHandle
    let att: FileSystemDirectoryHandle
    try {
      book = await root.getDirectoryHandle(bookId, { create: false })
      att = await book.getDirectoryHandle('attachments', { create: false })
    } catch {
      return
    }
    const dest = await blobsDir(true)
    if (!dest) return
    for await (const [name, handle] of att.entries()) {
      if (handle.kind !== 'file' || !SHA_RE.test(name)) continue
      try {
        await dest.getFileHandle(name)
        continue
      } catch {
        /* copy */
      }
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const fh = await dest.getFileHandle(name, { create: true })
        const w = await fh.createWritable()
        await w.write(new Uint8Array(await file.arrayBuffer()) as BufferSource)
        await w.close()
      } catch {
        /* skip */
      }
    }
    try {
      await book.removeEntry('attachments', { recursive: true })
    } catch {
      /* ignore */
    }
  }

  async persist(
    onProgress?: (loaded: number, total: number) => void,
    isCancelled?: () => boolean,
  ): Promise<void> {
    const dir = await blobsDir(true)
    if (!dir) return
    const total = this.byteSize()
    let loaded = 0
    const report = () => onProgress?.(loaded, total)
    report()
    const existing = new Set<string>()
    for await (const [name] of dir.entries()) {
      if (isCancelled?.()) return
      existing.add(name)
    }
    const pending = blobsToWrite(existing, this.mem.keys())
    const skip = new Set(pending)
    for (const [sha, data] of this.mem) {
      if (isCancelled?.()) return
      if (!skip.has(sha)) {
        loaded += data.byteLength
        report()
        continue
      }
      const fh = await dir.getFileHandle(sha, { create: true })
      const w = await fh.createWritable()
      await w.write(data as BufferSource)
      await w.close()
      loaded += data.byteLength
      report()
    }
    this.opfsDirty = false
  }

  /** Load only the named SHAs from `tilari/blobs/`. Does not clear other in-memory entries. */
  async loadShas(shas: string[]): Promise<void> {
    const dir = await blobsDir(false)
    if (!dir) return
    for (const sha of shas) {
      if (!SHA_RE.test(sha) || this.mem.has(sha)) continue
      try {
        const fh = await dir.getFileHandle(sha)
        const file = await fh.getFile()
        this.mem.set(sha, new Uint8Array(await file.arrayBuffer()))
      } catch {
        /* missing */
      }
    }
  }
}
