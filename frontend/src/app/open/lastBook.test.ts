import { describe, expect, it } from 'vitest'
import {
  BOOK_SESSION_KEY,
  LAST_BOOK_KEY,
  RECENT_BOOKS_KEY,
  clearBookSession,
  loadBookSession,
  loadRecentBooks,
  rememberOpenBook,
  rememberRecent,
  sessionMatches,
} from './lastBook'

describe('lastBook', () => {
  it('keeps a recents list, newest first, and the live session separately', () => {
    localStorage.removeItem(LAST_BOOK_KEY)
    localStorage.removeItem(RECENT_BOOKS_KEY)
    localStorage.removeItem(BOOK_SESSION_KEY)

    rememberRecent({ path: '/tmp/old.kitsas', name: 'old.kitsas' })
    const recents = rememberOpenBook(
      {
        db_path: '/tmp/book.kitsas',
        source_name: 'book.kitsas',
        session_id: 'abc',
      },
      'http',
    )
    expect(recents.map((b) => b.name)).toEqual(['book.kitsas', 'old.kitsas'])
    expect(loadRecentBooks()[0]).toEqual({ path: '/tmp/book.kitsas', name: 'book.kitsas' })
    expect(loadBookSession()).toEqual({
      sessionId: 'abc',
      path: '/tmp/book.kitsas',
      engine: 'http',
    })
    expect(
      sessionMatches(
        { opened: true, session_id: 'abc', db_path: '/tmp/book.kitsas' },
        loadBookSession(),
      ),
    ).toBe(true)
    expect(
      sessionMatches(
        { opened: true, session_id: 'other-process', db_path: '/tmp/book.kitsas' },
        loadBookSession(),
      ),
    ).toBe(false)
    expect(
      sessionMatches(
        { opened: true, session_id: 'abc', db_path: 'server:book.kitsas' },
        loadBookSession(),
      ),
    ).toBe(true)
    expect(loadBookSession()?.path).toBe('server:book.kitsas')
    clearBookSession()
    expect(loadBookSession()).toBeNull()
    expect(loadRecentBooks()).toHaveLength(2)
  })

  it('can bind a session without adding recents', () => {
    localStorage.removeItem(LAST_BOOK_KEY)
    localStorage.removeItem(RECENT_BOOKS_KEY)
    localStorage.removeItem(BOOK_SESSION_KEY)
    rememberRecent({ path: '/tmp/old.kitsas', name: 'old.kitsas' })
    const recents = rememberOpenBook(
      {
        db_path: 'local:abc/Uusi Oy.kitsas',
        source_name: 'Uusi Oy.kitsas',
        session_id: 'new',
      },
      'wasm',
      { recents: false },
    )
    expect(recents).toEqual([{ path: '/tmp/old.kitsas', name: 'old.kitsas' }])
    expect(loadBookSession()).toEqual({
      sessionId: 'new',
      path: 'local:abc/Uusi Oy.kitsas',
      engine: 'wasm',
    })
  })

  it('migrates the old single last-book key', () => {
    localStorage.removeItem(RECENT_BOOKS_KEY)
    localStorage.setItem(
      LAST_BOOK_KEY,
      JSON.stringify({ path: '/tmp/legacy.kitsas', name: 'legacy.kitsas' }),
    )
    expect(loadRecentBooks()).toEqual([{ path: '/tmp/legacy.kitsas', name: 'legacy.kitsas' }])
  })

  it('replaces an older copy with the same file name', () => {
    localStorage.removeItem(LAST_BOOK_KEY)
    localStorage.removeItem(RECENT_BOOKS_KEY)
    rememberRecent({ path: '/tmp/a-1.kitsas', name: 'firma.kitsas' })
    expect(rememberRecent({ path: '/tmp/a-2.kitsas', name: 'firma.kitsas' })).toEqual([
      { path: '/tmp/a-2.kitsas', name: 'firma.kitsas' },
    ])
  })
})
