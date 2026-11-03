const YTUNNUS_RE = /^(\d{7})-(\d)$/
const YTUNNUS_WEIGHTS = [7, 9, 10, 5, 8, 4, 2]

/** Finnish Y-tunnus: 7 digits, hyphen, check digit (mod 11). */
export function isValidFinnishBusinessId(raw: string): boolean {
  const m = raw.trim().replace(/\s+/g, '').match(YTUNNUS_RE)
  if (!m) return false
  const digits = m[1]
  const check = Number(m[2])
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * YTUNNUS_WEIGHTS[i]
  const rem = sum % 11
  if (rem === 1) return false
  const expected = rem === 0 ? 0 : 11 - rem
  return check === expected
}
