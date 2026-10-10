import { describe, expect, it } from 'vitest'
import { buildBookMenu, recentSource, type BookMenuInput, type BookMenuSectionId } from './bookMenu'

const recents = [
  { path: 'local:a/one.kitsas', name: 'one.kitsas' },
  { path: 'locker:abc', name: 'two.kitsas' },
  { path: 'server:three.kitsas', name: 'three.kitsas' },
]

const base: BookMenuInput = {
  hasBook: true,
  engine: 'wasm',
  storageKind: 'browser',
  writableLinked: false,
  canLinkWritableFile: true,
  lockerMode: 'http',
  dirty: true,
  recents,
}

function actions(input: BookMenuInput, id: BookMenuSectionId) {
  return buildBookMenu(input).find((s) => s.id === id)?.actions.map((a) => a.id) ?? []
}

describe('recentSource', () => {
  it('puts locker books in storage and every file path on the device', () => {
    expect(recentSource('locker:abc')).toBe('storage')
    expect(recentSource('local:a/one.kitsas')).toBe('device')
    expect(recentSource('server:three.kitsas')).toBe('device')
    expect(recentSource('/home/me/book.kitsas')).toBe('device')
  })
})

describe('buildBookMenu', () => {
  it('orders create, open book, device, storage', () => {
    expect(buildBookMenu(base).map((s) => s.id)).toEqual(['create', 'book', 'device', 'storage'])
    expect(actions(base, 'create')).toEqual(['create'])
  })

  it('lists each recent under the group it came from', () => {
    const sections = buildBookMenu(base)
    expect(sections.find((s) => s.id === 'device')?.recents.map((b) => b.name)).toEqual([
      'one.kitsas',
      'three.kitsas',
    ])
    expect(sections.find((s) => s.id === 'storage')?.recents.map((b) => b.name)).toEqual(['two.kitsas'])
  })

  it('offers a browser copy the link, save as file and the lean copy', () => {
    expect(actions(base, 'device')).toEqual(['openFile', 'linkFile', 'saveAsFile', 'downloadLean'])
  })

  it('hides the link when it cannot help', () => {
    expect(actions({ ...base, canLinkWritableFile: false }, 'device')).not.toContain('linkFile')
    expect(actions({ ...base, writableLinked: true, storageKind: 'disk' }, 'device')).not.toContain('linkFile')
    expect(actions({ ...base, storageKind: 'locker' }, 'device')).not.toContain('linkFile')
  })

  it('offers the server engine no link and no lean copy', () => {
    expect(actions({ ...base, engine: 'http', storageKind: 'session' }, 'device')).toEqual([
      'openFile',
      'saveAsFile',
    ])
  })

  it('offers a new storage copy only for a book that is in storage', () => {
    expect(actions(base, 'storage')).toEqual(['openStorage', 'saveStorageAs'])
    expect(actions({ ...base, storageKind: 'locker' }, 'storage')).toEqual([
      'openStorage',
      'saveStorageAs',
      'saveStorageCopy',
    ])
  })

  it('asks to connect storage when none is connected', () => {
    expect(actions({ ...base, lockerMode: 'off' }, 'storage')).toEqual(['connectStorage'])
  })

  it('without a book shows only the ways to get one', () => {
    const none = { ...base, hasBook: false, storageKind: null }
    expect(buildBookMenu(none).map((s) => s.id)).toEqual(['create', 'device', 'storage'])
    expect(actions(none, 'device')).toEqual(['openFile'])
    expect(actions(none, 'storage')).toEqual(['openStorage'])
  })

  it('disables reload while there is nothing to discard', () => {
    const book = buildBookMenu({ ...base, dirty: false }).find((s) => s.id === 'book')
    expect(book?.actions).toEqual([{ id: 'close' }, { id: 'reload', disabled: true }])
  })
})
