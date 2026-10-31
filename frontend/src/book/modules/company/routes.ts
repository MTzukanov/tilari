import type { ModuleRouteCtx } from '../types'
import type { CompanyChanges } from './domain/types'
import type { CompanyQuery } from './service'

const ROUTE = /^\/api\/company(?:\/(alerts|candidates|changes))?$/

function companyQuery(query: URLSearchParams): CompanyQuery {
  return { asOf: query.get('as_of') || null }
}

/** /api/company* - company documents and deadlines. */
export async function handleCompanyRoutes(ctx: ModuleRouteCtx): Promise<boolean> {
  const m = ctx.path.match(ROUTE)
  if (!m) return false
  const [, segment] = m
  const { method, query } = ctx
  const company = ctx.modules.company

  if (segment === 'changes') {
    if (method !== 'POST') return false
    ctx.sendJson(200, await company.applyChanges(await ctx.readJson<CompanyChanges>(), companyQuery(query)))
    return true
  }
  if (method !== 'GET') return false
  if (!segment) ctx.sendJson(200, await company.fetchOverview(companyQuery(query)))
  else if (segment === 'alerts') ctx.sendJson(200, await company.fetchAlerts(companyQuery(query)))
  else ctx.sendJson(200, await company.fetchCandidates(query.get('all') === '1'))
  return true
}
