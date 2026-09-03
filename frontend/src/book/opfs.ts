/** Persist the working .kitsas copy in OPFS. No-ops when OPFS is unavailable. */

import type { SessionChange } from './sessionLog'

export const OPFS_ROOT_DIR = 'tilari'
export const OPFS_BLOBS_DIR = 'blobs'

export type OpfsMeta = {
  bookId: string
  sourceName: string
  dbPath: string
  sessionId: string
  dirty: boolean
  attachmentsDirty: boolean
  backupDone: boolean
  lockerId?: string
  etag?: string
  attachmentsEtag?: string
  largeFile?: boolean
  attachmentSync?: 'idle' | 'syncing' | 'ready' | 'error'
  attachmentShas?: string[]
  sessionChanges?: SessionChange[]
}

export type OpfsEntry = {
  path: string
  bytes: number
}

export type OpfsListProgress = {
  files: number
  bytes: number
  total?: number
}

const YIELD_EVERY = 32

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function root(create = true): Promise<FileSystemDirectoryHandle | null> {
  const nav = globalThis.navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
  }
  if (!nav.storage?.getDirectory) return null
  try {
    const opfs = await Promise.race([
      nav.storage.getDirectory(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('opfs getDirectory timeout')), 2_000)
      }),
    ])
    return opfs.getDirectoryHandle(OPFS_ROOT_DIR, { create })
  } catch {
    return null
  }
}

async function bookDir(bookId: string, create = true): Promise<FileSystemDirectoryHandle | null> {
  const base = await root(create)
  if (!base) return null
  try {
    return await base.getDirectoryHandle(bookId, { create })
  } catch {
    return null
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(data as BufferSource)
  await w.close()
}

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const fh = await dir.getFileHandle(name)
    const file = await fh.getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null
  }
}

export async function opfsSaveWorking(meta: OpfsMeta, bytes: Uint8Array): Promise<void> {
  const dir = await bookDir(meta.bookId)
  if (!dir) return
  await writeFile(dir, 'working.kitsas', bytes)
  await writeFile(dir, 'meta.json', new TextEncoder().encode(JSON.stringify(meta)))
}

export async function opfsSaveOriginal(bookId: string, bytes: Uint8Array): Promise<void> {
  const dir = await bookDir(bookId)
  if (!dir) return
  await writeFile(dir, 'original.kitsas', bytes)
}

export async function opfsLoadOriginal(bookId: string): Promise<Uint8Array | null> {
  const dir = await bookDir(bookId, false)
  if (!dir) return null
  return readFile(dir, 'original.kitsas')
}

/** Restore OPFS copy matching a saved browser session (preferred over opfsLoadLatest). */
export async function opfsLoadForSession(opts: {
  sessionId?: string
  dbPath?: string
}): Promise<{ meta: OpfsMeta; bytes: Uint8Array } | null> {
  const base = await root(false)
  if (!base) return null
  let byPath: { meta: OpfsMeta; bytes: Uint8Array } | null = null
  for await (const [name, handle] of base.entries()) {
    if (handle.kind !== 'directory' || name === OPFS_BLOBS_DIR) continue
    const dir = await bookDir(name, false)
    if (!dir) continue
    const metaBytes = await readFile(dir, 'meta.json')
    const bytes = await readFile(dir, 'working.kitsas')
    if (!metaBytes || !bytes) continue
    try {
      const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as OpfsMeta
      if (opts.sessionId && meta.sessionId === opts.sessionId) {
        return { meta, bytes }
      }
      if (opts.dbPath && meta.dbPath === opts.dbPath) {
        byPath = { meta, bytes }
      }
    } catch {
      /* ignore corrupt meta */
    }
  }
  return byPath
}

