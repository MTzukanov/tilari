import { describe, expect, it } from 'vitest'
import { fiscalPeriodJson, updateFiscalPeriodJson } from '../../../fiscalPeriod'
import { lockFiscalPeriod } from './fiscalPeriodLock'
import { confirmStatement, unconfirmStatement } from './statement'
import { SqliteDb } from '../../../sqlite'

async function book(): Promise<SqliteDb> {
  const db = await SqliteDb.empty()
  db.run(`CREATE TABLE Asetus (avain TEXT PRIMARY KEY, arvo TEXT)`)
  db.run(`CREATE TABLE Tilikausi (alkaa TEXT PRIMARY KEY, loppuu TEXT, json TEXT)`)
  db.run(`CREATE TABLE Liite (id INTEGER PRIMARY KEY, tosite INTEGER, nimi TEXT, roolinimi TEXT, tyyppi TEXT, sha TEXT, data BLOB)`)
  db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2026-01-01', '2026-12-31', '{}')`)
  updateFiscalPeriodJson(db, '2026-01-01', { tilinpaatos: '2026-08-28T12:00:00.000Z' })
  return db
}

describe('tilinpäätös confirmation', () => {
  it('confirms and unconfirms a period', async () => {
    const db = await book()
    lockFiscalPeriod(db, '2026-12-31')
    expect(confirmStatement(db, '2026-12-31', '2026-08-28')).toBe('2026-08-28')
    let json = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2026-01-01'")?.json,
    )
    expect(json.vahvistettu).toBe('2026-08-28')

    unconfirmStatement(db, '2026-12-31')
    json = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2026-01-01'")?.json,
    )
    expect(json.vahvistettu).toBeUndefined()
    db.close()
  })

  it('refuses confirmation before the period is locked', async () => {
    const db = await book()
    expect(() => confirmStatement(db, '2026-12-31')).toThrow(/Lukitse/)
    db.close()
  })
})
