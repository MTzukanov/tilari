/**
 * HTTP routes for the opaque locker. Separate from Ledger session routes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readBody, sendBytes, sendJson } from '../httpUtil.ts'
import {
  LockerBadPack,
  LockerConflict,
  LockerNotFound,
  getAttachmentBlob,
  getAttachments,
  getBook,
  listBooks,
  putAttachments,
  putBook,
} from './store.ts'

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

function asciiFilename(name: string): string {
  return name.replace(/[^\x20-\x7E]/g, '?')
}

/** @returns true if the request was handled as a locker route */
export async function handleLocker(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  params: Record<string, string> | null,
  match: (
    method: string,
    pathname: string,
    wantMethod: string,
    pattern: string,
  ) => Record<string, string> | null,
): Promise<boolean> {
  let p = params

  if (match(method, path, 'GET', '/api/books')) {
    sendJson(res, 200, { books: listBooks() })
    return true
  }

  if ((p = match(method, path, 'GET', '/api/books/:id/attachments/:sha'))) {
    const data = getAttachmentBlob(p.id, p.sha.toLowerCase())
    if (!data) {
      sendJson(res, 404, { detail: 'attachment_not_found' })
      return true
    }
    sendBytes(res, 200, data, {
      'Content-Type': 'application/octet-stream',
      ETag: `"${p.sha.toLowerCase()}"`,
    })
    return true
  }

  if ((p = match(method, path, 'GET', '/api/books/:id/attachments'))) {
    const found = getAttachments(p.id)
    if (!found) {
      sendJson(res, 404, { detail: 'book_not_found' })
      return true
    }
    sendBytes(res, 200, found.pack, {
      'Content-Type': 'application/octet-stream',
      ETag: `"${found.meta.attachments_sha256}"`,
      'X-Tilari-Attachments-Sha256': found.meta.attachments_sha256,
      'Content-Disposition': `attachment; filename="${p.id}.attachments"`,
    })
    return true
  }

  if ((p = match(method, path, 'GET', '/api/books/:id'))) {
    const found = getBook(p.id)
    if (!found) {
      sendJson(res, 404, { detail: 'book_not_found' })
      return true
    }
    const name = found.meta.name || `${p.id}.kitsas`
    const quoted = encodeURIComponent(name)
    sendBytes(res, 200, found.data, {
      'Content-Type': 'application/octet-stream',
      ETag: `"${found.meta.sha256}"`,
      'X-Tilari-Name': quoted,
      'X-Tilari-Attachments-Sha256': found.meta.attachments_sha256 || '',
      'Content-Disposition': `attachment; filename="${asciiFilename(name)}"; filename*=UTF-8''${quoted}`,
    })
    return true
  }

  if (match(method, path, 'POST', '/api/books')) {
    const data = await readBody(req)
    if (!data.length) {
      sendJson(res, 400, { detail: 'empty_book' })
      return true
    }
    const name = decodeURIComponent(header(req, 'x-tilari-name') || 'book.kitsas')
    sendJson(res, 200, putBook(new Uint8Array(data), { name }))
    return true
  }

  if ((p = match(method, path, 'PUT', '/api/books/:id/attachments'))) {
    const data = await readBody(req)
    try {
      sendJson(
        res,
        200,
        putAttachments(new Uint8Array(data), {
          bookId: p.id,
          ifMatch: header(req, 'if-match'),
        }),
      )
    } catch (err) {
      if (err instanceof LockerNotFound) {
        sendJson(res, 404, { detail: 'book_not_found' })
        return true
      }
      if (err instanceof LockerBadPack) {
        sendJson(res, 400, { detail: err.detail })
        return true
      }
      if (err instanceof LockerConflict) {
        sendJson(res, 409, {
          detail: { code: 'etag_mismatch', current: err.current, kind: err.kind },
        })
        return true
      }
      throw err
    }
    return true
  }

  if ((p = match(method, path, 'PUT', '/api/books/:id'))) {
    const data = await readBody(req)
    if (!data.length) {
      sendJson(res, 400, { detail: 'empty_book' })
      return true
    }
    const name = decodeURIComponent(header(req, 'x-tilari-name') || 'book.kitsas')
    try {
      sendJson(
        res,
        200,
        putBook(new Uint8Array(data), {
          name,
          bookId: p.id,
          ifMatch: header(req, 'if-match'),
        }),
      )
    } catch (err) {
      if (err instanceof LockerConflict) {
        sendJson(res, 409, {
          detail: { code: 'etag_mismatch', current: err.current, kind: err.kind },
        })
        return true
      }
      throw err
    }
    return true
  }

  return false
}
