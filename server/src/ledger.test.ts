/**
 * Node ledger HTTP flow (http engine / "Palvelimella").
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { startServer } from './app.ts'

const GOLDEN = join(
  fileURLToPath(new URL('../../testdb/tilari-test.kitsas', import.meta.url)),
)

describe('ledger http', () => {
  const server = startServer({ host: '127.0.0.1', port: 0 })
  let base = ''

  before(async () => {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const addr = server.address()
    assert.ok(addr && typeof addr === 'object')
    base = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  })

  it('starts with no book open', async () => {
    const health = (await fetch(`${base}/api/health`).then((r) => r.json())) as {
      opened: boolean
      session_id: string
      db_path: string | null
    }
    assert.equal(health.opened, false)
    assert.equal(health.db_path, null)
    const meta = await fetch(`${base}/api/meta`)
    assert.equal(meta.status, 409)
  })

  it('open-path, meta, balances, and health share one session', async () => {
    const openRes = await fetch(`${base}/api/open-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: GOLDEN }),
    })
    const openText = await openRes.text()
    assert.equal(openRes.status, 200, openText)
    const meta = JSON.parse(openText) as {
      name: string
      session_id: string
      db_path: string
      periods: { ends: string }[]
    }
    assert.equal(meta.name, 'Testikirja Oy')
    assert.match(meta.db_path, /^server:/)

    const health = (await fetch(`${base}/api/health`).then((r) => r.json())) as {
      opened: boolean
      session_id: string
      db_path: string | null
    }
    assert.equal(health.opened, true)
    assert.equal(health.session_id, meta.session_id)
    assert.equal(health.db_path, meta.db_path)

    const metaAgain = (await fetch(`${base}/api/meta`).then((r) => r.json())) as {
      session_id: string
    }
    assert.equal(metaAgain.session_id, meta.session_id)

    const periodEnd = meta.periods.at(-1)?.ends
    assert.ok(periodEnd)
    const balRes = await fetch(`${base}/api/balances?date=${encodeURIComponent(periodEnd)}`)
    const balText = await balRes.text()
    assert.equal(balRes.status, 200, balText)
    const balances = JSON.parse(balText) as { lines: { number: number }[] }
    assert.ok(balances.lines.some((line) => line.number === 1910))
  })

  it('multipart open keeps session through follow-up requests', async () => {
    await fetch(`${base}/api/close`, { method: 'POST' })

    const payload = readFileSync(GOLDEN)
    const boundary = 'tilari-test-boundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="tilari-test.kitsas"\r\n'),
      Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
      payload,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const openRes = await fetch(`${base}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    const openText = await openRes.text()
    assert.equal(openRes.status, 200, openText)
    const meta = JSON.parse(openText) as { session_id: string; periods: { ends: string }[] }

    const health = (await fetch(`${base}/api/health`).then((r) => r.json())) as {
      session_id: string
      opened: boolean
    }
    assert.equal(health.opened, true)
    assert.equal(health.session_id, meta.session_id)

    const periodEnd = meta.periods.at(-1)?.ends
    assert.ok(periodEnd)
    const balRes = await fetch(`${base}/api/balances?date=${encodeURIComponent(periodEnd)}`)
    const balText = await balRes.text()
    assert.equal(balRes.status, 200, balText)
  })

  it('open-locker opens on server with locker db_path (no client download)', async () => {
    await fetch(`${base}/api/close`, { method: 'POST' })

    const payload = readFileSync(GOLDEN)
    const putRes = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'X-Tilari-Name': encodeURIComponent('tilari-test.kitsas') },
      body: payload,
    })
    const putText = await putRes.text()
    assert.equal(putRes.status, 200, putText)
    const saved = JSON.parse(putText) as { id: string }

    const openRes = await fetch(`${base}/api/open-locker/${saved.id}`, { method: 'POST' })
    const openText = await openRes.text()
    assert.equal(openRes.status, 200, openText)
    const meta = JSON.parse(openText) as {
      session_id: string
      db_path: string
      locker_etag?: string
    }
    assert.equal(meta.db_path, `locker:${saved.id}`)
    assert.ok(meta.locker_etag)

    const health = (await fetch(`${base}/api/health`).then((r) => r.json())) as {
      opened: boolean
      session_id: string
      db_path: string | null
    }
    assert.equal(health.opened, true)
    assert.equal(health.session_id, meta.session_id)
    assert.equal(health.db_path, meta.db_path)
  })

  it('open-locker serves split attachments via /api/attachments/:id', async () => {
    await fetch(`${base}/api/close`, { method: 'POST' })

    const payload = readFileSync(GOLDEN)
    const putRes = await fetch(`${base}/api/books`, {
      method: 'POST',
      headers: { 'X-Tilari-Name': encodeURIComponent('att-http.kitsas') },
      body: payload,
    })
    assert.equal(putRes.status, 200)
    const saved = (await putRes.json()) as { id: string }

    const openRes = await fetch(`${base}/api/open-locker/${saved.id}`, { method: 'POST' })
    assert.equal(openRes.status, 200)

    const voucher = (await fetch(`${base}/api/vouchers/7`).then((r) => r.json())) as {
      attachments: { id: number; name: string }[]
    }
    assert.ok(voucher.attachments?.length, 'golden voucher 7 should list attachments')
    const attId = voucher.attachments[0].id

    const attRes = await fetch(`${base}/api/attachments/${attId}`)
    const attText = await attRes.text()
    assert.equal(attRes.status, 200, attText)
    assert.equal(attText, 'test-liite\n')
  })
})
