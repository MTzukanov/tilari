/**
 * Unified Tilari HTTP app: locker + shared Ledger HTTP + static UI + stubs.
 * Locker stays in `./locker/` — no Ledger imports there.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import type { SaveVoucherInput, SaveAllocationInput } from '../../frontend/src/book/types.ts'
import { BookError } from '../../frontend/src/book/errors.ts'
import {
  corsHeaders,
  readBody,
  readJson,
  readMultipartFile,
  sendBytes,
  sendEmpty,
  sendError,
  sendJson,
} from './httpUtil.ts'
import { handleLocker } from './locker/routes.ts'
import { getAttachmentBlob, getBook } from './locker/store.ts'
import { ledger } from './session.ts'
import { getReloadSource, setReloadSource } from './reloadSource.ts'
import { handleStatic } from './staticUi.ts'
import { BOOK_MODULES } from '../../frontend/src/book/modules/registry.ts'

const STUB_BODY = {
  code: 'not_in_version',
  see: 'docs/SCOPE.md',
  detail: 'Ei tässä versiossa',
}

export function match(
  method: string,
  pathname: string,
  wantMethod: string,
  pattern: string,
): Record<string, string> | null {
  if (method !== wantMethod) return null
  const pp = pattern.split('/').filter(Boolean)
  const uu = pathname.split('/').filter(Boolean)
  if (pp.length !== uu.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(uu[i])
    else if (pp[i] !== uu[i]) return null
  }
  return params
}

function need(v: string | null, name: string): string {
  if (!v) throw new BookError(`${name} required`, 400)
  return v
}

function isStubPath(path: string): boolean {
  return path === '/api/billing' ||
    path.startsWith('/api/billing/') ||
    path === '/api/workflow' ||
    path.startsWith('/api/workflow/')
}

async function handleLedger(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  q: URLSearchParams,
): Promise<boolean> {
  let p: Record<string, string> | null

  if (match(method, path, 'GET', '/api/meta')) {
    sendJson(res, 200, ledger.buildMeta())
    return true
  }
  if (match(method, path, 'PUT', '/api/practice-date')) {
    const body = await readJson<{ date?: string }>(req)
    sendJson(res, 200, await ledger.setPracticeDate(need(body.date ?? null, 'date')))
    return true
  }
  if (match(method, path, 'GET', '/api/session/changes')) {
    sendJson(res, 200, { changes: await ledger.listSessionChanges() })
    return true
  }
  if (match(method, path, 'POST', '/api/session/saved')) {
    const body = await readJson<{ target?: string; name?: string }>(req)
    const target = body.target === 'disk' ? 'disk' : 'locker'
    await ledger.recordBookSaved({
      target,
      ...(body.name ? { name: body.name } : {}),
    })
    sendJson(res, 200, { ok: true })
    return true
  }
  if (match(method, path, 'GET', '/api/export')) {
    const bytes = ledger.exportBytes()
    const name = ledger.buildMeta().source_name || 'book.kitsas'
    const ascii = name.replace(/[^\x20-\x7E]/g, '?')
    sendBytes(res, 200, bytes, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${ascii}"`,
      'X-Tilari-Name': encodeURIComponent(name),
    })
    return true
  }
  if (match(method, path, 'POST', '/api/open')) {
    const file = await readMultipartFile(req)
    if (!file.name.toLowerCase().endsWith('.kitsas')) {
      throw new BookError('File must have a .kitsas extension', 400)
    }
    sendJson(
      res,
      200,
      await ledger.openBytes(file.data, { sourceName: file.name, dbPath: `server:${file.name}` }),
    )
    setReloadSource({ type: 'upload', name: file.name, data: file.data })
    return true
  }
  if (match(method, path, 'POST', '/api/open-path')) {
    const body = await readJson<{ path?: string }>(req)
    if (!body.path) throw new BookError('path required', 400)
    const bytes = new Uint8Array(await readFile(body.path))
    const name = body.path.split(/[/\\]/).pop() || 'book.kitsas'
    sendJson(res, 200, await ledger.openBytes(bytes, { sourceName: name, dbPath: `server:${name}` }))
    setReloadSource({ type: 'path', path: body.path, name })
    return true
  }
  if ((p = match(method, path, 'POST', '/api/open-locker/:id'))) {
    const found = getBook(p.id)
    if (!found) throw new BookError('book_not_found', 404)
    const meta = await ledger.openBytes(new Uint8Array(found.data), {
      sourceName: found.meta.name,
      dbPath: `locker:${p.id}`,
    })
    setReloadSource({ type: 'locker', id: p.id, name: found.meta.name })
    sendJson(res, 200, {
      ...meta,
      locker_etag: found.meta.sha256,
      locker_attachments_etag: found.meta.attachments_sha256,
    })
    return true
  }
  if (match(method, path, 'GET', '/api/balances')) {
    sendJson(res, 200, await ledger.fetchBalances(need(q.get('date'), 'date')))
    return true
  }
  if (match(method, path, 'GET', '/api/overview')) {
    sendJson(res, 200, await ledger.fetchOverview(need(q.get('date'), 'date')))
    return true
  }
  if (match(method, path, 'GET', '/api/entries')) {
    const account = Number(q.get('account'))
    if (!account) throw new BookError('account required', 400)
    sendJson(
      res,
      200,
      await ledger.fetchEntries(
        account,
        need(q.get('start_date'), 'start_date'),
        need(q.get('end_date'), 'end_date'),
      ),
    )
    return true
  }
  if ((p = match(method, path, 'GET', '/api/vouchers/:id'))) {
    sendJson(res, 200, await ledger.fetchVoucher(Number(p.id)))
    return true
  }
  if (match(method, path, 'GET', '/api/vouchers')) {
    const typeQ = q.get('type')
    sendJson(
      res,
      200,
      await ledger.fetchVouchers({
        start_date: q.get('start_date') || undefined,
        end_date: q.get('end_date') || undefined,
        type: typeQ != null ? Number(typeQ) : undefined,
        status: q.get('status') || undefined,
        q: q.get('q') || undefined,
        huomio: q.get('huomio') === '1' || q.get('huomio') === 'true',
      }),
    )
    return true
  }
  if (match(method, path, 'POST', '/api/vouchers')) {
    sendJson(res, 200, await ledger.saveVoucher((await readJson(req)) as SaveVoucherInput))
    return true
  }
  if ((p = match(method, path, 'PUT', '/api/vouchers/:id'))) {
    sendJson(res, 200, await ledger.saveVoucher((await readJson(req)) as SaveVoucherInput, Number(p.id)))
    return true
  }
  if ((p = match(method, path, 'DELETE', '/api/vouchers/:id'))) {
    await ledger.deleteVoucher(Number(p.id))
    sendEmpty(res, 204)
    return true
  }
  if ((p = match(method, path, 'POST', '/api/vouchers/:id/split'))) {
    const body = await readJson<{ entry_id: number; type?: number }>(req)
    sendJson(res, 200, await ledger.splitBankStatement(Number(p.id), body.entry_id, body.type, body.entry_ids))
    return true
  }
  if (match(method, path, 'GET', '/api/bank-statement/overlay')) {
    const account = Number(q.get('account'))
    if (!account) throw new BookError('account required', 400)
    sendJson(
      res,
      200,
      await ledger.fetchBankStatementOverlay({
        account,
        startDate: need(q.get('start_date'), 'start_date'),
        endDate: need(q.get('end_date'), 'end_date'),
        excludeVoucherId: q.get('exclude_voucher') ? Number(q.get('exclude_voucher')) : null,
      }),
    )
    return true
  }
  if ((p = match(method, path, 'POST', '/api/vouchers/:id/attachments'))) {
    const file = await readMultipartFile(req)
    const attached = await ledger.uploadAttachmentBytes(
      Number(p.id),
      { name: file.name || 'attachment', type: file.type, data: file.data },
      { lean: false },
    )
    sendJson(res, 200, { id: attached.id })
    return true
  }
  if ((p = match(method, path, 'GET', '/api/attachments/:id'))) {
    const meta = ledger.attachmentMeta(Number(p.id))
    if (!meta) throw new BookError('Liite not found', 404)
    // Locker books are lean: Liite.data is NULL; blobs live under {id}.attachments/.
    let data = meta.data
    if (!data && meta.sha) {
      const dbPath = ledger.buildMeta().db_path
      if (dbPath?.startsWith('locker:')) {
        const blob = getAttachmentBlob(dbPath.slice('locker:'.length), meta.sha)
        if (blob) data = new Uint8Array(blob)
      }
    }
    if (!data) throw new BookError('Liite not found', 404)
    sendBytes(res, 200, data, {
      'Content-Type': meta.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${meta.name || 'attachment'}"`,
    })
    return true
  }
  if (match(method, path, 'GET', '/api/journal')) {
    sendJson(
      res,
      200,
      await ledger.fetchJournal(need(q.get('start_date'), 'start_date'), need(q.get('end_date'), 'end_date')),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/browse/entries')) {
    const accountQ = q.get('account')
    sendJson(
      res,
      200,
      await ledger.fetchBrowseEntries({
        start_date: q.get('start_date') || undefined,
        end_date: q.get('end_date') || undefined,
        status: q.get('status') || undefined,
        q: q.get('q') || undefined,
        huomio: q.get('huomio') === '1' || q.get('huomio') === 'true',
        account: accountQ != null && accountQ !== '' ? Number(accountQ) : undefined,
      }),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/accounts')) {
    sendJson(res, 200, await ledger.fetchAccounts())
    return true
  }
  if ((p = match(method, path, 'PUT', '/api/accounts/:number'))) {
    sendJson(res, 200, await ledger.saveAccount(Number(p.number), await readJson(req)))
    return true
  }
  if (match(method, path, 'GET', '/api/partners')) {
    sendJson(res, 200, await ledger.fetchPartners())
    return true
  }
  if (match(method, path, 'GET', '/api/allocations')) {
    sendJson(res, 200, await ledger.fetchAllocations())
    return true
  }
  if ((p = match(method, path, 'GET', '/api/allocations/:id'))) {
    sendJson(res, 200, await ledger.fetchAllocation(Number(p.id)))
    return true
  }
  if (match(method, path, 'POST', '/api/allocations')) {
    sendJson(res, 200, await ledger.saveAllocation((await readJson(req)) as SaveAllocationInput))
    return true
  }
  if ((p = match(method, path, 'PUT', '/api/allocations/:id'))) {
    sendJson(res, 200, await ledger.saveAllocation((await readJson(req)) as SaveAllocationInput, Number(p.id)))
    return true
  }
  if ((p = match(method, path, 'GET', '/api/allocations/:id/balances'))) {
    sendJson(
      res,
      200,
      await ledger.fetchAllocationBalances(
        Number(p.id),
        need(q.get('start_date'), 'start_date'),
        need(q.get('end_date'), 'end_date'),
        q.get('include_projects') === 'true',
      ),
    )
    return true
  }
  if ((p = match(method, path, 'GET', '/api/allocations/:id/entries'))) {
    sendJson(
      res,
      200,
      await ledger.fetchAllocationEntries(
        Number(p.id),
        need(q.get('start_date'), 'start_date'),
        need(q.get('end_date'), 'end_date'),
        q.get('include_projects') === 'true',
        q.get('pnl_only') === 'true',
      ),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/allocations-summary')) {
    sendJson(
      res,
      200,
      await ledger.fetchAllocationsSummary(
        need(q.get('start_date'), 'start_date'),
        need(q.get('end_date'), 'end_date'),
        q.get('include_projects') === 'true',
      ),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/balance-sheet-items')) {
    sendJson(
      res,
      200,
      await ledger.fetchBalanceSheetItems(
        need(q.get('start_date'), 'start_date'),
        need(q.get('end_date'), 'end_date'),
      ),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/settings')) {
    sendJson(res, 200, await ledger.fetchSettings())
    return true
  }
  if (match(method, path, 'PUT', '/api/settings')) {
    sendJson(res, 200, await ledger.saveSettings(await readJson(req)))
    return true
  }
  if (match(method, path, 'PUT', '/api/fiscal-periods')) {
    const body = await readJson<{
      starts: string
      ends: string
      replace_starts?: string | null
      headcount?: number | null
    }>(req)
    sendJson(
      res,
      200,
      await ledger.saveFiscalPeriod(body.starts, body.ends, {
        replace_starts: body.replace_starts,
        headcount: body.headcount,
      }),
    )
    return true
  }
  if (match(method, path, 'GET', '/api/fiscal-periods')) {
    sendJson(res, 200, await ledger.fetchFiscalPeriods())
    return true
  }
  const moduleCtx = {
    method,
    path,
    query: q,
    readJson: <T>() => readJson<T>(req),
    readBody: async () => new Uint8Array(await readBody(req)),
    sendJson: (status: number, body: unknown) => sendJson(res, status, body),
    match,
    modules: ledger.modules,
  }
  for (const mod of Object.values(BOOK_MODULES)) {
    if (await mod.handleRoutes?.(moduleCtx)) return true
  }
  if (match(method, path, 'POST', '/api/reload')) {
    if (!ledger.isOpen()) throw new BookError('no_book', 409)
    const source = getReloadSource()
    if (!source) throw new BookError('reload_unavailable', 409)
    const prev = ledger.buildMeta()
    ledger.closeLedger()
    let meta
    if (source.type === 'path') {
      const bytes = new Uint8Array(await readFile(source.path))
      meta = await ledger.openBytes(bytes, {
        sourceName: source.name,
        dbPath: prev.db_path,
        sessionId: prev.session_id,
      })
    } else if (source.type === 'locker') {
      const found = getBook(source.id)
      if (!found) throw new BookError('book_not_found', 404)
      meta = await ledger.openBytes(new Uint8Array(found.data), {
        sourceName: found.meta.name,
        dbPath: `locker:${source.id}`,
        sessionId: prev.session_id,
      })
    } else {
      meta = await ledger.openBytes(source.data, {
        sourceName: source.name,
        dbPath: prev.db_path,
        sessionId: prev.session_id,
      })
    }
    sendJson(res, 200, meta)
    return true
  }
  if (match(method, path, 'POST', '/api/close')) {
    ledger.closeLedger()
    setReloadSource(null)
    sendJson(res, 200, { ok: true })
    return true
  }

  return false
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  const path = url.pathname
  const q = url.searchParams
  const method = req.method || 'GET'

  if (match(method, path, 'GET', '/api/health')) {
    sendJson(res, 200, ledger.health({ engine: 'node', locker: true, dirty: ledger.isDirty() }))
    return
  }

  if (isStubPath(path) && ['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    sendJson(res, 501, { detail: STUB_BODY })
    return
  }

  if (await handleLocker(req, res, method, path, null, match)) return
  if (await handleLedger(req, res, method, path, q)) return
  if (handleStatic(req, res, path)) return

  sendJson(res, 404, { detail: 'not found' })
}

export type ListenOpts = { host?: string; port?: number }

export function startServer(opts: ListenOpts = {}): Server {
  const host = opts.host ?? process.env.TILARI_HOST ?? '127.0.0.1'
  const port = opts.port ?? Number(process.env.TILARI_PORT || process.env.TILARI_LEDGER_PORT || 8000)

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => sendError(res, err))
  })

  server.listen(port, host, () => {
    console.log(`Tilari (locker + ledger) on http://${host}:${port}`)
  })
  return server
}