export async function opfsLoadLatest(): Promise<{ meta: OpfsMeta; bytes: Uint8Array } | null> {
  const base = await root()
  if (!base) return null
  const ids: string[] = []
  for await (const [name, handle] of base.entries()) {
    if (handle.kind === 'directory' && name !== OPFS_BLOBS_DIR) ids.push(name)
  }
  if (!ids.length) return null
  ids.sort()
  const bookId = ids[ids.length - 1]
  const dir = await bookDir(bookId, false)
  if (!dir) return null
  const metaBytes = await readFile(dir, 'meta.json')
  const bytes = await readFile(dir, 'working.kitsas')
  if (!metaBytes || !bytes) return null
  try {
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as OpfsMeta
    return { meta, bytes }
  } catch {
    return null
  }
}

export async function opfsClear(): Promise<void> {
  const base = await root(false)
  if (!base) return
  const names: string[] = []
  for await (const [name] of base.entries()) names.push(name)
  for (const name of names) {
    try {
      await base.removeEntry(name, { recursive: true })
    } catch {
      /* ignore */
    }
  }
}

/** Remove session folders; keep `tilari/blobs/`. */
export async function opfsClearSessions(): Promise<void> {
  const base = await root(false)
  if (!base) return
  const names: string[] = []
  for await (const [name] of base.entries()) {
    if (name !== OPFS_BLOBS_DIR) names.push(name)
  }
  for (const name of names) {
    try {
      await base.removeEntry(name, { recursive: true })
    } catch {
      /* ignore */
    }
  }
}

export async function opfsListSessionMetas(): Promise<OpfsMeta[]> {
  const base = await root(false)
  if (!base) return []
  const out: OpfsMeta[] = []
  for await (const [name, handle] of base.entries()) {
    if (handle.kind !== 'directory' || name === OPFS_BLOBS_DIR) continue
    const meta = await opfsLoadMeta(name)
    if (meta) out.push(meta)
  }
  return out
}

function splitRelativePath(relativePath: string): string[] | null {
  const parts = relativePath.split('/').filter(Boolean)
  if (!parts.length) return null
  if (parts.some((part) => part === '.' || part === '..')) return null
  return parts
}

type PendingFile = { path: string; handle: FileSystemFileHandle }

async function walkHandles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: PendingFile[],
  onProgress?: (files: number) => void | Promise<void>,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      await walkHandles(handle, path, out, onProgress)
      continue
    }
    out.push({ path, handle })
    if (out.length % YIELD_EVERY === 0) {
      await onProgress?.(out.length)
      await yieldToUi()
    }
  }
}

/** Walk `tilari/` without creating it. Yields so the UI can show progress. */
export async function opfsList(
  onProgress?: (progress: OpfsListProgress) => void,
): Promise<OpfsEntry[]> {
  const base = await root(false)
  if (!base) return []
  const pending: PendingFile[] = []
  await walkHandles(base, '', pending, (files) => {
    onProgress?.({ files, bytes: 0 })
  })
  onProgress?.({ files: 0, bytes: 0, total: pending.length })
  const out: OpfsEntry[] = []
  let bytes = 0
  for (let i = 0; i < pending.length; i += 1) {
    try {
      const file = await pending[i].handle.getFile()
      bytes += file.size
      out.push({ path: pending[i].path, bytes: file.size })
    } catch {
      /* skip unreadable */
    }
    if (i % YIELD_EVERY === 0 || i === pending.length - 1) {
      onProgress?.({ files: i + 1, bytes, total: pending.length })
      await yieldToUi()
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out
}

export async function opfsLoadMeta(bookId: string): Promise<OpfsMeta | null> {
  const dir = await bookDir(bookId, false)
  if (!dir) return null
  const bytes = await readFile(dir, 'meta.json')
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as OpfsMeta
  } catch {
    return null
  }
}

/** Remove a file or directory under `tilari/`. No-ops on missing or invalid paths. */
export async function opfsRemove(relativePath: string): Promise<void> {
  const parts = splitRelativePath(relativePath)
  if (!parts) return
  const base = await root(false)
  if (!base) return
  try {
    let dir = base
    for (let i = 0; i < parts.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(parts[i], { create: false })
    }
    await dir.removeEntry(parts[parts.length - 1], { recursive: true })
  } catch {
    /* ignore */
  }
}
