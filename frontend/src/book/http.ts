type AddressSpace = 'local' | 'loopback'

function targetAddressSpace(): AddressSpace | undefined {
  if (typeof location === 'undefined') return undefined
  const host = location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'loopback'
  return 'local'
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const space = targetAddressSpace()
  return fetch(path, {
    cache: 'no-store',
    ...init,
    ...(space ? { targetAddressSpace: space } : {}),
  } as RequestInit)
}

/** True when `url` is a Tilari Node `/api/health` JSON body (`{ ok: true }`). SPA HTML is not health. */
export async function probeNodeApi(url = '/api/health', timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await apiFetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return false
    const json: unknown = await res.json()
    return typeof json === 'object' && json !== null && (json as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}

export async function parseHttpError(res: Response): Promise<string> {
  const text = await res.text()
  if (res.status === 409) return 'etag_mismatch'
  try {
    const json = JSON.parse(text) as { detail?: string | { detail?: string; code?: string } }
    if (typeof json.detail === 'string') return json.detail
    if (json.detail && typeof json.detail === 'object') {
      if (json.detail.code === 'etag_mismatch') return 'etag_mismatch'
      if (json.detail.detail) return String(json.detail.detail)
    }
  } catch {
    /* use raw text */
  }
  return text || res.statusText
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(await parseHttpError(res))
  return res.json() as Promise<T>
}

export async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseHttpError(res))
  return res.json() as Promise<T>
}

export type TransferProgress = { loaded: number; total: number | null }

export type TransferOpts = {
  signal?: AbortSignal
  onProgress?: (p: TransferProgress) => void
  onStage?: (stage: 'transfer' | 'parse' | 'attachments' | 'server' | 'persist') => void
  /** Locker display name (POST or PUT metadata). */
  name?: string
  /** POST a new locker book even when one is already linked. */
  asNew?: boolean
}

export function lockerErrorFromBody(status: number, text: string): Error {
  if (status === 409) return new Error('etag_mismatch')
  try {
    const json = JSON.parse(text) as { detail?: string | { detail?: string; code?: string } }
    if (typeof json.detail === 'string') return new Error(json.detail)
    if (json.detail && typeof json.detail === 'object') {
      if (json.detail.code === 'etag_mismatch') return new Error('etag_mismatch')
      if (json.detail.detail) return new Error(String(json.detail.detail))
    }
  } catch {
    /* use raw text */
  }
  return new Error(text || `HTTP ${status}`)
}

export function xhrTransfer(
  method: string,
  path: string,
  opts: {
    body?: Uint8Array
    headers?: Record<string, string>
    responseType: XMLHttpRequestResponseType
    signal?: AbortSignal
    onProgress?: (p: TransferProgress) => void
    onStage?: TransferOpts['onStage']
    progressOnUpload?: boolean
  },
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    opts.signal?.addEventListener('abort', onAbort)
    const done = () => opts.signal?.removeEventListener('abort', onAbort)
    xhr.open(method, path)
    xhr.responseType = opts.responseType
    for (const [key, value] of Object.entries(opts.headers || {})) {
      xhr.setRequestHeader(key, value)
    }
    const report = (e: ProgressEvent) => {
      opts.onProgress?.({ loaded: e.loaded, total: e.lengthComputable ? e.total : null })
    }
    if (opts.progressOnUpload) {
      opts.onStage?.('transfer')
      xhr.upload.onprogress = report
      xhr.upload.onload = () => opts.onStage?.('server')
    } else {
      xhr.onprogress = report
    }
    xhr.onload = () => {
      done()
      resolve(xhr)
    }
    xhr.onerror = () => {
      done()
      reject(new Error('Failed to fetch'))
    }
    xhr.onabort = () => {
      done()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(opts.body?.byteLength ? new Blob([opts.body as BlobPart]) : null)
  })
}

export type { LockerBookInfo } from './persist/locker/types'
