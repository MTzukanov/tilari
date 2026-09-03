/**
 * Opaque .kitsas locker — lean ledger + TILARIAT attachment packs.
 * Separate from Ledger (no posting/SQL domain). Port of backend/app/locker.py.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  decodeAttachmentPack,
  encodeAttachmentPack,
  emptyAttachmentPack,
} from '../../../frontend/src/book/attPack.ts'
import { sha256hexSync } from '../../../frontend/src/book/sha256.ts'

const SHA_RE = /^[0-9a-f]{64}$/
const SAFE = /[^A-Za-z0-9._\-]+/g

export type LockerMeta = {
  id: string
  name: string
  size: number
  sha256: string
  attachments_sha256: string
  attachments_size: number
  split_attachments: boolean
  updated_at: string
}

export class LockerConflict extends Error {
  current: string
  kind: string
  constructor(current: string, kind = 'ledger') {
    super('etag_mismatch')
    this.name = 'LockerConflict'
    this.current = current
    this.kind = kind
  }
}

export class LockerNotFound extends Error {
  constructor() {
    super('book_not_found')
    this.name = 'LockerNotFound'
  }
}

export class LockerBadPack extends Error {
  detail: string
  constructor(detail: string) {
    super(detail)
    this.name = 'LockerBadPack'
    this.detail = detail
  }
}

function sha(data: Uint8Array | Buffer): string {
  if (data instanceof Buffer) return createHash('sha256').update(data).digest('hex')
  return sha256hexSync(data)
}

const EMPTY_PACK = emptyAttachmentPack()
export const EMPTY_PACK_SHA = sha(EMPTY_PACK)

let booksDirOverride: string | null = null

export function setBooksDir(dir: string | null): void {
  booksDirOverride = dir
}

export function booksDir(): string {
  const path =
    booksDirOverride ||
    process.env.KITSAS_BOOKS_DIR ||
    process.env.TILARI_BOOKS_DIR ||
    join(tmpdir(), 'tilari-books')
  mkdirSync(path, { recursive: true })
  return path
}

function metaPath(bookId: string): string {
  return join(booksDir(), `${bookId}.meta.json`)
}
function filePath(bookId: string): string {
  return join(booksDir(), `${bookId}.kitsas`)
}
function attachmentsDir(bookId: string): string {
  return join(booksDir(), `${bookId}.attachments`)
}

function readAttachmentBlobs(bookId: string): Record<string, Uint8Array> {
  const root = attachmentsDir(bookId)
  if (!existsSync(root)) return {}
  const out: Record<string, Uint8Array> = {}
  for (const name of readdirSync(root)) {
    if (SHA_RE.test(name)) out[name] = new Uint8Array(readFileSync(join(root, name)))
  }
  return out
}

function writeAttachmentBlobs(bookId: string, blobs: Record<string, Uint8Array>): void {
  const root = attachmentsDir(bookId)
  if (existsSync(root)) rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  for (const [s, data] of Object.entries(blobs)) {
    writeFileSync(join(root, s), data)
  }
}

function writeMeta(meta: LockerMeta): void {
  writeFileSync(metaPath(meta.id), JSON.stringify(meta), 'utf8')
}

function attachmentsShaFromDisk(bookId: string): string {
  return sha(encodeAttachmentPack(readAttachmentBlobs(bookId)))
}

function normalizeMeta(meta: LockerMeta, bookId: string): LockerMeta {
  let changed = false
  const m = { ...meta }
  if (m.split_attachments === undefined) {
    m.split_attachments = true
    changed = true
  }
  if (!m.attachments_sha256) {
    m.attachments_sha256 = existsSync(attachmentsDir(bookId))
      ? attachmentsShaFromDisk(bookId)
      : EMPTY_PACK_SHA
    changed = true
  }
  if (m.attachments_size === undefined) {
    m.attachments_size = encodeAttachmentPack(readAttachmentBlobs(bookId)).byteLength
    changed = true
  }
  if (changed) writeMeta(m)
  return m
}

function peekBook(bookId: string): { meta: LockerMeta; data: Buffer } | null {
  const mf = metaPath(bookId)
  const bf = filePath(bookId)
  if (!existsSync(mf) || !existsSync(bf)) return null
  try {
    const meta = normalizeMeta(JSON.parse(readFileSync(mf, 'utf8')) as LockerMeta, bookId)
    return { meta, data: readFileSync(bf) }
  } catch {
    return null
  }
}

function readMetaJson(bookId: string): LockerMeta | null {
  try {
    return JSON.parse(readFileSync(metaPath(bookId), 'utf8')) as LockerMeta
  } catch {
    return null
  }
}

/** Hash the kitsas file. Re-pack attachments only when they actually changed. */
function refreshMetaFromDisk(
  bookId: string,
  name?: string,
  opts?: { rehashAttachments?: boolean },
): LockerMeta {
  const data = readFileSync(filePath(bookId))
  const prev = readMetaJson(bookId)
  const rehash = opts?.rehashAttachments !== false
  let attachments_sha256: string
  let attachments_size: number
  if (!rehash && prev?.attachments_sha256) {
    attachments_sha256 = prev.attachments_sha256
    attachments_size = prev.attachments_size ?? 0
  } else {
    const pack = encodeAttachmentPack(readAttachmentBlobs(bookId))
    attachments_sha256 = sha(pack)
    attachments_size = pack.byteLength
  }
  const meta: LockerMeta = {
    id: bookId,
    name: name || prev?.name || `${bookId}.kitsas`,
    size: data.byteLength,
    sha256: sha(data),
    attachments_sha256,
    attachments_size,
    split_attachments: true,
    updated_at: new Date().toISOString(),
  }
  writeMeta(meta)
  return meta
}

