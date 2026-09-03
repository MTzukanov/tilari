export type LastBook = {
  path: string
  name: string
}

import type { EngineKind } from '../../book/service'

export type BookSession = {
  sessionId: string
  path: string
  engine: EngineKind
}

export const LAST_BOOK_KEY = 'tilari.lastBook'
export const RECENT_BOOKS_KEY = 'tilari.recentBooks'
export const BOOK_SESSION_KEY = 'tilari.bookSession'
export const MAX_RECENTS = 8

export const CHOOSE_NEW = '__new__'
export const CHOOSE_CREATE = '__create__'
export const CHOOSE_SERVER = '__server__'

function isBook(value: unknown): value is LastBook {
  if (!value || typeof value !== 'object') return false
  const book = value as Partial<LastBook>
  return Boolean(book.path && book.name)
}

export function loadRecentBooks(): LastBook[] {
  try {
    const raw = localStorage.getItem(RECENT_BOOKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed.filter(isBook).slice(0, MAX_RECENTS)
    }
    const legacy = loadLastBook()
    return legacy ? [legacy] : []
  } catch {
    return []
  }
}

/** @deprecated single-book key; still read for migration */
export function loadLastBook(): LastBook | null {
  try {
    const raw = localStorage.getItem(LAST_BOOK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastBook>
    if (!parsed.path || !parsed.name) return null
    return { path: parsed.path, name: parsed.name }
  } catch {
    return null
  }
}

export function saveRecentBooks(books: LastBook[]): void {
  localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(books.slice(0, MAX_RECENTS)))
  const first = books[0]
  if (first) localStorage.setItem(LAST_BOOK_KEY, JSON.stringify(first))
  else localStorage.removeItem(LAST_BOOK_KEY)
}

export function rememberRecent(book: LastBook): LastBook[] {
  const rest = loadRecentBooks().filter((item) => item.path !== book.path && item.name !== book.name)
  const next = [book, ...rest].slice(0, MAX_RECENTS)
  saveRecentBooks(next)
  return next
}

export function removeRecent(path: string): LastBook[] {
  const next = loadRecentBooks().filter((item) => item.path !== path)
  saveRecentBooks(next)
  return next
}

function isEngine(value: unknown): value is EngineKind {
  return value === 'wasm' || value === 'http'
}

export function loadBookSession(): BookSession | null {
  try {
    const raw = localStorage.getItem(BOOK_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BookSession>
    if (!parsed.sessionId || !parsed.path) return null
    return {
      sessionId: parsed.sessionId,
      path: parsed.path,
      engine: isEngine(parsed.engine) ? parsed.engine : 'wasm',
    }
  } catch {
    return null
  }
}

export function saveBookSession(session: BookSession): void {
  localStorage.setItem(BOOK_SESSION_KEY, JSON.stringify(session))
}

export function clearBookSession(): void {
  localStorage.removeItem(BOOK_SESSION_KEY)
}

export function rememberOpenBook(
  meta: {
    db_path: string
    source_name: string
    session_id: string
  },
  engine: EngineKind,
  opts?: { recents?: boolean },
): LastBook[] {
  saveBookSession({ sessionId: meta.session_id, path: meta.db_path, engine })
  if (opts?.recents === false) return loadRecentBooks()
  return rememberRecent({ path: meta.db_path, name: meta.source_name })
}

export function sessionMatches(
  health: { opened: boolean; session_id: string; db_path: string | null },
  session: BookSession | null,
): boolean {
  if (!health.opened || !health.db_path || !session) return false
  if (session.sessionId !== health.session_id) return false
  if (session.path !== health.db_path) {
    saveBookSession({ ...session, path: health.db_path })
  }
  return true
}
