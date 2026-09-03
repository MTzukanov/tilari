import { periodEndModule } from './periodEnd'
import { vatModule } from './vat'
import type { KernelContext } from './types'

/** Compile-time domain modules. Add a service here — types and hooks follow. */
export const BOOK_MODULES = {
  vat: vatModule,
  periodEnd: periodEndModule,
} as const

export type BookModuleId = keyof typeof BOOK_MODULES

export type BookModules = {
  [K in BookModuleId]: ReturnType<(typeof BOOK_MODULES)[K]['createService']>
}

export function createBookModules(kernel: KernelContext): BookModules {
  return Object.fromEntries(
    (Object.keys(BOOK_MODULES) as BookModuleId[]).map((id) => [
      id,
      BOOK_MODULES[id].createService(kernel),
    ]),
  ) as BookModules
}

export function allPostingHooks() {
  return Object.values(BOOK_MODULES).flatMap((m) => m.postingHooks ?? [])
}