type SplitResult = { extracted: boolean; vacuumed: boolean }

function syncMetaAfterSplit(bookId: string, split: SplitResult, name?: string): void {
  if (!split.extracted && !split.vacuumed) return
  refreshMetaFromDisk(bookId, name, { rehashAttachments: split.extracted })
}

/** Move Liite.data into attachments/, NULL blobs, VACUUM. */
function ensureLeanSplit(bookId: string): SplitResult {
  const none = { extracted: false, vacuumed: false }
  const path = filePath(bookId)
  if (!existsSync(path)) return none
  let extracted = false
  let vacuumed = false
  const db = new DatabaseSync(path)
  try {
    let rows: { id: number; sha: string | null; data: Buffer | null }[]
    try {
      rows = db
        .prepare('SELECT id, sha, data FROM Liite WHERE data IS NOT NULL')
        .all() as { id: number; sha: string | null; data: Buffer | null }[]
    } catch {
      return none
    }
    const flRow = db.prepare('PRAGMA freelist_count').get() as { freelist_count?: number } | undefined
    const freelistCount = Number(flRow?.freelist_count ?? 0)
    if (rows.length) {
      const blobs = readAttachmentBlobs(bookId)
      const upd = db.prepare('UPDATE Liite SET sha = ?, data = NULL WHERE id = ?')
      for (const row of rows) {
        if (!row.data) continue
        const blob = new Uint8Array(row.data)
        const s = row.sha && SHA_RE.test(String(row.sha)) ? String(row.sha) : sha(blob)
        blobs[s] = blob
        upd.run(s, row.id)
        extracted = true
      }
      if (extracted) writeAttachmentBlobs(bookId, blobs)
    }
    if (extracted || freelistCount > 0) {
      db.exec('VACUUM')
      vacuumed = true
    }
  } finally {
    db.close()
  }
  return { extracted, vacuumed }
}

export function listBooks(): LockerMeta[] {
  const dir = booksDir()
  const out: LockerMeta[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.meta.json')) continue
    try {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8')) as LockerMeta
      if (typeof data.id === 'string') out.push(normalizeMeta(data, data.id))
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  return out
}

export function getBook(bookId: string): { meta: LockerMeta; data: Buffer } | null {
  if (!peekBook(bookId)) return null
  syncMetaAfterSplit(bookId, ensureLeanSplit(bookId))
  return peekBook(bookId)
}

export function getAttachments(bookId: string): { meta: LockerMeta; pack: Uint8Array } | null {
  const found = getBook(bookId)
  if (!found) return null
  return { meta: found.meta, pack: encodeAttachmentPack(readAttachmentBlobs(bookId)) }
}

export function getAttachmentBlob(bookId: string, shaHex: string): Buffer | null {
  const s = shaHex.toLowerCase()
  if (!SHA_RE.test(s)) return null
  if (!peekBook(bookId)) return null
  syncMetaAfterSplit(bookId, ensureLeanSplit(bookId))
  const path = join(attachmentsDir(bookId), s)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

export function putBook(
  data: Uint8Array,
  opts: { name: string; bookId?: string; ifMatch?: string | null },
): LockerMeta {
  let name = opts.name
  if (!name.toLowerCase().endsWith('.kitsas')) {
    name = name ? `${name}.kitsas` : 'book.kitsas'
  }
  name = basename(name).replace(SAFE, '_') || 'book.kitsas'
  const bookId = opts.bookId ?? randomUUID().replaceAll('-', '')
  const existing = peekBook(bookId)
  if (existing) {
    const expected = (opts.ifMatch || '').trim().replaceAll('"', '')
    const current = existing.meta.sha256
    if (!expected || current !== expected) throw new LockerConflict(current)
  }
  writeFileSync(filePath(bookId), data)
  const split = ensureLeanSplit(bookId)
  return refreshMetaFromDisk(bookId, name, {
    rehashAttachments: split.extracted || !existing?.meta.attachments_sha256,
  })
}

export function putAttachments(
  pack: Uint8Array,
  opts: { bookId: string; ifMatch?: string | null },
): LockerMeta {
  const existing = peekBook(opts.bookId)
  if (!existing) throw new LockerNotFound()
  const expected = (opts.ifMatch || '').trim().replaceAll('"', '')
  const current = existing.meta.attachments_sha256
  if (!expected || current !== expected) throw new LockerConflict(current, 'attachments')
  let blobs: Map<string, Uint8Array>
  try {
    blobs = decodeAttachmentPack(pack)
    for (const [s, data] of blobs) {
      if (sha(data) !== s) throw new Error('sha_mismatch')
    }
  } catch (err) {
    throw new LockerBadPack(err instanceof Error ? err.message : String(err))
  }
  writeAttachmentBlobs(opts.bookId, Object.fromEntries(blobs))
  const attSha = sha(pack)
  const meta: LockerMeta = {
    ...existing.meta,
    attachments_sha256: attSha,
    attachments_size: pack.byteLength,
    split_attachments: true,
    updated_at: new Date().toISOString(),
  }
  writeMeta(meta)
  return meta
}
