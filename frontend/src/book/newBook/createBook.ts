/**
 * Build a new schema-24 `.kitsas` (Kitsas `SqliteAlustaja` in TypeScript).
 * Empty SQLite + vendored `luo.sql` + yritys chart, then user overlays.
 */
import { validateBook } from '../access'
import { isIsoDate } from '../clock'
import { BookError } from '../errors'
import { DEFAULT_TEMPLATE_FI } from '../modules/periodEnd/domain/statementTemplate'
import { SqliteDb } from '../sqlite'
import luoSql from './vendor/luo.sql?raw'
import yritysChart from './vendor/yritys.json'

export type VatPeriodMonths = 1 | 3 | 12

export type NewBookInput = {
  name: string
  businessId?: string
  yearStart: string
  yearEnd: string
  vatLiable: boolean
  vatPeriod: VatPeriodMonths
  practice: boolean
}

type ChartAccount = {
  numero: number
  tyyppi: string
  iban?: string | null
  [key: string]: unknown
}

type ChartFile = {
  asetukset: Record<string, unknown>
  tilit: ChartAccount[]
}

const KP_VERSIO = '24'
const TEMPLATE_KEY = 'tppohja/fi'
const YTUNNUS_RE = /^(\d{7})-(\d)$/
const YTUNNUS_WEIGHTS = [7, 9, 10, 5, 8, 4, 2]

/** Valid checksum; used when practice mode has no Y-tunnus. Not a real company. */
export const PRACTICE_BUSINESS_ID = '1234567-1'

function chartFile(): ChartFile {
  const raw = yritysChart as ChartFile
  if (!raw?.asetukset || !Array.isArray(raw.tilit)) {
    throw new BookError('chart_invalid', 500)
  }
  return raw
}

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

export function kitsasFileName(name: string): string {
  const trimmed = name.trim()
  const safe =
    trimmed
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/[\n\r\t]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim() || 'kirja'
  return /\.kitsas$/i.test(safe) ? safe : `${safe}.kitsas`
}

function addUtcDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function addUtcMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return dt.toISOString().slice(0, 10)
}

export function suggestFiscalYear(today: string): { starts: string; ends: string } {
  const year = Number(today.slice(0, 4)) || new Date().getFullYear()
  return { starts: `${year}-01-01`, ends: `${year}-12-31` }
}

/** Kitsas: start < end and end ≤ start + 18 months. */
export function isValidFiscalYear(starts: string, ends: string): boolean {
  if (!isIsoDate(starts) || !isIsoDate(ends)) return false
  if (starts >= ends) return false
  return ends <= addUtcMonths(starts, 18)
}

function asetusValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function putAsetus(db: SqliteDb, key: string, value: string): void {
  db.run(
    `INSERT INTO Asetus (avain, arvo) VALUES (?, ?)
     ON CONFLICT(avain) DO UPDATE SET arvo = excluded.arvo`,
    [key, value],
  )
}

function writeChartSettings(db: SqliteDb, asetukset: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(asetukset)) {
    putAsetus(db, key, asetusValue(value))
  }
}

function writeAccounts(db: SqliteDb, tilit: ChartAccount[]): void {
  for (const row of tilit) {
    const numero = Number(row.numero)
    const tyyppi = String(row.tyyppi ?? '')
    const rest: Record<string, unknown> = { ...row }
    delete rest.numero
    delete rest.tyyppi
    if (tyyppi.startsWith('H')) {
      const taso = Number(tyyppi.slice(1))
      db.run(
        `INSERT INTO Otsikko (numero, taso, json) VALUES (?, ?, ?)
         ON CONFLICT(numero, taso) DO UPDATE SET json = excluded.json`,
        [numero, taso, JSON.stringify(rest)],
      )
      continue
    }
    const iban = rest.iban == null || rest.iban === '' ? null : String(rest.iban)
    delete rest.iban
    db.run(
      `INSERT INTO Tili (numero, tyyppi, iban, json) VALUES (?, ?, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET tyyppi = excluded.tyyppi, iban = excluded.iban, json = excluded.json`,
      [numero, tyyppi, iban, JSON.stringify(rest)],
    )
  }
}

function overlayUser(db: SqliteDb, input: NewBookInput): void {
  const name = input.name.trim()
  putAsetus(db, 'Nimi', name)
  const businessId = resolveBusinessId(input)
  if (businessId) putAsetus(db, 'Ytunnus', businessId)
  putAsetus(db, 'Harjoitus', input.practice ? 'ON' : 'EI')
  putAsetus(db, 'AlvVelvollinen', input.vatLiable ? 'ON' : 'EI')
  putAsetus(db, 'AlvKausi', String(input.vatPeriod))
  putAsetus(db, 'AlvAlkaa', input.yearStart)
  putAsetus(db, 'TilitPaatetty', addUtcDays(input.yearStart, -1))
  putAsetus(db, 'KpVersio', KP_VERSIO)
  const uid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
  putAsetus(db, 'UID', `{${uid}}`)
  putAsetus(db, 'Luotu', new Date().toISOString())
  putAsetus(db, 'LuotuVersiolla', 'tilari')
  putAsetus(db, 'muoto', 'oy')
  putAsetus(db, 'LaskuSeuraavaId', '100')
  putAsetus(db, TEMPLATE_KEY, DEFAULT_TEMPLATE_FI)
}

function resolveBusinessId(input: NewBookInput): string {
  const businessId = (input.businessId ?? '').trim().replace(/\s+/g, '')
  if (businessId) return businessId
  return input.practice ? PRACTICE_BUSINESS_ID : ''
}

function validateInput(input: NewBookInput): void {
  if (!input.name.trim()) throw new BookError('name_required')
  const businessId = (input.businessId ?? '').trim()
  if (businessId && !input.practice && !isValidFinnishBusinessId(businessId)) {
    throw new BookError('ytunnus_invalid')
  }
  if (!isValidFiscalYear(input.yearStart, input.yearEnd)) {
    throw new BookError('fiscal_year_invalid')
  }
  if (input.vatPeriod !== 1 && input.vatPeriod !== 3 && input.vatPeriod !== 12) {
    throw new BookError('vat_period_invalid')
  }
}

export async function buildNewBook(input: NewBookInput): Promise<Uint8Array> {
  validateInput(input)
  const chart = chartFile()
  const db = await SqliteDb.empty()
  try {
    db.db.exec(luoSql)
    writeChartSettings(db, chart.asetukset)
    writeAccounts(db, chart.tilit)
    overlayUser(db, input)
    db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [
      input.yearStart,
      input.yearEnd,
      '{}',
    ])
    validateBook(db)
    return db.export()
  } finally {
    db.close()
  }
}
