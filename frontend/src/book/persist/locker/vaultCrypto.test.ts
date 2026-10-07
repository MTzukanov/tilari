import { describe, expect, it } from 'vitest'
import { decryptBytes, encryptBytes, generateLockerSecret, requireSecret } from './vaultCrypto'

async function aesKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

describe('vaultCrypto', () => {
  it('round-trips AES-GCM envelopes and rejects a wrong key', async () => {
    const key = await aesKey()
    const plain = new TextEncoder().encode('hello-ledger')
    const wrapped = await encryptBytes(plain, key)
    expect(new TextDecoder().decode(await decryptBytes(wrapped, key))).toBe('hello-ledger')
    const other = await aesKey()
    await expect(decryptBytes(wrapped, other)).rejects.toThrow('locker_bad_secret')
    await expect(decryptBytes(plain, key)).rejects.toThrow('locker_bad_secret')
  })

  it('v2 binds the ciphertext to its object path; v1 objects still decrypt', async () => {
    const key = await aesKey()
    const plain = new TextEncoder().encode('ledger-bytes')
    const v2 = await encryptBytes(plain, key, 'tilari/abc/book.kitsas')
    expect(new TextDecoder().decode(v2.subarray(0, 8))).toBe('TILARIE2')
    expect(new TextDecoder().decode(await decryptBytes(v2, key, 'tilari/abc/book.kitsas'))).toBe('ledger-bytes')
    // A host that swaps objects between paths: decryption fails.
    await expect(decryptBytes(v2, key, 'tilari/xyz/book.kitsas')).rejects.toThrow('locker_bad_secret')
    await expect(decryptBytes(v2, key)).rejects.toThrow('locker_bad_secret')
    const v1 = await encryptBytes(plain, key)
    expect(new TextDecoder().decode(await decryptBytes(v1, key, 'any/path'))).toBe('ledger-bytes')
  })

  it('generates a 32-byte hex secret and rejects short secrets', () => {
    expect(generateLockerSecret()).toMatch(/^[0-9a-f]{64}$/)
    expect(() => requireSecret('short')).toThrow('locker_secret')
    expect(requireSecret('  long-enough  ')).toBe('long-enough')
  })
})
