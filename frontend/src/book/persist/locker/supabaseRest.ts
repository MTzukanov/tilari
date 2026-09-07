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
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  if (status === 404 || lower.includes('not found') || lower.includes('not_found')) {
    return new Error('not_found')
  }
  if (status === 409 || lower.includes('duplicate') || lower.includes('already exists')) {
    return new Error('duplicate')
  }
  // Prefer stable codes for UI mapping when the body is empty or not a known token.
  if (!trimmed || trimmed.length > 80 || /[\s{<]/.test(trimmed)) {
    return new Error(fallback || `HTTP ${status}`)
  }
  return new Error(trimmed)
}

type SupabaseListRow = { name?: string; id?: string | null }

/**
 * Supabase Storage list is folder-scoped (one path segment): nested keys appear as
 * folders with `id: null`. Flatten recursively so the contract matches Node /
 * MemoryObjectStore (names relative to prefix, e.g. `{id}/meta.json`).
 */
async function listSupabaseFlat(
  projectUrl: string,
  bucket: string,
  headers: Record<string, string>,
  prefix: string,
): Promise<{ name: string }[]> {
  const listUrl = joinUrl(projectUrl, `storage/v1/object/list/${bucket}`)
  const folder = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
  const out: { name: string }[] = []

  async function listLevel(levelPrefix: string, limit: number, offset: number): Promise<SupabaseListRow[]> {
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: levelPrefix, limit, offset }),
    })
    if (!res.ok) throw storageError(res.status, await res.text(), 'locker_list_failed')
    const rows = (await res.json()) as SupabaseListRow[]
    return Array.isArray(rows) ? rows : []
  }

  async function walk(levelPrefix: string, relBase: string): Promise<void> {
    let offset = 0
    const pageSize = 1000
    for (;;) {
      const rows = await listLevel(levelPrefix, pageSize, offset)
      for (const row of rows) {
        const name = String(row.name || '').replace(/\/$/, '')
        if (!name) continue
        const childPrefix = levelPrefix ? `${levelPrefix}/${name}` : name
        const childRel = relBase ? `${relBase}/${name}` : name
        // Folders have null id; files have a non-null id.
        if (row.id == null) {
          await walk(childPrefix, childRel)
        } else {
          out.push({ name: childRel })
        }
      }
      if (rows.length < pageSize) break
      offset += rows.length
    }
  }

  await walk(folder, '')
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
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
    async list(prefix: string, opts?: ListOpts) {
      const limit = opts?.limit ?? 1000
      const offset = opts?.offset ?? 0
      const flat = await listSupabaseFlat(projectUrl, bucket, headers, prefix)
      return flat.slice(offset, offset + limit)
    },

    async exists(path: string, opts?: { signal?: AbortSignal }) {
      const res = await fetch(joinUrl(root, `${bucket}/${path}`), {
        method: 'HEAD',
        headers,
        signal: opts?.signal,
      })
      // Supabase Storage returns 400 (legacy) or 404 for missing objects on HEAD;
      // HEAD has no body, so we cannot rely on error text. Match supabase-js.
      if (res.status === 400 || res.status === 404) return false
      if (res.ok) return true
      throw storageError(res.status, await res.text(), 'exists_failed')
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
