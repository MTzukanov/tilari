/**
 * File handles of books opened from this device, keyed by book path (`local:` / `server:`), so a
 * recent book reopens without the picker and a restored working copy stays linked to its file.
 * Only browsers with the File System Access API hand out handles (Chromium); elsewhere every
 * call is a no-op. Failures never throw: a missing handle just means "pick the file again".
 */
const DB_NAME = 'tilari-handles'
const STORE = 'handles'

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      tx.oncomplete = () => {
        db.close()
        resolve(req.result ?? null)
      }
      tx.onerror = tx.onabort = () => {
        db.close()
        resolve(null)
      }
    } catch {
      db.close()
      resolve(null)
    }
  })
}

export async function saveFileHandle(path: string, handle: FileSystemFileHandle): Promise<void> {
  if (!path) return
  await withStore('readwrite', (store) => store.put(handle, path))
}

export async function loadFileHandle(path: string): Promise<FileSystemFileHandle | null> {
  if (!path) return null
  const value = await withStore<unknown>('readonly', (store) => store.get(path))
  if (value && typeof value === 'object' && 'getFile' in value) return value as FileSystemFileHandle
  return null
}

export async function deleteFileHandle(path: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(path))
}

/** Drop handles of books no longer in the recent list. */
export async function keepFileHandles(paths: readonly string[]): Promise<void> {
  const keys = await withStore('readonly', (store) => store.getAllKeys())
  const keep = new Set(paths)
  for (const key of keys ?? []) {
    if (typeof key === 'string' && !keep.has(key)) await deleteFileHandle(key)
  }
}

export async function clearFileHandles(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}

/** Read/write access to a remembered file; asks the user when needed (call from a click). */
export async function ensureFilePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const mode = { mode: 'readwrite' as const }
  try {
    if (typeof handle.queryPermission === 'function' && (await handle.queryPermission(mode)) === 'granted') {
      return true
    }
    return (await handle.requestPermission(mode)) === 'granted'
  } catch {
    return false
  }
}
