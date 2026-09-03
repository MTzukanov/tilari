import type { TransferOpts } from '../../http'

export type { TransferOpts }

export type LockerKind = 'http' | 'supabase'

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
}

export type SupabaseLockerSettings = {
  url: string
  anonKey: string
  bucket?: string
  /** Locker-wide AES key material (passphrase or generated hex). Session only. */
  secret: string
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
  ): Promise<{ bytes: Uint8Array; etag: string; attachmentsEtag: string; name: string }>
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
    blobs: Record<string, Uint8Array>,
    etag: string,
    opts?: TransferOpts,
  ): Promise<{ attachments_sha256: string }>
  remove?(id: string): Promise<void>
}
