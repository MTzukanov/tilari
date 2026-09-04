import { PostingError } from './errors'
import { parseJson } from './json'
import { parsePaymentMethods, type PaymentMethod } from './paymentMethods'
import type { SqliteDb } from './sqlite'

export const COMPANY_KEYS = [
  'Nimi',
  'Ytunnus',
  'Email',
  'Katuosoite',
  'Postinumero',
  'Kaupunki',
  'Puhelin',
  'AlvVelvollinen',
  'AlvKausi',
  'AlvAlkaa',
  'MaksuAlvAlkaa',
  'MaksuAlvLoppuu',
  'TilitPaatetty',
  'AlvMaksettava',
  'AlvPalautettava',
  'AlvVelkatili',
  'Harjoitus',
] as const

/** Kitsas AsetusModel::onko("AlvVelvollinen") — empty / 0 / EI → not liable. */
export function isVatLiableSetting(value: string | null | undefined): boolean {
  const v = (value || '').trim().toUpperCase()
  return Boolean(v) && v !== '0' && v !== 'EI'
}

export function getCompany(db: SqliteDb): Record<string, string> {
  const placeholders = COMPANY_KEYS.map(() => '?').join(',')
  const rows = db.all<{ avain: string; arvo: string | null }>(
    `SELECT avain, arvo FROM Asetus WHERE avain IN (${placeholders})`,
    [...COMPANY_KEYS],
  )
  const data: Record<string, string> = Object.fromEntries(COMPANY_KEYS.map((k) => [k, '']))
  for (const row of rows) data[row.avain] = row.arvo || ''
  return data
}

export function putCompany(db: SqliteDb, patch: Record<string, unknown>): Record<string, string> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(COMPANY_KEYS as readonly string[]).includes(key)) {
      throw new PostingError(`Tuntematon asetus ${key}`)
    }
    db.run(
      `INSERT INTO Asetus (avain, arvo) VALUES (?, ?)
       ON CONFLICT(avain) DO UPDATE SET arvo = excluded.arvo`,
      [key, value == null ? '' : String(value)],
    )
  }
  return getCompany(db)
}

export function getPaymentMethods(db: SqliteDb): {
  expense: PaymentMethod[]
  income: PaymentMethod[]
} {
  const rows = db.all<{ avain: string; arvo: string | null }>(
    "SELECT avain, arvo FROM Asetus WHERE avain IN ('maksutavat-', 'maksutavat+')",
  )
  const map = Object.fromEntries(rows.map((r) => [r.avain, r.arvo || '']))
  return {
    expense: parsePaymentMethods(map['maksutavat-'] || ''),
    income: parsePaymentMethods(map['maksutavat+'] || ''),
  }
}

export function saveFiscalPeriod(
  db: SqliteDb,
  starts: string,
  ends: string,
  replaceStarts?: string | null,
): void {
  // Carry Tilikausi.json: henkilosto (headcount), tilinpaatos (drafted), vahvistettu (confirmed), verolaskelma (tax).
  // across a renamed start date instead of resetting it to '{}'.
  let carried = '{}'
  if (replaceStarts) {
    const prev = db.get<{ json: string | null }>('SELECT json FROM Tilikausi WHERE alkaa = ?', [
      replaceStarts,
    ])
    if (prev?.json) carried = prev.json
    db.run('DELETE FROM Tilikausi WHERE alkaa = ?', [replaceStarts])
  }
  db.run(
    `INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)
     ON CONFLICT(alkaa) DO UPDATE SET loppuu = excluded.loppuu`,
    [starts, ends, carried],
  )
}

export function saveAccount(
  db: SqliteDb,
  number: number,
  opts: { name?: string | null; type?: string | null; iban?: string | null },
): void {
  const row = db.get<{ json: string | null; tyyppi: string; iban: string | null }>(
    'SELECT json, tyyppi, iban FROM Tili WHERE numero = ?',
    [number],
  )
  if (!row) {
    if (!opts.type || !opts.name) throw new PostingError('Uudella tililla tarvitaan tyyppi ja nimi')
    db.run('INSERT INTO Tili (numero, tyyppi, iban, json) VALUES (?, ?, ?, ?)', [
      number,
      opts.type,
      opts.iban ?? null,
      JSON.stringify({ nimi: { fi: opts.name } }),
    ])
    return
  }
  const data = parseJson(row.json)
  if (opts.name != null) {
    const names =
      data.nimi && typeof data.nimi === 'object' && !Array.isArray(data.nimi)
        ? { ...(data.nimi as Record<string, unknown>) }
        : {}
    names.fi = opts.name
    data.nimi = names
  }
  db.run('UPDATE Tili SET tyyppi = ?, iban = ?, json = ? WHERE numero = ?', [
    opts.type != null ? opts.type : row.tyyppi,
    opts.iban !== undefined ? opts.iban : row.iban,
    JSON.stringify(data),
    number,
  ])
}

export function saveAllocation(
  db: SqliteDb,
  opts: {
    allocationId?: number | null
    name: string
    type: number
    parentId?: number | null
    starts?: string | null
    ends?: string | null
  },
): number {
  const data: Record<string, unknown> = { nimi: { fi: opts.name } }
  if (opts.starts) data.alkaa = opts.starts
  if (opts.ends) data.paattyy = opts.ends
  const raw = JSON.stringify(data)
  if (opts.allocationId == null) {
    return db.run('INSERT INTO Kohdennus (tyyppi, kuuluu, json) VALUES (?, ?, ?)', [
      opts.type,
      opts.parentId ?? null,
      raw,
    ]).lastInsertRowid
  }
  if (opts.allocationId === 0) throw new PostingError('Yleistä kohdennusta ei voi muuttaa')
  db.run('UPDATE Kohdennus SET tyyppi = ?, kuuluu = ?, json = ? WHERE id = ?', [
    opts.type,
    opts.parentId ?? null,
    raw,
    opts.allocationId,
  ])
  return opts.allocationId
}
