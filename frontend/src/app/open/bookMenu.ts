import type { EngineKind } from '../../book/service'
import type { LockerConnectionMode } from '../../book/persist/locker'
import type { FileStorageKind } from './fileStorage'
import type { LastBook } from './lastBook'
import { isLockerPath } from './lockerBooks'

/** Book file menu: create on its own, then the open book, this device, and own storage. */
export type BookMenuAction =
  | 'create'
  | 'openFile'
  | 'linkFile'
  | 'saveAsFile'
  | 'downloadLean'
  | 'connectStorage'
  | 'openStorage'
  | 'saveStorageAs'
  | 'saveStorageCopy'
  | 'reload'
  | 'close'

export type BookMenuSectionId = 'create' | 'device' | 'storage' | 'book'

export type BookMenuSection = {
  id: BookMenuSectionId
  actions: { id: BookMenuAction; disabled?: boolean }[]
  recents: LastBook[]
}

export type BookMenuInput = {
  hasBook: boolean
  engine: EngineKind
  storageKind: FileStorageKind | null
  writableLinked: boolean
  canLinkWritableFile: boolean
  lockerMode: LockerConnectionMode
  dirty: boolean
  recents: LastBook[]
}

/** Where a recent book came from: `locker:` is own storage; `local:`, `server:` and bare paths are files. */
export function recentSource(path: string): 'device' | 'storage' {
  return isLockerPath(path) ? 'storage' : 'device'
}

/** Only actions that can work in this state; nothing is shown greyed out without a reason. */
export function buildBookMenu(input: BookMenuInput): BookMenuSection[] {
  const browser = input.engine === 'wasm'
  const lockerBook = input.storageKind === 'locker'

  const device: BookMenuSection = {
    id: 'device',
    actions: [{ id: 'openFile' }],
    recents: input.recents.filter((book) => recentSource(book.path) === 'device'),
  }
  if (input.hasBook) {
    // A storage book saves to storage; linking a disk file would not change where Tallenna writes.
    if (browser && !input.writableLinked && input.canLinkWritableFile && !lockerBook) {
      device.actions.push({ id: 'linkFile' })
    }
    device.actions.push({ id: 'saveAsFile' })
    if (browser) device.actions.push({ id: 'downloadLean' })
  }

  const storage: BookMenuSection = {
    id: 'storage',
    actions: [],
    recents: input.recents.filter((book) => recentSource(book.path) === 'storage'),
  }
  if (input.lockerMode === 'off') {
    storage.actions.push({ id: 'connectStorage' })
  } else {
    storage.actions.push({ id: 'openStorage' })
    if (input.hasBook) {
      storage.actions.push({ id: 'saveStorageAs' })
      if (lockerBook) storage.actions.push({ id: 'saveStorageCopy' })
    }
  }

  const sections: BookMenuSection[] = [{ id: 'create', actions: [{ id: 'create' }], recents: [] }]
  if (input.hasBook) {
    sections.push({
      id: 'book',
      actions: [{ id: 'close' }, { id: 'reload', disabled: !input.dirty }],
      recents: [],
    })
  }
  sections.push(device, storage)
  return sections
}
