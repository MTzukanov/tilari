import { getBcp47 } from '../i18n'

/** Display helpers. API money is integer cents; EUR only appears in the UI. */

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(): Intl.NumberFormat {
  const loc = getBcp47()
  let fmt = formatters.get(loc)
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR' })
    formatters.set(loc, fmt)
  }
  return fmt
}

export function sntToEur(snt: number): number {
  return snt / 100
}

export function formatCents(
  snt: number | null | undefined,
  opts?: { emptyZero?: boolean },
): string {
  if (snt == null) return ''
  if (opts?.emptyZero && snt === 0) return ''
  return formatter().format(sntToEur(snt))
}

const MAX_EUR_WHOLE_DIGITS = 12

/** Editable euro draft: optional minus, digits, one comma, at most two decimals. */
export function sanitizeEurInput(raw: string): string {
  const trimmed = raw.trim()
  const neg = trimmed.startsWith('-') || trimmed.startsWith('−')
  const body = raw.replace(/€/gi, '').replace(/[\s\u00a0\u202f]/g, '').replace(/−/g, '-')
  const unsigned = body.replace(/-/g, '')
  const sepAt = unsigned.search(/[.,]/)
  const hadSep = sepAt !== -1
  const wholeSrc = hadSep ? unsigned.slice(0, sepAt) : unsigned
  const fracSrc = hadSep ? unsigned.slice(sepAt + 1) : ''
  const whole = wholeSrc.replace(/\D/g, '').slice(0, MAX_EUR_WHOLE_DIGITS)
  const frac = fracSrc.replace(/\D/g, '').slice(0, 2)
  if (neg && !whole && !hadSep) return '-'
  return `${neg ? '-' : ''}${whole}${hadSep ? `,${frac}` : ''}`
}

/** Cents as an editor string (`12,50`). Empty when `emptyZero` and the value is 0. */
export function formatEurInput(cents: number, opts?: { emptyZero?: boolean }): string {
  if (opts?.emptyZero && !cents) return ''
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export function parseEurInput(raw: string): number {
  const text = sanitizeEurInput(raw)
  if (!text || text === '-' || text === ',' || text === '-,') return 0
  const neg = text.startsWith('-')
  const body = neg ? text.slice(1) : text
  const [whole, frac = ''] = body.split(',')
  const cents = Number(whole || 0) * 100 + Number((frac + '00').slice(0, 2))
  if (!Number.isFinite(cents)) return 0
  return neg ? -cents : cents
}
