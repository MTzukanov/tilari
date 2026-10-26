import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseObjectStore } from './supabaseRest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createSupabaseObjectStore.exists', () => {
  it('treats Supabase HEAD 400 as missing (legacy not-found)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).resolves.toBe(false)
  })

  it('treats HEAD 404 as missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).resolves.toBe(false)
  })

  it('returns true on HEAD 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).resolves.toBe(true)
  })

  it('throws exists_failed on other errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).rejects.toThrow('exists_failed')
  })

  it('throws locker_forbidden on HEAD 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).rejects.toThrow('locker_forbidden')
  })
})

describe('createSupabaseObjectStore.list', () => {
  it('flattens folder-scoped Supabase listings to relative keys', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { prefix?: string }
      const prefix = body.prefix || ''
      if (prefix === '') {
        return Response.json([
          { name: 'vault.json', id: 'v1' },
          { name: 'book-a', id: null },
          { name: 'blobs', id: null },
        ])
      }
      if (prefix === 'book-a') {
        return Response.json([
          { name: 'meta.json', id: 'm1' },
          { name: 'book.kitsas', id: 'k1' },
        ])
      }
      if (prefix === 'blobs') {
        return Response.json([{ name: 'deadbeef', id: 'b1' }])
      }
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.list('')).resolves.toEqual([
      { name: 'blobs/deadbeef' },
      { name: 'book-a/book.kitsas' },
      { name: 'book-a/meta.json' },
      { name: 'vault.json' },
    ])
  })

  it('returns names relative to a non-empty prefix', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { prefix?: string }
      const prefix = body.prefix || ''
      if (prefix === 'book1') {
        return Response.json([{ name: 'abc', id: null }])
      }
      if (prefix === 'book1/abc') {
        return Response.json([{ name: 'meta.json', id: 'm1' }])
      }
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetchMock)

    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.list('book1/')).resolves.toEqual([{ name: 'abc/meta.json' }])
  })
})

describe('createSupabaseObjectStore auth headers', () => {
  async function headersFor(key: string): Promise<Headers> {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await createSupabaseObjectStore('https://example.supabase.co', key, 'tilari').exists('vault.json')
    return new Headers(fetchMock.mock.calls[0]![1]!.headers)
  }

  it('sends a legacy anon JWT as apikey and bearer token', async () => {
    const h = await headersFor('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig')
    expect(h.get('apikey')).toBe('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig')
    expect(h.get('authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig')
  })

  it('sends a publishable key as apikey only (it is not a JWT)', async () => {
    const h = await headersFor('sb_publishable_abc123')
    expect(h.get('apikey')).toBe('sb_publishable_abc123')
    expect(h.has('authorization')).toBe(false)
  })
})
