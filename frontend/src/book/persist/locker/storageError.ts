/** HTTP failure mapping shared by the Supabase and Tilari Node object stores. */

export function xhrBodyText(xhr: XMLHttpRequest): string {
  if (typeof xhr.response === 'string') return xhr.response
  if (xhr.response instanceof ArrayBuffer) return new TextDecoder().decode(xhr.response)
  return xhr.responseText || ''
}

type ErrorBody = { statusCode?: unknown; error?: unknown; message?: unknown; detail?: unknown }

function parseErrorBody(text: string): ErrorBody | null {
  try {
    const body = JSON.parse(text) as unknown
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as ErrorBody) : null
  } catch {
    return null
  }
}

/**
 * Map a failed response to a stable code for `mapFileError`. Supabase Storage answers most
 * failures with HTTP 400 and the real status in the body
 * (`{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}`);
 * Tilari Node answers `{detail}` with the real status. The server's own message rides along
 * as `cause` so the UI can show why.
 */
export function storageError(status: number, text: string, fallback: string): Error {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  const body = parseErrorBody(trimmed)
  const inner = Number(body?.statusCode)
  const code = Number.isInteger(inner) && inner > 0 ? inner : status
  const said = [body?.message, body?.error, body?.detail].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
  const cause = said ? { cause: said.trim().slice(0, 200) } : undefined
  if (code === 404 || lower.includes('not found') || lower.includes('not_found')) {
    return new Error('not_found')
  }
  if (code === 409 || lower.includes('duplicate') || lower.includes('already exists')) {
    return new Error('duplicate')
  }
  if (code === 401 || code === 403 || lower.includes('row-level security')) {
    return new Error('locker_forbidden', cause)
  }
  // Prefer stable codes for UI mapping when the body is empty or not a known token.
  if (!trimmed || trimmed.length > 80 || /[\s{<]/.test(trimmed)) {
    return new Error(fallback || `HTTP ${status}`, cause)
  }
  return new Error(trimmed)
}
