import type { LockerBook } from '../../api'

export function lockerBookLabel(book: LockerBook, books: LockerBook[]): string {
  const sameName = books.filter((b) => b.name === book.name)
  if (sameName.length > 1) return `${book.name} · ${book.id.slice(0, 8)}`
  return book.name
}

export function isLockerPath(path: string | null | undefined): boolean {
  return Boolean(path?.startsWith('locker:'))
}

/** Book id from `locker:{id}` paths; null for any other/empty path. */
export function lockerIdFromPath(path: string | null | undefined): string | null {
  if (!path?.startsWith('locker:')) return null
  const id = path.slice('locker:'.length).trim()
  return id || null
}
