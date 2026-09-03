import type { SaveEntryInput } from '../types'
import type { SqliteDb } from '../sqlite'
import type { PostingHook } from '../modules/types'

const hooks: PostingHook[] = []

export function registerPostingHooks(next: PostingHook[]): void {
  hooks.length = 0
  hooks.push(...next)
}

export function expandPostedLines(
  db: SqliteDb,
  lines: SaveEntryInput[],
  date: string,
): SaveEntryInput[] {
  let out = lines
  for (const hook of hooks) {
    if (hook.expandPostedLines) out = hook.expandPostedLines(db, out, date)
  }
  return out
}

export function runAfterDelete(db: SqliteDb, date: string, type: number): void {
  for (const hook of hooks) hook.onAfterDelete?.(db, date, type)
}
