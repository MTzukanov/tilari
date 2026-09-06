import type { TransferOpts } from '../../http'
import type { LockerObjectStore } from './objectStore'

/** AES-256-GCM envelope: magic + version + 12-byte IV + ciphertext (tag included). */
/** Default vault path when no storage prefix is configured. */
export const VAULT_PATH = 'vault.json'
export const MAGIC = new TextEncoder().encode('TILARIE1')
export const KDF_ITERATIONS = 210_000
const IV_LEN = 12
const CHECK_PLAIN = new TextEncoder().encode('tilari-vault')
const MIN_SECRET = 8

export type VaultFile = {
  v: 1
  kdf: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
  check: string
}

export function vaultPathForPrefix(keyPrefix: string): string {
  return `${keyPrefix}${VAULT_PATH}`
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('locker_crypto')
  return s
}

export function generateLockerSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function requireSecret(secret: string): string {
  const s = secret.trim()
  if (s.length < MIN_SECRET) throw new Error('locker_secret')
  return s
}

function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function cryptoSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

async function deriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: cryptoSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(plain: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ct = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv }, key, cryptoSource(plain)),
  )
  const out = new Uint8Array(MAGIC.length + iv.length + ct.length)
  out.set(MAGIC, 0)
  out.set(iv, MAGIC.length)
  out.set(ct, MAGIC.length + iv.length)
  return out
}

export async function decryptBytes(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  if (data.byteLength < MAGIC.length + IV_LEN + 16) throw new Error('locker_bad_secret')
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) throw new Error('locker_bad_secret')
  }
  const iv = cryptoSource(data.subarray(MAGIC.length, MAGIC.length + IV_LEN))
  const ct = cryptoSource(data.subarray(MAGIC.length + IV_LEN))
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct))
  } catch {
    throw new Error('locker_bad_secret')
  }
}

function parseVault(bytes: Uint8Array): VaultFile {
  let raw: Partial<VaultFile>
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<VaultFile>
  } catch {
    throw new Error('locker_bad_secret')
  }
  if (
    raw.v !== 1 ||
    raw.kdf !== 'PBKDF2' ||
    raw.hash !== 'SHA-256' ||
    typeof raw.iterations !== 'number' ||
    raw.iterations < 1 ||
    typeof raw.salt !== 'string' ||
    typeof raw.check !== 'string'
  ) {
    throw new Error('locker_bad_secret')
  }
  return raw as VaultFile
}

export function isVaultPath(path: string, vaultPath = VAULT_PATH): boolean {
  return path === vaultPath
}

export class EncryptedObjectStore implements LockerObjectStore {
  private inner: LockerObjectStore
  private key: CryptoKey
  private vaultPath: string

  constructor(inner: LockerObjectStore, key: CryptoKey, vaultPath = VAULT_PATH) {
    this.inner = inner
    this.key = key
    this.vaultPath = vaultPath
  }

  list(prefix: string, opts?: Parameters<LockerObjectStore['list']>[1]) {
    return this.inner.list(prefix, opts)
  }

  exists(path: string) {
    return this.inner.exists(path)
  }

  async download(path: string, opts?: TransferOpts): Promise<Uint8Array> {
    const bytes = await this.inner.download(path, opts)
    if (isVaultPath(path, this.vaultPath)) return bytes
    return decryptBytes(bytes, this.key)
  }

  async upload(
    path: string,
    data: Uint8Array,
    opts?: TransferOpts & { upsert?: boolean; contentType?: string },
  ): Promise<void> {
    if (isVaultPath(path, this.vaultPath)) {
      await this.inner.upload(path, data, opts)
      return
    }
    const wrapped = await encryptBytes(data, this.key)
    await this.inner.upload(path, wrapped, {
      ...opts,
      contentType: 'application/octet-stream',
    })
  }

  remove(paths: string[]) {
    return this.inner.remove(paths)
  }
}

async function loadOrCreateVault(
  store: LockerObjectStore,
  secret: string,
  vaultPath: string,
): Promise<{ vault: VaultFile; key: CryptoKey; created: boolean }> {
  try {
    const vault = parseVault(await store.download(vaultPath))
    const key = await deriveKey(secret, b64decode(vault.salt), vault.iterations)
    const check = await decryptBytes(b64decode(vault.check), key)
    if (new TextDecoder().decode(check) !== 'tilari-vault') throw new Error('locker_bad_secret')
    return { vault, key, created: false }
  } catch (err) {
    if (!(err instanceof Error) || err.message !== 'not_found') throw err
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(secret, salt, KDF_ITERATIONS)
  const vault: VaultFile = {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: KDF_ITERATIONS,
    salt: b64encode(salt),
    check: b64encode(await encryptBytes(CHECK_PLAIN, key)),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(vault))
  await store.upload(vaultPath, bytes, { upsert: true, contentType: 'application/json' })
  return { vault, key, created: true }
}

/** Unlock (or create) vault.json under keyPrefix and wrap the object store. */
export async function openEncryptedStore(
  store: LockerObjectStore,
  secret: string,
  keyPrefix = '',
): Promise<EncryptedObjectStore> {
  const vaultPath = vaultPathForPrefix(keyPrefix)
  const { key } = await loadOrCreateVault(store, requireSecret(secret), vaultPath)
  return new EncryptedObjectStore(store, key, vaultPath)
}
