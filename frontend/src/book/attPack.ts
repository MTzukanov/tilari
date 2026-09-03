/** TILARIAT v1 attachment pack — shared with server/src/locker */

import { sha256hex } from './sha256'

export { sha256hex }

const MAGIC = new TextEncoder().encode('TILARIAT')
const VERSION = 1
const SHA_RE = /^[0-9a-f]{64}$/

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function readU64(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false)
  const lo = view.getUint32(offset + 4, false)
  if (hi > 0xffff) throw new Error('invalid_attachment_pack')
  return hi * 0x1_0000_0000 + lo
}

function sortedEntries(
  blobs: Map<string, Uint8Array> | Record<string, Uint8Array>,
): [string, Uint8Array][] {
  const entries =
    blobs instanceof Map
      ? [...blobs.entries()]
      : Object.entries(blobs).map(([k, v]) => [k, v] as [string, Uint8Array])
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return entries
}

export function encodeAttachmentPack(
  blobs: Map<string, Uint8Array> | Record<string, Uint8Array>,
): Uint8Array {
  const entries = sortedEntries(blobs)
  let size = 16
  for (const [, data] of entries) size += 64 + 8 + data.byteLength
  const out = new Uint8Array(size)
  out.set(MAGIC, 0)
  const view = new DataView(out.buffer)
  view.setUint32(8, VERSION, false)
  view.setUint32(12, entries.length, false)
  let offset = 16
  const enc = new TextEncoder()
  for (const [sha, data] of entries) {
    if (!SHA_RE.test(sha)) throw new Error(`invalid_sha:${sha}`)
    out.set(enc.encode(sha), offset)
    offset += 64
    view.setUint32(offset, Math.floor(data.byteLength / 0x1_0000_0000), false)
    view.setUint32(offset + 4, data.byteLength >>> 0, false)
    offset += 8
    out.set(data, offset)
    offset += data.byteLength
  }
  return out
}

export function decodeAttachmentPack(pack: Uint8Array): Map<string, Uint8Array> {
  if (pack.byteLength < 16) throw new Error('invalid_attachment_pack')
  for (let i = 0; i < 8; i++) {
    if (pack[i] !== MAGIC[i]) throw new Error('invalid_attachment_pack')
  }
  const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength)
  const version = readU32(view, 8)
  const count = readU32(view, 12)
  if (version !== VERSION) throw new Error('unsupported_attachment_pack')
  const out = new Map<string, Uint8Array>()
  let offset = 16
  const dec = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (offset + 72 > pack.byteLength) throw new Error('invalid_attachment_pack')
    const sha = dec.decode(pack.subarray(offset, offset + 64))
    offset += 64
    const length = readU64(view, offset)
    offset += 8
    if (offset + length > pack.byteLength) throw new Error('invalid_attachment_pack')
    if (!SHA_RE.test(sha)) throw new Error(`invalid_sha:${sha}`)
    out.set(sha, pack.slice(offset, offset + length))
    offset += length
  }
  if (offset !== pack.byteLength) throw new Error('invalid_attachment_pack')
  return out
}

export async function attachmentPackSha(pack: Uint8Array): Promise<string> {
  return sha256hex(pack)
}

export function emptyAttachmentPack(): Uint8Array {
  return encodeAttachmentPack(new Map())
}
