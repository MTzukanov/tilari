/** Inventory and wipe of Tilari-owned browser storage (web storage + OPFS). */

import { getBcp47 } from '../../i18n'
import { OPFS_BLOBS_DIR, opfsList, opfsLoadMeta, type OpfsEntry, type OpfsListProgress, type OpfsMeta } from '../../book/opfs'

export type { OpfsListProgress }

export const TILARI_STORAGE_PREFIX = 'tilari.'

export type WebStorageKind = 'local' | 'session'

export type WebStorageItem = {
  kind: WebStorageKind
  key: string
  value: string
  bytes: number
}

export type OpfsBookGroup = {
  bookId: string
  files: OpfsEntry[]
  bytes: number
  meta: OpfsMeta | null
  inUse: boolean
}

export type OpfsBlobPool = {
  files: OpfsEntry[]
  bytes: number
}

export type OpfsInventory = {
  books: OpfsBookGroup[]
  blobs: OpfsBlobPool
}

export type QuotaEstimate = {
  usage: number
  quota: number
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function formatBytes(bytes: number, locale = getBcp47()): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: bytes >= 1024 ? 1 : 0 })
  if (bytes < 1024) return `${nf.format(bytes)} B`
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KiB`
  return `${nf.format(bytes / (1024 * 1024))} MiB`
}

export function truncateValue(value: string, max = 80): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

export function liveOpfsBookId(dbPath: string | null | undefined): string | null {
  if (!dbPath) return null
  const m = dbPath.match(/^local:([^/]+)\//)
  return m?.[1] ?? null
}

export function isLiveOpfsBook(
  bookId: string,
  meta: { sessionId?: string; dbPath?: string } | null,
  open: { db_path: string; session_id: string } | null,
): boolean {
  if (!open) return false
  if (meta?.sessionId && meta.sessionId === open.session_id) return true
  if (meta?.dbPath && meta.dbPath === open.db_path) return true
  return liveOpfsBookId(open.db_path) === bookId
}

function listStore(store: Storage, kind: WebStorageKind): WebStorageItem[] {
  const out: WebStorageItem[] = []
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i)
    if (!key?.startsWith(TILARI_STORAGE_PREFIX)) continue
    const value = store.getItem(key) ?? ''
    out.push({ kind, key, value, bytes: utf8Bytes(key) + utf8Bytes(value) })
  }
  return out
}

export function listTilariWebStorage(): WebStorageItem[] {
  const items: WebStorageItem[] = []
  try {
    items.push(...listStore(localStorage, 'local'))
  } catch {
    /* private mode */
  }
  try {
    items.push(...listStore(sessionStorage, 'session'))
  } catch {
    /* private mode */
  }
  items.sort((a, b) => a.key.localeCompare(b.key) || a.kind.localeCompare(b.kind))
  return items
}

export function removeTilariWebStorageKey(kind: WebStorageKind, key: string): void {
  if (!key.startsWith(TILARI_STORAGE_PREFIX)) return
  try {
    if (kind === 'local') localStorage.removeItem(key)
    else sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function clearTilariWebStorage(): void {
  for (const item of listTilariWebStorage()) {
    removeTilariWebStorageKey(item.kind, item.key)
  }
}

export async function estimateOriginQuota(): Promise<QuotaEstimate | null> {
  const estimate = globalThis.navigator?.storage?.estimate
  if (!estimate) return null
  try {
    const { usage, quota } = await estimate.call(navigator.storage)
    if (usage == null || quota == null) return null
    return { usage, quota }
  } catch {
    return null
  }
}

export function groupOpfsBlobs(files: OpfsEntry[]): OpfsEntry[] {
  return files.filter((file) => (file.path.split('/')[0] || file.path) === OPFS_BLOBS_DIR)
}

export function groupOpfsFiles(files: OpfsEntry[]): { bookId: string; files: OpfsEntry[]; bytes: number }[] {
  const map = new Map<string, OpfsEntry[]>()
  for (const file of files) {
    const bookId = file.path.split('/')[0] || file.path
    if (bookId === OPFS_BLOBS_DIR) continue
    const list = map.get(bookId) ?? []
    list.push(file)
    map.set(bookId, list)
  }
  return [...map.entries()]
    .map(([bookId, groupFiles]) => ({
      bookId,
      files: groupFiles,
      bytes: groupFiles.reduce((sum, file) => sum + file.bytes, 0),
    }))
    .sort((a, b) => a.bookId.localeCompare(b.bookId))
}

export async function listOpfsBooks(
  open: { db_path: string; session_id: string } | null,
  onProgress?: (progress: OpfsListProgress) => void,
): Promise<OpfsBookGroup[]> {
  const listed = await listOpfsInventory(open, onProgress)
  return listed.books
}

export async function listOpfsInventory(
  open: { db_path: string; session_id: string } | null,
  onProgress?: (progress: OpfsListProgress) => void,
): Promise<OpfsInventory> {
  const files = await opfsList(onProgress)
  const blobFiles = groupOpfsBlobs(files)
  const groups = groupOpfsFiles(files)
  const books = await Promise.all(
    groups.map(async (group) => {
      const meta = await opfsLoadMeta(group.bookId)
      return {
        ...group,
        meta,
        inUse: isLiveOpfsBook(group.bookId, meta, open),
      }
    }),
  )
  return {
    books,
    blobs: {
      files: blobFiles,
      bytes: blobFiles.reduce((sum, file) => sum + file.bytes, 0),
    },
  }
}

export function opfsAvailable(): boolean {
  const nav = globalThis.navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
  }
  return typeof nav.storage?.getDirectory === 'function'
}
