/**
 * Minimal HTTP helpers (stdlib only). Replaces Hono for the ledger server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BookError } from '../../frontend/src/book/errors.ts'

export async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req)
  if (!buf.length) return {} as T
  try {
    return JSON.parse(buf.toString('utf8')) as T
  } catch {
    throw new BookError('invalid JSON', 400)
  }
}

/** Parse a single multipart file field named `file` (browser FormData). */
export async function readMultipartFile(
  req: IncomingMessage,
): Promise<{ name: string; type: string; data: Uint8Array }> {
  const ct = req.headers['content-type'] || ''
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct)
  if (!m) throw new BookError('multipart boundary missing', 400)
  const boundary = (m[1] || m[2] || '').trim()
  const body = await readBody(req)
  const sep = Buffer.from(`--${boundary}`)
  let start = body.indexOf(sep)
  if (start < 0) throw new BookError('file required', 400)
  start += sep.length
  if (body[start] === 45 && body[start + 1] === 45) throw new BookError('file required', 400) // --
  if (body[start] === 13 && body[start + 1] === 10) start += 2

  const next = body.indexOf(sep, start)
  const part = body.subarray(start, next < 0 ? body.length : next - 2) // trim trailing \r\n
  const headerEnd = part.indexOf('\r\n\r\n')
  if (headerEnd < 0) throw new BookError('file required', 400)
  const headers = part.subarray(0, headerEnd).toString('utf8')
  const data = new Uint8Array(part.subarray(headerEnd + 4))

  if (!/name="file"/i.test(headers)) throw new BookError('file required', 400)
  const nameMatch = /filename="([^"]*)"/i.exec(headers)
  const typeMatch = /Content-Type:\s*(\S+)/i.exec(headers)
  return {
    name: nameMatch?.[1] || 'book.kitsas',
    type: typeMatch?.[1] || 'application/octet-stream',
    data,
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(raw),
    ...corsHeaders(),
  })
  res.end(raw)
}

export function sendEmpty(res: ServerResponse, status: number): void {
  res.writeHead(status, corsHeaders())
  res.end()
}

export function sendBytes(
  res: ServerResponse,
  status: number,
  data: Uint8Array,
  headers: Record<string, string>,
): void {
  res.writeHead(status, {
    ...corsHeaders(),
    ...headers,
    'Content-Length': data.byteLength,
  })
  res.end(Buffer.from(data))
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-Match, X-Tilari-Name',
    'Access-Control-Expose-Headers':
      'ETag, X-Tilari-Name, X-Tilari-Attachments-Sha256, Content-Disposition',
    'Access-Control-Allow-Private-Network': 'true',
  }
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof BookError) {
    sendJson(res, err.status, { detail: err.message })
    return
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'no_book') {
    sendJson(res, 409, { detail: 'no_book' })
    return
  }
  console.error(err)
  sendJson(res, 500, { detail: msg })
}
