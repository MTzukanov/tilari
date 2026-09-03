import type { EngineKind } from './service'

/** Path prefix determines which engine can reopen without asking. */
export function forcedEngineForPath(path: string): EngineKind | undefined {
  if (path.startsWith('local:')) return 'wasm'
  if (path.startsWith('server:')) return 'http'
  return undefined
}
