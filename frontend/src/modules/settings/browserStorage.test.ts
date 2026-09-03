import { afterEach, describe, expect, it } from 'vitest'
import {
  clearTilariWebStorage,
  formatBytes,
  groupOpfsBlobs,
  groupOpfsFiles,
  isLiveOpfsBook,
  listTilariWebStorage,
  liveOpfsBookId,
  removeTilariWebStorageKey,
  truncateValue,
  utf8Bytes,
} from './browserStorage'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('utf8Bytes and formatBytes', () => {
  it('counts UTF-8 bytes', () => {
    expect(utf8Bytes('abc')).toBe(3)
    expect(utf8Bytes('ä')).toBe(2)
  })

  it('formats bytes with IEC units', () => {
    expect(formatBytes(512, 'en-GB')).toBe('512 B')
    expect(formatBytes(2048, 'en-GB')).toBe('2 KiB')
    expect(formatBytes(1024 * 1024, 'en-GB')).toBe('1 MiB')
  })
})

describe('listTilariWebStorage', () => {
  it('lists only tilari.* keys and ignores others', () => {
    localStorage.setItem('tilari.engine', 'wasm')
    localStorage.setItem('other.app', 'nope')
    sessionStorage.setItem('tilari.practiceDate:book-a', '2026-01-02')
    const items = listTilariWebStorage()
    expect(items.map((item) => item.key).sort()).toEqual([
      'tilari.engine',
      'tilari.practiceDate:book-a',
    ])
    expect(items.find((item) => item.key === 'tilari.engine')?.kind).toBe('local')
    expect(items.find((item) => item.key === 'tilari.practiceDate:book-a')?.kind).toBe('session')
    expect(items.find((item) => item.key === 'tilari.engine')?.bytes).toBe(
      utf8Bytes('tilari.engine') + utf8Bytes('wasm'),
    )
  })

  it('removes one key and clears all Tilari keys', () => {
    localStorage.setItem('tilari.engine', 'wasm')
    localStorage.setItem('tilari.font', 'ubuntu')
    localStorage.setItem('keep.me', 'yes')
    sessionStorage.setItem('tilari.practiceDate:x', '2026-01-01')
    removeTilariWebStorageKey('local', 'tilari.engine')
    expect(localStorage.getItem('tilari.engine')).toBeNull()
    expect(localStorage.getItem('tilari.font')).toBe('ubuntu')
    removeTilariWebStorageKey('local', 'keep.me')
    expect(localStorage.getItem('keep.me')).toBe('yes')
    clearTilariWebStorage()
    expect(localStorage.getItem('tilari.font')).toBeNull()
    expect(sessionStorage.getItem('tilari.practiceDate:x')).toBeNull()
    expect(localStorage.getItem('keep.me')).toBe('yes')
  })
})

describe('OPFS grouping and live-book detection', () => {
  it('groups files by book id', () => {
    const groups = groupOpfsFiles([
      { path: 'bbb/working.kitsas', bytes: 10 },
      { path: 'aaa/meta.json', bytes: 2 },
      { path: 'aaa/working.kitsas', bytes: 8 },
    ])
    expect(groups.map((g) => g.bookId)).toEqual(['aaa', 'bbb'])
    expect(groups[0]?.bytes).toBe(10)
    expect(groups[0]?.files).toHaveLength(2)
  })

  it('keeps blobs/ out of session groups', () => {
    const files = [
      { path: 'aaa/working.kitsas', bytes: 8 },
      { path: 'blobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', bytes: 40 },
    ]
    expect(groupOpfsFiles(files).map((g) => g.bookId)).toEqual(['aaa'])
    expect(groupOpfsBlobs(files)).toHaveLength(1)
    expect(groupOpfsBlobs(files)[0]?.bytes).toBe(40)
  })

  it('parses local book id and marks the open folder in use', () => {
    expect(liveOpfsBookId('local:abc123/book.kitsas')).toBe('abc123')
    expect(liveOpfsBookId('locker:srv')).toBeNull()
    expect(
      isLiveOpfsBook('abc123', null, { db_path: 'local:abc123/book.kitsas', session_id: 's' }),
    ).toBe(true)
    expect(
      isLiveOpfsBook('other', { sessionId: 's' }, {
        db_path: 'locker:srv',
        session_id: 's',
      }),
    ).toBe(true)
    expect(
      isLiveOpfsBook('other', null, { db_path: 'local:abc123/book.kitsas', session_id: 's' }),
    ).toBe(false)
  })
})

describe('truncateValue', () => {
  it('collapses whitespace and ellipsizes', () => {
    expect(truncateValue('  hello   world  ', 20)).toBe('hello world')
    expect(truncateValue('abcdefghij', 6)).toBe('abcde…')
  })
})
