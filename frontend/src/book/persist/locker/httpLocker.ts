/**
 * Node /api/books locker. Behavior matches the previous http.ts locker helpers.
 */
import {
  apiFetch,
  lockerErrorFromBody,
  parseHttpError,
  xhrTransfer,
  type TransferOpts,
} from '../../http'
import type { LockerBackend, LockerBookInfo, LockerPutResult } from './types'

function xhrBodyText(xhr: XMLHttpRequest): string {
  if (typeof xhr.response === 'string') return xhr.response
  if (xhr.response instanceof ArrayBuffer) return new TextDecoder().decode(xhr.response)
  return xhr.responseText || ''
}

async function lockerList(): Promise<LockerBookInfo[]> {
  const res = await apiFetch('/api/books')
  if (res.status === 404) return []
  if (!res.ok) throw new Error(await parseHttpError(res))
  const body = (await res.json()) as { books: LockerBookInfo[] }
  return body.books
}

async function lockerGet(
  id: string,
  opts: TransferOpts = {},
): Promise<{ bytes: Uint8Array; etag: string; attachmentsEtag: string; name: string }> {
  const xhr = await xhrTransfer('GET', `/api/books/${id}`, {
    responseType: 'arraybuffer',
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
  if (xhr.status === 404) throw new Error('book_not_found')
  if (xhr.status < 200 || xhr.status >= 300) throw lockerErrorFromBody(xhr.status, xhrBodyText(xhr))
  const etag = (xhr.getResponseHeader('etag') || '').replaceAll('"', '')
  const attachmentsEtag = (xhr.getResponseHeader('x-tilari-attachments-sha256') || '').replaceAll(
    '"',
    '',
  )
  const name = decodeURIComponent(xhr.getResponseHeader('x-tilari-name') || `${id}.kitsas`)
  return { bytes: new Uint8Array(xhr.response as ArrayBuffer), etag, attachmentsEtag, name }
}

async function lockerGetAttachments(
  id: string,
  opts: TransferOpts = {},
): Promise<{ pack: Uint8Array; etag: string }> {
  const xhr = await xhrTransfer('GET', `/api/books/${id}/attachments`, {
    responseType: 'arraybuffer',
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
  if (xhr.status === 404) throw new Error('book_not_found')
  if (xhr.status < 200 || xhr.status >= 300) throw lockerErrorFromBody(xhr.status, xhrBodyText(xhr))
  const etag = (xhr.getResponseHeader('etag') || '').replaceAll('"', '')
  return { pack: new Uint8Array(xhr.response as ArrayBuffer), etag }
}

async function lockerGetAttachmentBlob(
  id: string,
  sha: string,
  opts: TransferOpts = {},
): Promise<Uint8Array> {
  const xhr = await xhrTransfer('GET', `/api/books/${id}/attachments/${sha}`, {
    responseType: 'arraybuffer',
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
  if (xhr.status === 404) throw new Error('attachment_not_found')
  if (xhr.status < 200 || xhr.status >= 300) throw lockerErrorFromBody(xhr.status, xhrBodyText(xhr))
  return new Uint8Array(xhr.response as ArrayBuffer)
}

async function lockerPut(
  id: string | null,
  bytes: Uint8Array,
  name: string,
  etag?: string,
  opts: TransferOpts = {},
): Promise<LockerPutResult> {
  if (id && !etag) throw new Error('etag_mismatch')
  const path = id ? `/api/books/${id}` : '/api/books'
  const method = id ? 'PUT' : 'POST'
  const xhr = await xhrTransfer(method, path, {
    body: bytes,
    responseType: 'text',
    signal: opts.signal,
    onProgress: opts.onProgress,
    onStage: opts.onStage,
    progressOnUpload: true,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Tilari-Name': encodeURIComponent(name),
      ...(etag ? { 'If-Match': `"${etag}"` } : {}),
    },
  })
  if (xhr.status < 200 || xhr.status >= 300) throw lockerErrorFromBody(xhr.status, xhrBodyText(xhr))
  return JSON.parse(xhr.responseText || xhrBodyText(xhr)) as LockerPutResult
}

async function lockerPutAttachments(
  id: string,
  pack: Uint8Array,
  etag: string,
  opts: TransferOpts = {},
): Promise<{ id: string; attachments_sha256: string }> {
  if (!etag) throw new Error('etag_mismatch')
  const xhr = await xhrTransfer('PUT', `/api/books/${id}/attachments`, {
    body: pack,
    responseType: 'text',
    signal: opts.signal,
    onProgress: opts.onProgress,
    onStage: opts.onStage,
    progressOnUpload: true,
    headers: {
      'Content-Type': 'application/octet-stream',
      'If-Match': `"${etag}"`,
    },
  })
  if (xhr.status < 200 || xhr.status >= 300) throw lockerErrorFromBody(xhr.status, xhrBodyText(xhr))
  return JSON.parse(xhr.responseText || xhrBodyText(xhr)) as { id: string; attachments_sha256: string }
}

async function lockerRemove(id: string): Promise<void> {
  const res = await apiFetch(`/api/books/${id}`, { method: 'DELETE' })
  if (res.status === 404) throw new Error('book_not_found')
  if (!res.ok && res.status !== 204) throw new Error(await parseHttpError(res))
}

export class HttpLockerBackend implements LockerBackend {
  readonly id = 'http' as const
  readonly supportsHttpEngine = true

  async connect(): Promise<void> {
    /* Node locker needs no credentials */
  }

  disconnect(): void {
    /* nothing stored */
  }

  isReady(): boolean {
    return true
  }

  list(): Promise<LockerBookInfo[]> {
    return lockerList()
  }

  get(id: string, opts?: TransferOpts) {
    return lockerGet(id, opts)
  }

  put(id: string | null, bytes: Uint8Array, name: string, etag?: string, opts?: TransferOpts) {
    return lockerPut(id, bytes, name, etag, opts)
  }

  getAttachments(id: string, opts?: TransferOpts) {
    return lockerGetAttachments(id, opts)
  }

  getAttachmentBlob(id: string, sha: string, opts?: TransferOpts) {
    return lockerGetAttachmentBlob(id, sha, opts)
  }

  putAttachments(id: string, pack: Uint8Array, etag: string, opts?: TransferOpts) {
    return lockerPutAttachments(id, pack, etag, opts)
  }

  remove(id: string) {
    return lockerRemove(id)
  }
}

export const httpLocker = new HttpLockerBackend()
