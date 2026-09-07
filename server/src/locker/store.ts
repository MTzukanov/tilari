/**
 * Node shelf — one on-disk layout shared with wasm BYO /api/objects:
 *   {booksDir}/tilari/{id}/book.kitsas
 *   {booksDir}/tilari/{id}/meta.json
 *   {booksDir}/tilari/blobs/{sha}
 *
 * /api/books* is a façade over this layout (TILARIAT packs on the wire).
 * Separate from Ledger (no posting/SQL domain).
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

/** Default object-store path prefix (same as frontend DEFAULT_STORAGE_PATH). */
export const SHELF_PREFIX = 'tilari'

export type LockerMeta = {
  id: string
  name: string
  size: number
  sha256: string
  attachments_sha256: string
  attachments_size: number
  attachment_shas?: string[]
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

function shelfRoot(): string {
  const root = join(booksDir(), SHELF_PREFIX)
  mkdirSync(root, { recursive: true })
  return root
}

function bookDir(bookId: string): string {
  return join(shelfRoot(), bookId)
}

function metaPath(bookId: string): string {
  return join(bookDir(bookId), 'meta.json')
}

function filePath(bookId: string): string {
  return join(bookDir(bookId), 'book.kitsas')
}

function blobsDir(): string {
  const dir = join(shelfRoot(), 'blobs')
  mkdirSync(dir, { recursive: true })
  return dir
}

function blobPath(shaHex: string): string {
  return join(blobsDir(), shaHex)
}

function normalizeShas(shas: Iterable<string> | undefined): string[] {
  if (!shas) return []
  return [...new Set([...shas].map((s) => s.toLowerCase()).filter((s) => SHA_RE.test(s)))].sort()
}

function readAttachmentBlobs(bookId: string, shas?: string[]): Record<string, Uint8Array> {
  const list = shas ?? normalizeShas(readMetaJson(bookId)?.attachment_shas)
  const out: Record<string, Uint8Array> = {}
  for (const s of list) {
    const path = blobPath(s)
    if (existsSync(path)) out[s] = new Uint8Array(readFileSync(path))
  }
  return out
}

function writeAttachmentBlobs(blobs: Record<string, Uint8Array>): void {
  for (const [s, data] of Object.entries(blobs)) {
    const path = blobPath(s)
    if (!existsSync(path)) writeFileSync(path, data)
  }
}

function writeMeta(meta: LockerMeta): void {
  mkdirSync(bookDir(meta.id), { recursive: true })
  const normalized: LockerMeta = {
    ...meta,
    attachment_shas: normalizeShas(meta.attachment_shas),
  }
  writeFileSync(metaPath(meta.id), JSON.stringify(normalized), 'utf8')
}

function attachmentsShaFromDisk(bookId: string, shas: string[]): string {
  return sha(encodeAttachmentPack(readAttachmentBlobs(bookId, shas)))
}

function normalizeMeta(meta: LockerMeta, bookId: string): LockerMeta {
  let changed = false
  const m = { ...meta, id: bookId }
  if (m.split_attachments === undefined) {
    m.split_attachments = true
    changed = true
  }
  if (!Array.isArray(m.attachment_shas)) {
    m.attachment_shas = []
    changed = true
  } else {
    const norm = normalizeShas(m.attachment_shas)
    if (norm.join(',') !== m.attachment_shas.join(',')) {
      m.attachment_shas = norm
      changed = true
    }
  }
  if (!m.attachments_sha256) {
    m.attachments_sha256 = m.attachment_shas.length
      ? attachmentsShaFromDisk(bookId, m.attachment_shas)
      : EMPTY_PACK_SHA
    changed = true
  }
  if (m.attachments_size === undefined) {
    m.attachments_size = encodeAttachmentPack(
      readAttachmentBlobs(bookId, m.attachment_shas),
    ).byteLength
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
  opts?: { rehashAttachments?: boolean; attachmentShas?: string[] },
): LockerMeta {
  const data = readFileSync(filePath(bookId))
  const prev = readMetaJson(bookId)
  const shas = normalizeShas(opts?.attachmentShas ?? prev?.attachment_shas)
  const rehash = opts?.rehashAttachments !== false
  let attachments_sha256: string
  let attachments_size: number
  if (!rehash && prev?.attachments_sha256) {
    attachments_sha256 = prev.attachments_sha256
    attachments_size = prev.attachments_size ?? 0
  } else {
    const pack = encodeAttachmentPack(readAttachmentBlobs(bookId, shas))
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
    attachment_shas: shas,
    split_attachments: true,
    updated_at: new Date().toISOString(),
  }
  writeMeta(meta)
  return meta
}

type SplitResult = { extracted: boolean; vacuumed: boolean; shas: string[] }

function syncMetaAfterSplit(bookId: string, split: SplitResult, name?: string): void {
  if (!split.extracted && !split.vacuumed) return
  const prev = normalizeShas(readMetaJson(bookId)?.attachment_shas)
  const shas = normalizeShas([...prev, ...split.shas])
  refreshMetaFromDisk(bookId, name, {
    rehashAttachments: split.extracted,
    attachmentShas: shas,
  })
}

/** Move Liite.data into tilari/blobs/, NULL blobs, VACUUM. */
function ensureLeanSplit(bookId: string): SplitResult {
  const none = { extracted: false, vacuumed: false, shas: [] as string[] }
  const path = filePath(bookId)
  if (!existsSync(path)) return none
  let extracted = false
  let vacuumed = false
  const extractedShas: string[] = []
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
      const blobs: Record<string, Uint8Array> = {}
      const upd = db.prepare('UPDATE Liite SET sha = ?, data = NULL WHERE id = ?')
      for (const row of rows) {
        if (!row.data) continue
        const blob = new Uint8Array(row.data)
        const s = row.sha && SHA_RE.test(String(row.sha)) ? String(row.sha) : sha(blob)
        blobs[s] = blob
        extractedShas.push(s)
        upd.run(s, row.id)
        extracted = true
      }
      if (extracted) writeAttachmentBlobs(blobs)
    }
    if (extracted || freelistCount > 0) {
      db.exec('VACUUM')
      vacuumed = true
    }
  } finally {
    db.close()
  }
  return { extracted, vacuumed, shas: extractedShas }
}

