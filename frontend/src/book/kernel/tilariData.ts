/**
 * Tilari-owned key/value table inside the `.kitsas` file (ADR-023).
 *
 * Desktop Kitsas only checks `Asetus.KpVersio` on open and copies the file for backups, so an
 * extra table survives untouched. Values are JSON documents; Tilari never stores data in Kitsas
 * JSON columns or `Asetus`. The table is created on the first write; a missing table reads empty.
 */
import type { SqliteDb } from '../sqlite'

export const TILARI_DATA_TABLE = 'TilariData'

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS ${TILARI_DATA_TABLE} (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated TEXT
)`

export function hasTilariData(db: SqliteDb): boolean {
  return Boolean(
    db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
      TILARI_DATA_TABLE,
    ]),
  )
}

export function readTilariData(db: SqliteDb, key: string): string | null {
  if (!hasTilariData(db)) return null
  const row = db.get<{ value: string }>(`SELECT value FROM ${TILARI_DATA_TABLE} WHERE key = ?`, [key])
  return row ? String(row.value) : null
}

/** Rows whose key starts with `prefix`, ordered by key. */
export function readTilariDataPrefix(db: SqliteDb, prefix: string): { key: string; value: string }[] {
  if (!hasTilariData(db)) return []
  const pattern = prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + '%'
  return db
    .all<{ key: string; value: string }>(
      `SELECT key, value FROM ${TILARI_DATA_TABLE} WHERE key LIKE ? ESCAPE '\\' ORDER BY key`,
      [pattern],
    )
    .map((row) => ({ key: String(row.key), value: String(row.value) }))
}

/**
 * Upsert (`value`) or delete (`null`). Writes nothing when the stored value is already equal,
 * so an unchanged save leaves the book clean. Returns true when the table changed.
 */
export function writeTilariData(
  db: SqliteDb,
  key: string,
  value: string | null,
  updatedAt: string = new Date().toISOString(),
): boolean {
  const current = readTilariData(db, key)
  if (value === null) {
    if (current === null) return false
    db.run(`DELETE FROM ${TILARI_DATA_TABLE} WHERE key = ?`, [key])
    return true
  }
  if (current === value) return false
  db.run(CREATE_SQL)
  db.run(
    `INSERT INTO ${TILARI_DATA_TABLE} (key, value, updated) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated`,
    [key, value, updatedAt],
  )
  return true
}
