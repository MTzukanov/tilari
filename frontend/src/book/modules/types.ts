import type { SqliteDb } from '../sqlite'
import type { MutateMeta } from '../sessionLog'
import type { SaveVoucherInput, VoucherDetail } from '../types'

export type KernelSettings = {
  company: Record<string, string>
  lock_date: string | null
}

/** Slim surface feature modules may call. Posting and session stay here. */
export interface KernelContext {
  requireDb(): SqliteDb
  mutate<T>(
    fn: (db: SqliteDb) => T | Promise<T>,
    meta: MutateMeta | ((result: T) => MutateMeta),
  ): Promise<T>
  voucherDetail(id: number): VoucherDetail
  saveVoucher(payload: SaveVoucherInput, id?: number): Promise<VoucherDetail>
  getSettings(): KernelSettings
  lockDate(): string | null
  /** Practice clock when `Asetus.Harjoitus` is on; otherwise wall today. */
  today(): string
  isPractice(): boolean
}

export interface PostingHook {
  /** Extra posted lines (e.g. cash-basis VAT realization) before insert. */
  expandPostedLines?(
    db: SqliteDb,
    lines: import('../types').SaveEntryInput[],
    date: string,
  ): import('../types').SaveEntryInput[]
  onAfterDelete?(db: SqliteDb, date: string, type: number): void
}

export type { BookModules } from './registry'

export type WriteJson = <T>(path: string, method: string, body?: unknown) => Promise<T>

export type ModuleRouteCtx = {
  method: string
  path: string
  query: URLSearchParams
  readJson: <T>() => Promise<T>
  readBody: () => Promise<Uint8Array>
  sendJson: (status: number, body: unknown) => void
  match: (
    method: string,
    pathname: string,
    wantMethod: string,
    pattern: string,
  ) => Record<string, string> | null
  modules: import('./registry').BookModules
}

export interface TilariModule<TService> {
  id: string
  createService(kernel: KernelContext): TService
  postingHooks?: PostingHook[]
  handleRoutes?(ctx: ModuleRouteCtx): Promise<boolean>
  createHttp?(writeJson: WriteJson, afterMutate: () => void): TService
}

export interface ComposedBook {
  kernel: KernelContext
  modules: import('./registry').BookModules
}
