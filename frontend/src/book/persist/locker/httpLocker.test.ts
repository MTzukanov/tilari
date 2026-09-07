import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  connectHttpLocker,
  disconnectHttpLocker,
  getActiveLocker,
  getLockerConnection,
  loadHttpLockerSettings,
  probeSameOriginNode,
  resetLockerProbeForTests,
  saveHttpLockerSettings,
  setLockerKind,
} from './active'
import {
  httpLocker,
  parseHttpLockerSettings,
  resetHttpLockerState,
  resolveHttpLockerOrigin,
  setHttpLockerSameOrigin,
} from './httpLocker'

afterEach(() => {
  disconnectHttpLocker()
  resetLockerProbeForTests()
  setLockerKind('http')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parseHttpLockerSettings', () => {
  it('normalizes origin and strips a trailing /api', () => {
    expect(parseHttpLockerSettings({ url: 'https://books.example.com/api/' })).toEqual({
      url: 'https://books.example.com',
      path: 'tilari',
      encrypt: false,
      secret: undefined,
    })
  })

  it('rejects empty or non-http URLs', () => {
    expect(() => parseHttpLockerSettings({ url: '' })).toThrow('locker_http_url')
    expect(() => parseHttpLockerSettings({ url: 'ftp://x' })).toThrow('locker_http_url')
    expect(() => parseHttpLockerSettings(null)).toThrow('locker_http_url')
  })
})

describe('http locker readiness', () => {
  it('is not ready and blocks I/O until same-origin or BYO connect', async () => {
    resetHttpLockerState()
    expect(httpLocker.isReady()).toBe(false)
    expect(httpLocker.supportsHttpEngine).toBe(false)
    await expect(httpLocker.list()).rejects.toThrow('locker_not_configured')
    await expect(httpLocker.put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
  })

  it('same-origin probe enables the locker without a pasted URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ok: true }, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    await expect(probeSameOriginNode({ force: true })).resolves.toBe(true)
    expect(httpLocker.isReady()).toBe(true)
    expect(httpLocker.supportsHttpEngine).toBe(true)
  })

  it('connectHttpLocker uses the object-store locker (plain or encrypted settings)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('https://books.example.com') && url.includes('/api/health')) {
          return Response.json({ ok: true }, { status: 200 })
        }
        // Static UI / no local Node — relative health fails.
        if (url === '/api/health' || url.endsWith('://localhost/api/health')) {
          return new Response('no', { status: 404 })
        }
        if (url.includes('/api/objects/list')) {
          return Response.json({ objects: [] }, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    const locker = await connectHttpLocker({ url: 'https://books.example.com' })
    expect(locker).not.toBe(httpLocker)
    expect(locker.id).toBe('http')
    expect(locker.isReady()).toBe(true)
    expect(locker.supportsHttpEngine).toBe(false)
    expect(loadHttpLockerSettings()).toEqual({
      url: 'https://books.example.com',
      path: 'tilari',
      encrypt: false,
      secret: undefined,
    })
    expect(getActiveLocker()).toBe(locker)
    expect(await locker.list()).toEqual([])
  })

  it('encrypted http settings keep On the server disabled', () => {
    saveHttpLockerSettings(
      {
        url: location.origin,
        path: 'tilari',
        encrypt: true,
        secret: 'test-secret-please',
      },
      false,
    )
    setHttpLockerSameOrigin(true)
    const locker = getActiveLocker()
    expect(locker).not.toBe(httpLocker)
    expect(locker.supportsHttpEngine).toBe(false)
  })

  it('hydrated BYO settings list without an eager connect (reload path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/objects/list')) {
          return Response.json({ objects: [] }, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    saveHttpLockerSettings(
      { url: 'https://books.example.com', path: 'tilari', encrypt: false },
      true,
    )
    const locker = getActiveLocker()
    expect(getLockerConnection().mode).toBe('http')
    expect(locker).not.toBe(httpLocker)
    expect(locker.isReady()).toBe(false)
    // Lazy createHttpObjectLocker becomes ready on first list() — BookShell must not
    // gate the shelf refresh on isReady() or reload leaves an empty connected panel.
    await expect(locker.list()).resolves.toEqual([])
    expect(locker.isReady()).toBe(true)
  })

  it('resolveHttpLockerOrigin treats this page as same-origin', () => {
    expect(resolveHttpLockerOrigin(location.origin)).toBeNull()
    expect(resolveHttpLockerOrigin('https://other.example')).toBe('https://other.example')
  })

  it('disconnect clears BYO settings and refuses shelf I/O even if same-origin Node is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('https://books.example.com')) {
          return Response.json({ ok: true }, { status: 200 })
        }
        return new Response('no', { status: 404 })
      }),
    )
    const connected = await connectHttpLocker({ url: 'https://books.example.com' })
    disconnectHttpLocker()
    setHttpLockerSameOrigin(true)
    expect(loadHttpLockerSettings()).toBeNull()
    expect(getLockerConnection().mode).toBe('off')
    expect(getActiveLocker()).not.toBe(httpLocker)
    expect(httpLocker.isReady()).toBe(true)
    await expect(getActiveLocker().put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
    await expect(connected.put(null, new Uint8Array([1]), 'a.kitsas')).rejects.toThrow(
      'locker_not_configured',
    )
  })

  it('plaintext connect allows On the server when this page reaches Node', async () => {
    setHttpLockerSameOrigin(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/health')) {
          return Response.json({ ok: true }, { status: 200 })
        }
        if (url.includes('/api/objects/list')) {
          return Response.json({ objects: [] }, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    const locker = await connectHttpLocker({ url: 'http://127.0.0.1:8000', encrypt: false })
    expect(locker.supportsHttpEngine).toBe(true)
    expect(getActiveLocker().supportsHttpEngine).toBe(true)
  })

  it('plaintext same-page connect allows On the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/health') || url.endsWith('/api/health')) {
          return Response.json({ ok: true }, { status: 200 })
        }
        if (url.includes('/api/objects/list')) {
          return Response.json({ objects: [] }, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    const locker = await connectHttpLocker({ url: location.origin, encrypt: false })
    expect(locker.supportsHttpEngine).toBe(true)
    expect(getActiveLocker().supportsHttpEngine).toBe(true)
  })
})
