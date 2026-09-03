/** Remember how the current server session was opened so /api/reload can restore it. */

export type ReloadSource =
  | { type: 'path'; path: string; name: string }
  | { type: 'locker'; id: string; name: string }
  | { type: 'upload'; name: string; data: Uint8Array }

let reloadSource: ReloadSource | null = null

export function setReloadSource(source: ReloadSource | null): void {
  reloadSource = source
}

export function getReloadSource(): ReloadSource | null {
  return reloadSource
}
