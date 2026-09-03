/**
 * Node /api/books locker. Same-origin when this UI is served by Tilari Node;
 * otherwise a user-pasted VPS origin (BYO). Never a Tilari-hosted cloud.
 */
import {
  apiFetch,
  lockerErrorFromBody,
  parseHttpError,
  xhrTransfer,
  type TransferOpts,
} from '../../http'
import type { HttpLockerSettings, LockerBackend, LockerBookInfo, LockerPutResult } from './types'

let customOrigin: string | null = null
let sameOriginAvailable = false

export function setHttpLockerSameOrigin(ok: boolean): void {
  sameOriginAvailable = ok
}

export function setHttpLockerOrigin(origin: string | null): void {
  customOrigin = origin
}

export function getHttpLockerOrigin(): string | null {
  return customOrigin
}

export function httpLockerUsesSameOrigin(): boolean {
  return sameOriginAvailable && !customOrigin
}

export function resetHttpLockerState(): void {
  customOrigin = null
  sameOriginAvailable = false
}

export function parseHttpLockerSettings(raw: unknown): HttpLockerSettings {
  if (!raw || typeof raw !== 'object') throw new Error('locker_http_url')
  let url = String((raw as { url?: unknown }).url || '')
    .trim()
    .replace(/\/+$/, '')
  if (/\/api$/i.test(url)) url = url.slice(0, -4).replace(/\/+$/, '')
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('locker_http_url')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('locker_http_url')
    url = `${parsed.protocol}//${parsed.host}`
  } catch (err) {
    if (err instanceof Error && err.message === 'locker_http_url') throw err
    throw new Error('locker_http_url')
  }
  return { url }
}

function pageOrigin(): string | null {
  try {
    return typeof location !== 'undefined' ? location.origin : null
  } catch {
    return null
  }
}

/** If the pasted URL is this page's origin, use relative `/api` (same-origin locker). */
export function resolveHttpLockerOrigin(url: string): string | null {
  const page = pageOrigin()
  if (page && url === page) return null
  return url
}

function apiUrl(path: string): string {
  return customOrigin ? `${customOrigin}${path}` : path
}

function xhrBodyText(xhr: XMLHttpRequest): string {
  if (typeof xhr.response === 'string') return xhr.response
  if (xhr.response instanceof ArrayBuffer) return new TextDecoder().decode(xhr.response)
  return xhr.responseText || ''
}

async function lockerList(): Promise<LockerBookInfo[]> {
  const res = await apiFetch(apiUrl('/api/books'))
  if (res.status === 404) return []
  if (!res.ok) throw new Error(await parseHttpError(res))
  const body = (await res.json()) as { books: LockerBookInfo[] }
  return body.books
}

async function lockerGet(
  id: string,
  opts: TransferOpts = {},
): Promise<{ bytes: Uint8Array; etag: string; attachmentsEtag: string; name: string }> {
  const xhr = await xhrTransfer('GET', apiUrl(`/api/books/${id}`), {
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
  const xhr = await xhrTransfer('GET', apiUrl(`/api/books/${id}/attachments`), {
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
  const xhr = await xhrTransfer('GET', apiUrl(`/api/books/${id}/attachments/${sha}`), {
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
  const path = apiUrl(id ? `/api/books/${id}` : '/api/books')
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
  const xhr = await xhrTransfer('PUT', apiUrl(`/api/books/${id}/attachments`), {
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
  const res = await apiFetch(apiUrl(`/api/books/${id}`), { method: 'DELETE' })
  if (res.status === 404) throw new Error('book_not_found')
  if (!res.ok && res.status !== 204) throw new Error(await parseHttpError(res))
}

export class HttpLockerBackend implements LockerBackend {
  readonly id = 'http' as const

  get supportsHttpEngine() {
    return httpLockerUsesSameOrigin()
  }

  async connect(): Promise<void> {
    /* origin is set via connectHttpLocker / same-origin probe */
  }

  disconnect(): void {
    customOrigin = null
  }

  isReady(): boolean {
    return Boolean(customOrigin) || sameOriginAvailable
  }

  private requireReady(): void {
    if (!this.isReady()) throw new Error('locker_not_configured')
  }

  list(): Promise<LockerBookInfo[]> {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerList()
  }

  get(id: string, opts?: TransferOpts) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerGet(id, opts)
  }

  put(id: string | null, bytes: Uint8Array, name: string, etag?: string, opts?: TransferOpts) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerPut(id, bytes, name, etag, opts)
  }

  getAttachments(id: string, opts?: TransferOpts) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerGetAttachments(id, opts)
  }

  getAttachmentBlob(id: string, sha: string, opts?: TransferOpts) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerGetAttachmentBlob(id, sha, opts)
  }

  putAttachments(id: string, pack: Uint8Array, etag: string, opts?: TransferOpts) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerPutAttachments(id, pack, etag, opts)
  }

  remove(id: string) {
    try {
      this.requireReady()
    } catch (err) {
      return Promise.reject(err)
    }
    return lockerRemove(id)
  }
}

export const httpLocker = new HttpLockerBackend()
