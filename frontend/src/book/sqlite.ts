import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'

export type BindValue = string | number | null | Uint8Array | undefined

let SQL: SqlJsStatic | null = null

async function browserWasmBinary(): Promise<ArrayBuffer> {
  const { default: wasmUrl } = await import('./sqliteWasmUrl')
  // Single-file builds inline the wasm as a data URL (assetsInlineLimit).
  if (wasmUrl.startsWith('data:')) {
    const comma = wasmUrl.indexOf(',')
    const b64 = comma >= 0 ? wasmUrl.slice(comma + 1) : ''
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }
  const res = await fetch(wasmUrl)
  if (!res.ok) throw new Error(`Failed to load sql.js wasm (${res.status})`)
  return res.arrayBuffer()
}

export async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  try {
    const { readFileSync } = await import('node:fs')
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const wasmBinary = new Uint8Array(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')))
    SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer as ArrayBuffer })
    return SQL
  } catch {
    // Prefer wasmBinary over locateFile so data: URLs and file:// work
    // (instantiateStreaming rejects data URLs).
    SQL = await initSqlJs({ wasmBinary: await browserWasmBinary() })
    return SQL
  }
}

export class SqliteDb {
  db: Database

  constructor(db: Database) {
    this.db = db
  }

  static async fromBytes(bytes: Uint8Array): Promise<SqliteDb> {
    const sql = await loadSqlJs()
    return new SqliteDb(new sql.Database(bytes))
  }

  static async empty(): Promise<SqliteDb> {
    const sql = await loadSqlJs()
    return new SqliteDb(new sql.Database())
  }

  all<T extends object>(sql: string, params: BindValue[] = []): T[] {
    const stmt = this.db.prepare(sql)
    try {
      if (params.length) stmt.bind(params as SqlValue[])
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T extends object>(sql: string, params: BindValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  run(sql: string, params: BindValue[] = []): { lastInsertRowid: number; changes: number } {
    this.db.run(sql, params as SqlValue[])
    const row = this.get<{ id: number; c: number }>(
      'SELECT last_insert_rowid() AS id, changes() AS c',
    )
    return { lastInsertRowid: Number(row?.id ?? 0), changes: Number(row?.c ?? 0) }
  }

  export(): Uint8Array {
    return this.db.export()
  }

  freelistCount(): number {
    return Number(this.get<{ n: number }>('PRAGMA freelist_count')?.n ?? 0)
  }

  /** Rebuild the DB file so NULLed BLOBs no longer inflate export size. */
  vacuum(): void {
    this.db.run('VACUUM')
  }

  close(): void {
    this.db.close()
  }
}
