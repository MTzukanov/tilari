import { xhrTransfer, type TransferOpts } from '../../http'
import type { LockerObjectStore } from './objectStore'

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

/** Supabase Storage REST (no @supabase/supabase-js — smaller, XHR progress). */
export function createSupabaseObjectStore(
  projectUrl: string,
  anonKey: string,
  bucket: string,
): LockerObjectStore {
  const root = joinUrl(projectUrl, `storage/v1/object`)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  }

  return {
    async list(prefix: string) {
      const res = await fetch(joinUrl(projectUrl, `storage/v1/object/list/${bucket}`), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
      })
      if (!res.ok) throw storageError(res.status, await res.text(), 'locker_list_failed')
      const rows = (await res.json()) as { name?: string }[]
      return rows
        .map((row) => ({ name: String(row.name || '') }))
        .filter((row) => row.name)
    },

    async download(path: string, opts?: TransferOpts) {
      const xhr = await xhrTransfer('GET', joinUrl(root, `${bucket}/${path}`), {
        responseType: 'arraybuffer',
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        headers,
      })
      if (xhr.status === 404) throw new Error('not_found')
      if (xhr.status < 200 || xhr.status >= 300) {
        throw storageError(xhr.status, xhrBodyText(xhr), 'download_failed')
      }
      return new Uint8Array(xhr.response as ArrayBuffer)
    },

    async upload(path: string, data: Uint8Array, opts?: TransferOpts & { upsert?: boolean; contentType?: string }) {
      const method = opts?.upsert ? 'PUT' : 'POST'
      const xhr = await xhrTransfer(method, joinUrl(root, `${bucket}/${path}`), {
        body: data,
        responseType: 'text',
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        onStage: opts?.onStage,
        progressOnUpload: true,
        headers: {
          ...headers,
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
      const res = await fetch(joinUrl(projectUrl, `storage/v1/object/${bucket}`), {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      })
      if (!res.ok && res.status !== 404) {
        throw storageError(res.status, await res.text(), 'delete_failed')
      }
    },
  }
}
