import type { SqliteDb } from './sqlite'
import type { Account } from './types'

export const REQUIRED_TABLES = ['Asetus', 'Tili', 'Tilikausi', 'Tosite', 'Vienti'] as const

export function validateBook(db: SqliteDb): void {
  const names = new Set(
    db.all<{ name: string }>('SELECT name FROM sqlite_master WHERE type = ?', ['table']).map(
      (r) => r.name,
    ),
  )
  const missing = REQUIRED_TABLES.filter((t) => !names.has(t))
  if (missing.length) {
    throw new Error(`Not a Kitsas database (missing tables: ${missing.join(', ')})`)
  }
  const kp = db.get<{ arvo: string }>("SELECT arvo FROM Asetus WHERE avain = 'KpVersio'")
  if (!kp) throw new Error('Not a Kitsas database (no KpVersio setting)')
}

export function getSettings(db: SqliteDb, keys?: string[]): Record<string, string> {
  if (keys?.length) {
    const placeholders = keys.map(() => '?').join(',')
    const rows = db.all<{ avain: string; arvo: string | null }>(
      `SELECT avain, arvo FROM Asetus WHERE avain IN (${placeholders})`,
      keys,
    )
    return Object.fromEntries(rows.map((r) => [r.avain, r.arvo || '']))
  }
  const rows = db.all<{ avain: string; arvo: string | null }>('SELECT avain, arvo FROM Asetus')
  return Object.fromEntries(rows.map((r) => [r.avain, r.arvo || '']))
}

export function getPeriods(db: SqliteDb): { starts: string; ends: string; json: string }[] {
  return db
    .all<{ alkaa: string; loppuu: string; json: string | null }>(
      'SELECT alkaa, loppuu, json FROM Tilikausi ORDER BY alkaa',
    )
    .map((row) => ({
      starts: row.alkaa,
      ends: row.loppuu,
      json: row.json || '{}',
    }))
}

export function periodForDate(
  db: SqliteDb,
  date: string,
): { starts: string; ends: string } | undefined {
  return db.get<{ starts: string; ends: string }>(
    'SELECT alkaa AS starts, loppuu AS ends FROM Tilikausi WHERE alkaa <= ? AND loppuu >= ? ORDER BY alkaa DESC LIMIT 1',
    [date, date],
  )
}

export type AccountRow = Account

export function getAccounts(db: SqliteDb): AccountRow[] {
  return db
    .all<{ numero: number; tyyppi: string; iban: string | null; name: string }>(
      `SELECT
         numero,
         tyyppi,
         iban,
         COALESCE(json_extract(json, '$.nimi.fi'), json_extract(json, '$.nimi.en'), '') AS name
       FROM Tili
       ORDER BY numero`,
    )
    .map((row) => ({
      number: Number(row.numero),
      type: row.tyyppi || '',
      iban: row.iban,
      name: row.name || '',
    }))
}

export function accountByType(db: SqliteDb, type: string): number | undefined {
  const row = db.get<{ numero: number }>('SELECT numero FROM Tili WHERE tyyppi = ? LIMIT 1', [type])
  return row ? Number(row.numero) : undefined
}
