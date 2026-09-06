/**
 * Thin filesystem object store under booksDir() for wasm ObjectStoreLockerBackend.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { booksDir } from './store.ts'

export class ObjectPathError extends Error {
  constructor(message = 'invalid_path') {
    super(message)
    this.name = 'ObjectPathError'
  }
}

function assertSafeRel(rel: string): string {
  const cleaned = rel.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\0/g, '')
  if (!cleaned || cleaned.split('/').some((p) => p === '..' || p === '')) {
    // allow empty only for list root — callers handle that
    if (cleaned === '') return ''
    throw new ObjectPathError()
  }
  if (cleaned.includes('..')) throw new ObjectPathError()
  return cleaned
}

/** Absolute path under booksDir; rejects escapes. */
export function resolveObjectPath(rel: string): string {
  const cleaned = assertSafeRel(rel)
  if (!cleaned) throw new ObjectPathError()
  const root = resolve(booksDir()) + sep
  const full = resolve(join(booksDir(), cleaned))
  if (!full.startsWith(root) && full !== root.slice(0, -1)) throw new ObjectPathError()
  return full
}

export function objectExists(rel: string): boolean {
  try {
    const path = resolveObjectPath(rel)
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

export function objectDownload(rel: string): Buffer | null {
  try {
    const path = resolveObjectPath(rel)
    if (!existsSync(path) || !statSync(path).isFile()) return null
    return readFileSync(path)
  } catch (err) {
    if (err instanceof ObjectPathError) throw err
    return null
  }
}

export function objectUpload(rel: string, data: Uint8Array, opts?: { upsert?: boolean }): void {
  const path = resolveObjectPath(rel)
  if (existsSync(path) && !opts?.upsert) {
    const err = new Error('duplicate')
    err.name = 'ObjectDuplicate'
    throw err
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

export function objectRemove(rels: string[]): void {
  for (const rel of rels) {
    try {
      const path = resolveObjectPath(rel)
      if (!existsSync(path)) continue
      rmSync(path, { recursive: true, force: true })
    } catch (err) {
      if (err instanceof ObjectPathError) throw err
    }
  }
}

/**
 * List files under prefix. Returns names relative to prefix
 * (same contract as MemoryObjectStore / Supabase list).
 */
export function objectList(
  prefix: string,
  opts?: { limit?: number; offset?: number },
): { name: string }[] {
  const cleaned = prefix.replace(/^\/+/, '').replace(/\\/g, '/')
  if (cleaned.includes('..')) throw new ObjectPathError()

  const root = resolve(booksDir())
  const dir = cleaned
    ? resolve(join(booksDir(), cleaned.replace(/\/$/, '') || '.'))
    : root
  if (!dir.startsWith(root + sep) && dir !== root) throw new ObjectPathError()
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []

  const out: { name: string }[] = []
  function walk(current: string, rel: string) {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      const childRel = rel ? `${rel}/${name}` : name
      const st = statSync(full)
      if (st.isDirectory()) walk(full, childRel)
      else out.push({ name: childRel })
    }
  }
  walk(dir, '')
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const offset = opts?.offset ?? 0
  const limit = opts?.limit
  if (limit == null) return out.slice(offset)
  return out.slice(offset, offset + limit)
}
