import { sendJson } from './http'
import { BOOK_MODULES, type BookModuleId, type BookModules } from './modules/registry'
import type { WriteJson } from './modules/types'

export function createHttpModules(writeJson: WriteJson, afterMutate: () => void): BookModules {
  return Object.fromEntries(
    (Object.keys(BOOK_MODULES) as BookModuleId[]).map((id) => {
      const createHttp = BOOK_MODULES[id].createHttp
      if (!createHttp) throw new Error(`missing createHttp: ${String(id)}`)
      return [id, createHttp(writeJson, afterMutate)]
    }),
  ) as BookModules
}

export { sendJson }
