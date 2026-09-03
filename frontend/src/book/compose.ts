import { registerPostingHooks } from './kernel/postingHooks'
import { allPostingHooks, createBookModules } from './modules/registry'
import type { BookModules, ComposedBook, KernelContext } from './modules/types'

let hooksRegistered = false

function composeBook(kernel: KernelContext): ComposedBook {
  if (!hooksRegistered) {
    registerPostingHooks(allPostingHooks())
    hooksRegistered = true
  }
  return { kernel, modules: createBookModules(kernel) }
}

export function attachModules(kernel: KernelContext): BookModules {
  return composeBook(kernel).modules
}
