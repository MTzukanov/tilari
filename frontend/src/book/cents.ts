/** Integer-cent helpers for ledger math. Never use IEEE floats for posting. */

export function asCents(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'bigint') return Number(value)
  return Math.trunc(Number(value))
}

export function centsOrNull(value: unknown): number | null {
  const n = asCents(value)
  return n ? n : null
}

export function isAsset(account: number, type?: string | null): boolean {
  if (type) return type.startsWith('A')
  return String(account).startsWith('1')
}

/** Finnish legal/report HTML: nbsp thousands, comma decimals, minus sign. */
export function formatFiCents(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return `${neg ? '−' : ''}${whole},${String(abs % 100).padStart(2, '0')}`
}

export function signedCents(
  account: number,
  debitCents: unknown,
  creditCents: unknown,
  type?: string | null,
): number {
  const d = asCents(debitCents)
  const k = asCents(creditCents)
  if (isAsset(account, type)) return d - k
  return k - d
}