export function listBooks(): LockerMeta[] {
  const root = shelfRoot()
  const out: LockerMeta[] = []
  for (const name of readdirSync(root)) {
    if (name === 'blobs' || name === 'vault.json') continue
    const mf = join(root, name, 'meta.json')
    if (!existsSync(mf)) continue
    try {
      const data = JSON.parse(readFileSync(mf, 'utf8')) as LockerMeta
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
  const shas = normalizeShas(found.meta.attachment_shas)
  return { meta: found.meta, pack: encodeAttachmentPack(readAttachmentBlobs(bookId, shas)) }
}

export function getAttachmentBlob(bookId: string, shaHex: string): Buffer | null {
  const s = shaHex.toLowerCase()
  if (!SHA_RE.test(s)) return null
  const found = peekBook(bookId)
  if (!found) return null
  syncMetaAfterSplit(bookId, ensureLeanSplit(bookId))
  const path = blobPath(s)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

/** Remove a book directory and GC shared blobs no longer referenced. */
export function deleteBook(bookId: string): void {
  if (!peekBook(bookId)) throw new LockerNotFound()
  const dir = bookDir(bookId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  gcUnusedBlobs()
}

function gcUnusedBlobs(): number {
  const keep = new Set<string>()
  for (const book of listBooks()) {
    for (const s of normalizeShas(book.attachment_shas)) keep.add(s)
  }
  const root = blobsDir()
  if (!existsSync(root)) return 0
  let removed = 0
  for (const name of readdirSync(root)) {
    if (!SHA_RE.test(name) || keep.has(name)) continue
    rmSync(join(root, name), { force: true })
    removed += 1
  }
  return removed
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
  mkdirSync(bookDir(bookId), { recursive: true })
  writeFileSync(filePath(bookId), data)
  const split = ensureLeanSplit(bookId)
  const prevShas = normalizeShas(existing?.meta.attachment_shas)
  const shas = normalizeShas([...prevShas, ...split.shas])
  return refreshMetaFromDisk(bookId, name, {
    rehashAttachments: split.extracted || !existing?.meta.attachments_sha256,
    attachmentShas: shas,
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
  writeAttachmentBlobs(Object.fromEntries(blobs))
  const shas = normalizeShas(blobs.keys())
  const attSha = sha(pack)
  const meta: LockerMeta = {
    ...existing.meta,
    attachments_sha256: attSha,
    attachments_size: pack.byteLength,
    attachment_shas: shas,
    split_attachments: true,
    updated_at: new Date().toISOString(),
  }
  writeMeta(meta)
  return meta
}
