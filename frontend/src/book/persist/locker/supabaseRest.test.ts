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
      vi.fn(async () => new Response('', { status: 403 })),
    )
    const store = createSupabaseObjectStore('https://example.supabase.co', 'anon', 'tilari')
    await expect(store.exists('blobs/abc')).rejects.toThrow('exists_failed')
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
