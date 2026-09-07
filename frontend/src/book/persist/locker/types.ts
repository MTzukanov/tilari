import type { TransferOpts } from '../../http'

export type { TransferOpts }

export type LockerKind = 'http' | 'supabase'

export type HttpLockerSettings = {
  /** Origin of a user-hosted Tilari Node (no trailing slash, no `/api` suffix). */
  url: string
  /** Bucket/path namespace, e.g. tilari or tilari/book1. */
  path?: string
  /** Client-side AES when true. */
  encrypt?: boolean
  /** Required when encrypt is true. */
  secret?: string
}

export type LockerBookInfo = {
  id: string
  name: string
  size: number
  sha256: string
  attachments_sha256?: string
  attachments_size?: number
  split_attachments?: boolean
  updated_at: string
}

export type LockerPutResult = {
  id: string
  sha256: string
  attachments_sha256?: string
  updated_at?: string
}

export type SupabaseLockerSettings = {
  url: string
  anonKey: string
  /** Bucket or bucket/path (e.g. tilari/book1). */
  bucket?: string
  /** Alias for bucket when saving unified path field. */
  path?: string
  encrypt?: boolean
  /** Required when encrypt is true (default true for Supabase). */
  secret?: string
}

export interface LockerBackend {
  readonly id: LockerKind
  readonly supportsHttpEngine: boolean
  connect(settings?: unknown): Promise<void>
  disconnect(): void
  isReady(): boolean
  list(): Promise<LockerBookInfo[]>
  get(
    id: string,
    opts?: TransferOpts,
  ): Promise<{
    bytes: Uint8Array
    etag: string
    attachmentsEtag: string
    name: string
    updated_at?: string
  }>
  put(
    id: string | null,
    bytes: Uint8Array,
    name: string,
    etag?: string,
    opts?: TransferOpts,
  ): Promise<LockerPutResult>
  getAttachments?(id: string, opts?: TransferOpts): Promise<{ pack: Uint8Array; etag: string }>
  getAttachmentBlob(id: string, sha: string, opts?: TransferOpts): Promise<Uint8Array>
  putAttachments?(
    id: string,
    pack: Uint8Array,
    etag: string,
    opts?: TransferOpts,
  ): Promise<{ id: string; attachments_sha256: string }>
  putAttachmentBlobs?(
    id: string,
    attachmentShas: string[],
    blobs: Record<string, Uint8Array>,
    etag: string,
    opts?: TransferOpts,
  ): Promise<{ attachments_sha256: string; updated_at?: string }>
  remove?(id: string): Promise<void>
  /** Delete shared blobs not listed in any book's meta.attachment_shas. */
  gcUnusedBlobs?(): Promise<number>
}
