/**
 * HTTP routes for thin object store (/api/objects).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readBody, readJson, sendBytes, sendEmpty, sendJson } from '../httpUtil.ts'
import {
  ObjectPathError,
  objectDownload,
  objectExists,
  objectList,
  objectRemove,
  objectUpload,
} from './objectStore.ts'

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/** @returns true if handled */
export async function handleObjects(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
): Promise<boolean> {
  if (!path.startsWith('/api/objects')) return false

  try {
    if (method === 'POST' && path === '/api/objects/list') {
      const body = await readJson<{ prefix?: string; limit?: number; offset?: number }>(req)
      const objects = objectList(String(body.prefix || ''), {
        limit: body.limit,
        offset: body.offset,
      })
      sendJson(res, 200, { objects })
      return true
    }

    if (method === 'DELETE' && path === '/api/objects') {
      const body = await readJson<{ prefixes?: string[] }>(req)
      objectRemove(Array.isArray(body.prefixes) ? body.prefixes.map(String) : [])
      sendEmpty(res, 204)
      return true
    }

    if (!path.startsWith('/api/objects/')) return false
    const rel = decodeURIComponent(path.slice('/api/objects/'.length))

    if (method === 'HEAD') {
      if (!objectExists(rel)) {
        sendEmpty(res, 404)
        return true
      }
      sendEmpty(res, 200)
      return true
    }

    if (method === 'GET') {
      const data = objectDownload(rel)
      if (!data) {
        sendJson(res, 404, { detail: 'not_found' })
        return true
      }
      sendBytes(res, 200, data, { 'Content-Type': 'application/octet-stream' })
      return true
    }

    if (method === 'PUT' || method === 'POST') {
      const upsert =
        method === 'PUT' || String(header(req, 'x-upsert') || '').toLowerCase() === 'true'
      const data = new Uint8Array(await readBody(req))
      try {
        objectUpload(rel, data, { upsert })
      } catch (err) {
        if (err instanceof Error && (err.name === 'ObjectDuplicate' || err.message === 'duplicate')) {
          sendJson(res, 409, { detail: 'duplicate' })
          return true
        }
        throw err
      }
      sendEmpty(res, 200)
      return true
    }
  } catch (err) {
    if (err instanceof ObjectPathError) {
      sendJson(res, 400, { detail: 'invalid_path' })
      return true
    }
    throw err
  }

  return false
}
