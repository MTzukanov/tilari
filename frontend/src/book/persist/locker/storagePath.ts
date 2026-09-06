/** Parse locker "bucket / path" field into Supabase bucket + object key prefix. */

export const DEFAULT_STORAGE_PATH = 'tilari'

export type ParsedStoragePath = {
  /** Supabase Storage bucket (first path segment). */
  bucket: string
  /** Object keys under the bucket ('' or 'book1/' …). */
  keyPrefix: string
  /** Full normalized path (e.g. tilari or tilari/book1) for Node disk roots. */
  storagePath: string
}

/** Normalize `tilari` / `tilari/book1` → bucket + keyPrefix. */
export function parseStoragePath(raw: unknown): ParsedStoragePath {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
  const path = cleaned || DEFAULT_STORAGE_PATH
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) {
    return { bucket: DEFAULT_STORAGE_PATH, keyPrefix: '', storagePath: DEFAULT_STORAGE_PATH }
  }
  const bucket = parts[0]!
  const keyPrefix = parts.length > 1 ? `${parts.slice(1).join('/')}/` : ''
  return { bucket, keyPrefix, storagePath: parts.join('/') }
}

/** Prefix ObjectStoreLockerBackend uses for keys on a given transport. */
export function objectKeyPrefix(
  parsed: ParsedStoragePath,
  kind: 'supabase' | 'http',
): string {
  if (kind === 'supabase') return parsed.keyPrefix
  return `${parsed.storagePath}/`
}
