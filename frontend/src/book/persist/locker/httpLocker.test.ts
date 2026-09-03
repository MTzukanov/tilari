import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  connectHttpLocker,
  disconnectHttpLocker,
  getActiveLocker,
  loadHttpLockerSettings,
  probeSameOriginNode,
  resetLockerProbeForTests,
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

  it('connectHttpLocker stores BYO origin and does not enable server processing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/health')) {
          return Response.json({ ok: true }, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    const locker = await connectHttpLocker({ url: 'https://books.example.com' })
    expect(locker).toBe(httpLocker)
    expect(loadHttpLockerSettings()).toEqual({ url: 'https://books.example.com' })
    expect(getActiveLocker().isReady()).toBe(true)
    expect(httpLocker.supportsHttpEngine).toBe(false)
  })

  it('resolveHttpLockerOrigin treats this page as same-origin', () => {
    expect(resolveHttpLockerOrigin(location.origin)).toBeNull()
    expect(resolveHttpLockerOrigin('https://other.example')).toBe('https://other.example')
  })

  it('disconnect clears BYO settings', async () => {
    setHttpLockerSameOrigin(false)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true }, { status: 200 })),
    )
    await connectHttpLocker({ url: 'https://books.example.com' })
    disconnectHttpLocker()
    expect(loadHttpLockerSettings()).toBeNull()
    expect(httpLocker.isReady()).toBe(false)
  })
})
