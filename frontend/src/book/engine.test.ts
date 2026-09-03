import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearBookSession,
  loadBookSession,
  rememberOpenBook,
  sessionMatches,
} from '../app/open/lastBook'
import { getEngine, getBookService, resetBookService, resolveEngine, setEngine, withEngine } from './engine'
import { HttpBookService } from './httpService'
import { WasmBookService } from './wasmService'

describe('book engine', () => {
  beforeEach(() => {
    localStorage.removeItem('tilari.engine')
    clearBookSession()
    resetBookService()
  })

  it('resolveEngine prefers the live book session engine', () => {
    setEngine('wasm')
    rememberOpenBook(
      { db_path: 'server:book.kitsas', source_name: 'book.kitsas', session_id: 'abc' },
      'http',
    )
    expect(resolveEngine()).toBe('http')
    expect(getBookService()).toBeInstanceOf(HttpBookService)
  })

  it('getBookService switches when the resolved engine changes', () => {
    setEngine('wasm')
    expect(getBookService()).toBeInstanceOf(WasmBookService)
    rememberOpenBook(
      { db_path: 'server:book.kitsas', source_name: 'book.kitsas', session_id: 'abc' },
      'http',
    )
    expect(getBookService()).toBeInstanceOf(HttpBookService)
  })

  it('falls back to the default preference without a live session', () => {
    setEngine('http')
    expect(resolveEngine()).toBe('http')
    expect(getEngine()).toBe('http')
    expect(getBookService()).toBeInstanceOf(HttpBookService)
  })

  it('uses the default preference after clearing a stale session', () => {
    rememberOpenBook(
      { db_path: 'server:book.kitsas', source_name: 'book.kitsas', session_id: 'abc' },
      'http',
    )
    expect(resolveEngine()).toBe('http')
    clearBookSession()
    setEngine('wasm')
    resetBookService()
    expect(resolveEngine()).toBe('wasm')
    expect(getBookService()).toBeInstanceOf(WasmBookService)
  })

  it('withEngine pins engine choice over a stale session', async () => {
    rememberOpenBook(
      { db_path: 'server:book.kitsas', source_name: 'book.kitsas', session_id: 'abc' },
      'http',
    )
    resetBookService()
    await withEngine('wasm', async () => {
      expect(resolveEngine()).toBe('wasm')
      expect(getBookService()).toBeInstanceOf(WasmBookService)
    })
    expect(resolveEngine()).toBe('http')
  })

  it('sessionMatches requires an opened book with matching ids', () => {
    rememberOpenBook(
      { db_path: 'server:book.kitsas', source_name: 'book.kitsas', session_id: 'abc' },
      'http',
    )
    const session = loadBookSession()
    expect(
      sessionMatches(
        { opened: true, session_id: 'abc', db_path: 'server:book.kitsas' },
        session,
      ),
    ).toBe(true)
    expect(
      sessionMatches(
        { opened: false, session_id: 'abc', db_path: 'server:book.kitsas' },
        session,
      ),
    ).toBe(false)
  })
})
