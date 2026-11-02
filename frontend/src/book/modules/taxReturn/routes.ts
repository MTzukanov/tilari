import type { ModuleRouteCtx } from '../types'
import type { Target } from './domain/mapping'
import type { DebtTerm, TaxReturnInputs } from './domain/types'

const ROUTE = /^\/api\/tax-return(?:\/(inputs|mapping|terms))?$/

/** /api/tax-return* - the 6B's figures and the owner's inputs. */
export async function handleTaxReturnRoutes(ctx: ModuleRouteCtx): Promise<boolean> {
  const m = ctx.path.match(ROUTE)
  if (!m) return false
  const [, segment] = m
  const { method, query } = ctx
  const ends = query.get('ends') ?? ''
  const service = ctx.modules.taxReturn

  if (!segment) {
    if (method !== 'GET') return false
    ctx.sendJson(200, await service.fetchReturn(ends))
    return true
  }
  if (method !== 'POST') return false
  if (segment === 'inputs') ctx.sendJson(200, await service.saveInputs(ends, await ctx.readJson<TaxReturnInputs>()))
  else if (segment === 'terms') ctx.sendJson(200, await service.saveTerms(ends, await ctx.readJson<Record<string, DebtTerm | null>>()))
  else ctx.sendJson(200, await service.saveMapping(ends, await ctx.readJson<Record<string, Target | null>>()))
  return true
}
