import type { TaxCalculation } from '../../fiscalPeriod'
import type { ModuleRouteCtx } from '../types'
import type { PmaSize } from './domain/statementTemplate'

/** /api/fiscal-periods/:ends/* closing actions. Period list/CRUD stay on the kernel. */
export async function handlePeriodEndRoutes(ctx: ModuleRouteCtx): Promise<boolean> {
  const closing = ctx.path.match(/^\/api\/fiscal-periods\/(\d{4}-\d{2}-\d{2})\/(\w[\w-]*)$/)
  if (!closing) return false
  const ends = closing[1]
  const action = closing[2]
  const { method } = ctx
  const pe = ctx.modules.periodEnd

  if (method === 'GET' && action === 'closing') {
    ctx.sendJson(200, await pe.fetchClosing(ends))
    return true
  }
  if (method === 'POST' && action === 'depreciation') {
    ctx.sendJson(200, await pe.createDepreciation(ends))
    return true
  }
  if (method === 'POST' && action === 'accrual') {
    ctx.sendJson(200, await pe.createAccrual(ends))
    return true
  }
  if (action === 'tax' && method === 'DELETE') {
    await pe.clearTax(ends)
    ctx.sendJson(200, {})
    return true
  }
  if (action === 'tax' && (method === 'PUT' || method === 'POST')) {
    const tax = await ctx.readJson<TaxCalculation>()
    ctx.sendJson(200, method === 'PUT' ? await pe.saveTax(ends, tax) : await pe.createIncomeTax(ends, tax))
    return true
  }
  if (method === 'POST' && action === 'lock') {
    ctx.sendJson(200, await pe.lockPeriod(ends))
    return true
  }
  if (method === 'POST' && action === 'unlock') {
    ctx.sendJson(200, await pe.unlockPeriod(ends))
    return true
  }
  if (method === 'POST' && action === 'confirm') {
    ctx.sendJson(200, await pe.confirmStatement(ends))
    return true
  }
  if (method === 'POST' && action === 'unconfirm') {
    ctx.sendJson(200, await pe.unconfirmStatement(ends))
    return true
  }
  if (method === 'GET' && action === 'print') {
    ctx.sendJson(200, await pe.fetchStatementPrint(ends))
    return true
  }
  if (action === 'statement') {
    if (method === 'GET') {
      ctx.sendJson(200, await pe.fetchStatement(ends))
      return true
    }
    if (method === 'POST') {
      const body = await ctx.readJson<{ size: PmaSize; selected: string[]; headcount: number | null }>()
      ctx.sendJson(200, await pe.startStatement(ends, body))
      return true
    }
    if (method === 'PUT') {
      const body = await ctx.readJson<{ html: string }>()
      ctx.sendJson(200, await pe.saveStatement(ends, body.html))
      return true
    }
  }
  if (method === 'POST' && action === 'statement-pdf') {
    const pdf = await ctx.readBody()
    ctx.sendJson(200, await pe.uploadStatementPdf(ends, new Uint8Array(pdf)))
    return true
  }
  return false
}
