/**
 * Locker HTTP + lean-split tests (replaces backend/tests/test_api.py locker cases).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import {
  decodeAttachmentPack,
  encodeAttachmentPack,
  emptyAttachmentPack,
} from '../../../frontend/src/book/attPack.ts'
import { sha256hexSync } from '../../../frontend/src/book/sha256.ts'
import { startServer } from '../app.ts'
import { EMPTY_PACK_SHA, setBooksDir } from './store.ts'

const GOLDEN = join(
  fileURLToPath(new URL('../../../testdb/tilari-test.kitsas', import.meta.url)),
)

const EMPTY_PACK = emptyAttachmentPack()

describe('locker', () => {
  const booksRoot = mkdtempSync(join(tmpdir(), 'tilari-locker-'))
  setBooksDir(booksRoot)

  const server = startServer({ host: '127.0.0.1', port: 0 })
  let base = ''

  before(async () => {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const addr = server.address()
    assert.ok(addr && typeof addr === 'object')
    base = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    setBooksDir(null)
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  })

  it('health includes locker', async () => {
    const res = await fetch(`${base}/api/health`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ok: boolean; locker: boolean }
    assert.equal(body.ok, true)
    assert.equal(body.locker, true)
    assert.equal(res.headers.get('access-control-allow-private-network'), 'true')
  })

  it('round-trips lean book with etags', async () => {
    const payload = readFileSync(GOLDEN)
    const listed0 = await fetch(`${base}/api/books`)
    assert.equal(listed0.status, 200)
    assert.deepEqual(await listed0.json(), { books: [] })

    const created = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'X-Tilari-Name': 'firma.kitsas' },
      body: payload,
    })
    assert.equal(created.status, 200)
    const meta = (await created.json()) as {
      id: string
      name: string
      sha256: string
      attachments_sha256: string
      size: number
    }
    assert.equal(meta.name, 'firma.kitsas')
    assert.ok(meta.sha256)
    assert.notEqual(meta.attachments_sha256, EMPTY_PACK_SHA)

    const listed = await fetch(`${base}/api/books`)
    assert.equal(((await listed.json()) as { books: unknown[] }).books.length, 1)

    const got = await fetch(`${base}/api/books/${meta.id}`)
    assert.equal(got.status, 200)
    const lean = Buffer.from(await got.arrayBuffer())
    assert.equal(lean.byteLength, meta.size)
    assert.equal(got.headers.get('etag')?.replaceAll('"', ''), meta.sha256)

    const leanPath = join(booksRoot, 'check-lean.kitsas')
    writeFileSync(leanPath, lean)
    const db = new DatabaseSync(leanPath)
    const fat = db.prepare('SELECT COUNT(*) AS c FROM Liite WHERE data IS NOT NULL').get() as {
      c: number
    }
    db.close()
    assert.equal(Number(fat.c), 0)

    const conflict = await fetch(`${base}/api/books/${meta.id}`, {
      method: 'PUT',
      headers: { 'X-Tilari-Name': 'firma.kitsas', 'If-Match': '"deadbeef"' },
      body: Buffer.concat([lean, Buffer.from('x')]),
    })
    assert.equal(conflict.status, 409)

    const missing = await fetch(`${base}/api/books/${meta.id}`, {
      method: 'PUT',
      headers: { 'X-Tilari-Name': 'firma.kitsas' },
      body: Buffer.concat([lean, Buffer.from('y')]),
    })
    assert.equal(missing.status, 409)

    const attDir = join(booksRoot, `${meta.id}.attachments`)
    const extraSha = 'a'.repeat(64)
    writeFileSync(join(attDir, extraSha), Buffer.alloc(2048, 7))
    const beforeInodes = Object.fromEntries(
      readdirSync(attDir).map((n) => [n, statSync(join(attDir, n)).ino]),
    )
    assert.ok(Object.keys(beforeInodes).length > 1)

    const updated = await fetch(`${base}/api/books/${meta.id}`, {
      method: 'PUT',
      headers: { 'X-Tilari-Name': 'firma.kitsas', 'If-Match': `"${meta.sha256}"` },
      body: lean,
    })
    assert.equal(updated.status, 200)
    const um = (await updated.json()) as { attachments_sha256: string; split_attachments: boolean }
    assert.ok(um.attachments_sha256)
    assert.equal(um.split_attachments, true)
    assert.equal(um.attachments_sha256, meta.attachments_sha256)
    assert.deepEqual(
      Object.fromEntries(readdirSync(attDir).map((n) => [n, statSync(join(attDir, n)).ino])),
      beforeInodes,
    )
  })

  it('attachments pack put/get', async () => {
    const payload = readFileSync(GOLDEN)
    const created = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'X-Tilari-Name': 'firma2.kitsas' },
      body: payload,
    })
    const meta = (await created.json()) as { id: string; attachments_sha256: string; sha256: string }
    const bookId = meta.id
    const currentAtt = meta.attachments_sha256
    assert.notEqual(currentAtt, EMPTY_PACK_SHA)

    const blob = Buffer.from('hello-liite')
    const sha = createHash('sha256').update(blob).digest('hex')
    const pack = encodeAttachmentPack({ [sha]: new Uint8Array(blob) })

    const existing = await fetch(`${base}/api/books/${bookId}/attachments`)
    assert.equal(existing.status, 200)
    assert.equal(existing.headers.get('etag')?.replaceAll('"', ''), currentAtt)

    const conflict = await fetch(`${base}/api/books/${bookId}/attachments`, {
      method: 'PUT',
      headers: { 'If-Match': '"deadbeef"' },
      body: Buffer.from(pack),
    })
    assert.equal(conflict.status, 409)

    const saved = await fetch(`${base}/api/books/${bookId}/attachments`, {
      method: 'PUT',
      headers: { 'If-Match': `"${currentAtt}"` },
      body: Buffer.from(pack),
    })
    assert.equal(saved.status, 200)
    const attSha = ((await saved.json()) as { attachments_sha256: string }).attachments_sha256
    assert.equal(attSha, createHash('sha256').update(pack).digest('hex'))

    const got = await fetch(`${base}/api/books/${bookId}/attachments`)
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), Buffer.from(pack))

    const one = await fetch(`${base}/api/books/${bookId}/attachments/${sha}`)
    assert.equal(one.status, 200)
    assert.deepEqual(Buffer.from(await one.arrayBuffer()), blob)

    const lean = Buffer.from(await (await fetch(`${base}/api/books/${bookId}`)).arrayBuffer())
    const ledgerAgain = await fetch(`${base}/api/books/${bookId}`, {
      method: 'PUT',
      headers: { 'X-Tilari-Name': 'firma2.kitsas', 'If-Match': `"${meta.sha256}"` },
      body: lean,
    })
    assert.equal(ledgerAgain.status, 200)
    assert.equal(
      ((await ledgerAgain.json()) as { attachments_sha256: string }).attachments_sha256,
      attSha,
    )
  })

  it('auto-splits classic fat kitsas', async () => {
    const fatPath = join(booksRoot, 'fat-src.kitsas')
    writeFileSync(fatPath, readFileSync(GOLDEN))
    const db = new DatabaseSync(fatPath)
    db.prepare('UPDATE Liite SET data = ? WHERE id = 1').run(Buffer.alloc(1_500_000, 0x5a))
    db.close()
    const payload = readFileSync(fatPath)
    assert.ok(payload.byteLength > 1_000_000)

    const created = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'X-Tilari-Name': 'fat.kitsas' },
      body: payload,
    })
    assert.equal(created.status, 200)
    const meta = (await created.json()) as {
      id: string
      size: number
      attachments_sha256: string
      attachments_size: number
    }
    assert.ok(meta.size < payload.byteLength / 2)
    assert.notEqual(meta.attachments_sha256, EMPTY_PACK_SHA)
    assert.ok(meta.attachments_size > 1_000_000)

    const packRes = await fetch(`${base}/api/books/${meta.id}/attachments`)
    const blobs = decodeAttachmentPack(new Uint8Array(await packRes.arrayBuffer()))
    assert.ok([...blobs.values()].some((b) => b.byteLength === 1_500_000))
  })

  it('attachment pack codec', () => {
    assert.equal(sha256hexSync(EMPTY_PACK), EMPTY_PACK_SHA)
    const blob = new TextEncoder().encode('x')
    const s = sha256hexSync(blob)
    const pack = encodeAttachmentPack({ [s]: blob })
    const decoded = decodeAttachmentPack(pack)
    assert.equal(decoded.size, 1)
    assert.deepEqual(decoded.get(s), blob)
  })
})
