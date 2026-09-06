import { xhrTransfer, type TransferOpts } from '../../http'
import type { ListOpts, LockerObjectStore } from './objectStore'

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function xhrBodyText(xhr: XMLHttpRequest): string {
  if (typeof xhr.response === 'string') return xhr.response
  if (xhr.response instanceof ArrayBuffer) return new TextDecoder().decode(xhr.response)
  return xhr.responseText || ''
}

function storageError(status: number, text: string, fallback: string): Error {
  const lower = text.toLowerCase()
  if (status === 404 || lower.includes('not found') || lower.includes('not_found')) {
    return new Error('not_found')
  }
  if (status === 409 || lower.includes('duplicate') || lower.includes('already exists')) {
    return new Error('duplicate')
  }
  return new Error(text || fallback || `HTTP ${status}`)
}

/**
 * Tilari Node thin object store (`/api/objects`).
 * @param origin null = same-origin relative `/api`
 */
export function createHttpObjectStore(origin: string | null): LockerObjectStore {
  const api = (path: string) => (origin ? joinUrl(origin, path) : path)

  return {
    async list(prefix: string, opts?: ListOpts) {
      const res = await fetch(api('/api/objects/list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix,
          limit: opts?.limit ?? 1000,
          offset: opts?.offset ?? 0,
        }),
      })
      if (!res.ok) throw storageError(res.status, await res.text(), 'locker_list_failed')
      const body = (await res.json()) as { objects?: { name?: string }[] }
      return (body.objects || [])
        .map((row) => ({ name: String(row.name || '') }))
        .filter((row) => row.name)
    },

    async exists(path: string) {
      const res = await fetch(api(`/api/objects/${path}`), { method: 'HEAD' })
      if (res.status === 404) return false
      if (res.ok) return true
      throw storageError(res.status, await res.text(), 'exists_failed')
    },

    async download(path: string, opts?: TransferOpts) {
      const xhr = await xhrTransfer('GET', api(`/api/objects/${path}`), {
        responseType: 'arraybuffer',
        signal: opts?.signal,
        onProgress: opts?.onProgress,
      })
      if (xhr.status === 404) throw new Error('not_found')
      if (xhr.status < 200 || xhr.status >= 300) {
        throw storageError(xhr.status, xhrBodyText(xhr), 'download_failed')
      }
      return new Uint8Array(xhr.response as ArrayBuffer)
    },

    async upload(
      path: string,
      data: Uint8Array,
      opts?: TransferOpts & { upsert?: boolean; contentType?: string },
    ) {
      const method = opts?.upsert ? 'PUT' : 'POST'
      const xhr = await xhrTransfer(method, api(`/api/objects/${path}`), {
        body: data,
        responseType: 'text',
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        onStage: opts?.onStage,
        progressOnUpload: true,
        headers: {
          'Content-Type': opts?.contentType || 'application/octet-stream',
          'x-upsert': opts?.upsert ? 'true' : 'false',
        },
      })
      if (xhr.status < 200 || xhr.status >= 300) {
        throw storageError(xhr.status, xhrBodyText(xhr), 'upload_failed')
      }
    },

    async remove(paths: string[]) {
      if (!paths.length) return
      const res = await fetch(api('/api/objects'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      })
      if (!res.ok && res.status !== 404) {
        throw storageError(res.status, await res.text(), 'delete_failed')
      }
    },
  }
}
