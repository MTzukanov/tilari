/**
 * Server request guard: book ids, origins, Host header, body limit, atomic writes.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { startServer } from './app.ts'
import { setMaxBodyBytes, writeFileAtomic } from './httpUtil.ts'
import { setGuardOverrides } from './requestGuard.ts'
import { setBooksDir } from './locker/store.ts'

const GOLDEN = fileURLToPath(new URL('../../testdb/tilari-test.kitsas', import.meta.url))

function rawRequest(
  base: string,
  opts: { method: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined> }> {
  const url = new URL(base)
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, method: opts.method, path: opts.path, headers: opts.headers },
      (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers }))
      },
    )
    req.on('error', reject)
    req.end(opts.body)
  })
}

describe('request guard', () => {
  const root = mkdtempSync(join(tmpdir(), 'tilari-guard-'))
  const booksRoot = join(root, 'books')
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
    setGuardOverrides({ origins: null, hosts: null })
    setMaxBodyBytes(null)
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  it('rejects book ids that leave the shelf', async () => {
    const victim = join(root, 'victim')
    for (const id of ['..%2F..%2Fvictim', '..%2F', 'a.b', 'x%2Fy', 'blobs']) {
      const put = await fetch(`${base}/api/books/${id}`, {
        method: 'PUT',
        headers: { 'X-Tilari-Name': 'x.kitsas' },
        body: readFileSync(GOLDEN),
      })
      assert.equal(put.status, 400, `PUT ${id}`)
      const del = await fetch(`${base}/api/books/${id}`, { method: 'DELETE' })
      assert.ok(del.status === 400 || del.status === 404, `DELETE ${id}: ${del.status}`)
      const open = await fetch(`${base}/api/open-locker/${id}`, { method: 'POST' })
      assert.ok(open.status === 400 || open.status === 404, `open ${id}: ${open.status}`)
    }
    assert.equal(existsSync(victim), false)
    assert.deepEqual(readdirSync(root).filter((n) => n !== 'books'), [])
  })

  it('malformed percent-encoding is a 400, not a 500', async () => {
    const res = await fetch(`${base}/api/books/%E0%A4%A`)
    assert.equal(res.status, 400)
  })

  it('refuses foreign origins before routing (no simple-request CSRF)', async () => {
    const res = await fetch(`${base}/api/close`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: '{}',
    })
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    const list = await fetch(`${base}/api/books`, { headers: { Origin: 'https://evil.example' } })
    assert.equal(list.status, 403)
    const pre = await fetch(`${base}/api/books/abc`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'DELETE' },
    })
    assert.equal(pre.status, 403)
    const nul = await fetch(`${base}/api/books`, { headers: { Origin: 'null' } })
    assert.equal(nul.status, 403)
  })

  it('refuses cross-site no-cors API requests without an Origin', async () => {
    const res = await rawRequest(base, {
      method: 'GET',
      path: '/api/books',
      headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' },
    })
    assert.equal(res.status, 403)
  })

  it('allows same-origin and configured origins', async () => {
    const same = await fetch(`${base}/api/books`, { headers: { Origin: base } })
    assert.equal(same.status, 200)
    assert.equal(same.headers.get('access-control-allow-origin'), null)

    setGuardOverrides({ origins: ['https://books.example.org'] })
    try {
      const pre = await fetch(`${base}/api/books/abc`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://books.example.org',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'if-match, x-tilari-name',
        },
      })
      assert.equal(pre.status, 204)
      assert.equal(pre.headers.get('access-control-allow-origin'), 'https://books.example.org')
      assert.match(pre.headers.get('access-control-allow-methods') || '', /PUT/)
      const pages = await fetch(`${base}/api/books`, {
        headers: { Origin: 'https://mtzukanov.github.io' },
      })
      assert.equal(pages.status, 403, 'env list replaces the default')
    } finally {
      setGuardOverrides({ origins: null })
    }
  })

  it('refuses a non-loopback Host on a loopback bind (DNS rebinding)', async () => {
    const res = await rawRequest(base, {
      method: 'GET',
      path: '/api/books',
      headers: { Host: 'rebind.example:8000', Origin: 'http://rebind.example:8000' },
    })
    assert.equal(res.status, 421)
    const ok = await rawRequest(base, {
      method: 'GET',
      path: '/api/books',
      headers: { Host: `localhost:${new URL(base).port}` },
    })
    assert.equal(ok.status, 200)
  })

  it('limits request bodies', async () => {
    setMaxBodyBytes(1024)
    try {
      const res = await fetch(`${base}/api/books`, {
        method: 'POST',
        headers: { 'X-Tilari-Name': 'big.kitsas' },
        body: new Uint8Array(4096),
      })
      assert.equal(res.status, 413)
    } finally {
      setMaxBodyBytes(null)
    }
  })

  it('open-path only opens .kitsas files', async () => {
    const res = await fetch(`${base}/api/open-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/etc/passwd' }),
    })
    assert.equal(res.status, 400)
  })
})

describe('writeFileAtomic', () => {
  it('replaces content and leaves no temp files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilari-atomic-'))
    const path = join(dir, 'meta.json')
    writeFileSync(path, 'old')
    writeFileAtomic(path, 'new')
    assert.equal(readFileSync(path, 'utf8'), 'new')
    assert.deepEqual(readdirSync(dirname(path)), ['meta.json'])
  })

  it('keeps the old file when the write fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilari-atomic-'))
    const path = join(dir, 'meta.json')
    writeFileSync(path, 'old')
    assert.throws(() => writeFileAtomic(join(dir, 'missing', 'x.json'), 'new'))
    assert.equal(readFileSync(path, 'utf8'), 'old')
    assert.deepEqual(readdirSync(dir), ['meta.json'])
  })
})
