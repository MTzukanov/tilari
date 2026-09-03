import type { ModuleRouteCtx } from '../types'

/** GET/POST /api/vat — used by the Node shell. */
export async function handleVatRoutes(ctx: ModuleRouteCtx): Promise<boolean> {
  const { method, path, query, modules } = ctx
  if (ctx.match(method, path, 'GET', '/api/vat')) {
    ctx.sendJson(200, await modules.vat.fetchVat(query.get('start_date') || '', query.get('end_date') || ''))
    return true
  }
  if (ctx.match(method, path, 'POST', '/api/vat')) {
    const body = await ctx.readJson<{ start_date: string; end_date: string }>()
    ctx.sendJson(200, await modules.vat.createVat(body.start_date, body.end_date))
    return true
  }
  return false
}
