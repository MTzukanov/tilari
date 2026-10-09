import type { ModuleRouteCtx } from '../types'
import type { SetupApplyInput } from './domain/types'
import type { PropertyQuery } from './service'

const ROUTE = /^\/api\/properties(?:\/(setup|settings|\d+)(?:\/(documents))?)?$/

function propertyQuery(query: URLSearchParams): PropertyQuery {
  const target = query.get('target_bp')
  return {
    asOf: query.get('as_of') || null,
    targetBp: target != null && /^\d+$/.test(target) ? Number(target) : null,
  }
}

/** /api/properties* - rental objects. */
export async function handlePropertiesRoutes(ctx: ModuleRouteCtx): Promise<boolean> {
  const m = ctx.path.match(ROUTE)
  if (!m) return false
  const [, segment, sub] = m
  const { method, query } = ctx
  const props = ctx.modules.properties

  if (!segment) {
    if (method !== 'GET') return false
    ctx.sendJson(200, await props.listProperties(propertyQuery(query)))
    return true
  }
  if (segment === 'setup' && !sub) {
    if (method === 'GET') ctx.sendJson(200, await props.fetchSetup())
    else if (method === 'POST') ctx.sendJson(200, await props.applySetup(await ctx.readJson<SetupApplyInput>()))
    else return false
    return true
  }
  if (segment === 'settings' && !sub) {
    if (method === 'GET') ctx.sendJson(200, await props.fetchPortfolioSettings())
    else if (method === 'PUT') ctx.sendJson(200, await props.savePortfolioSettings(await ctx.readJson<unknown>()))
    else return false
    return true
  }
  if (!/^\d+$/.test(segment)) return false
  const id = Number(segment)
  if (sub === 'documents') {
    if (method !== 'GET') return false
    ctx.sendJson(200, await props.fetchPropertyDocuments(id, query.get('bank') === '1'))
    return true
  }
  if (method === 'GET') ctx.sendJson(200, await props.fetchProperty(id, propertyQuery(query)))
  else if (method === 'PUT') ctx.sendJson(200, await props.saveProperty(id, await ctx.readJson<unknown>(), propertyQuery(query)))
  else if (method === 'DELETE') ctx.sendJson(200, await props.deleteProperty(id))
  else return false
  return true
}
