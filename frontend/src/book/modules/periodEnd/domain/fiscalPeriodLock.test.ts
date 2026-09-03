import { describe, expect, it } from 'vitest'
import { lockDate } from '../../../posting'
import {
  isFiscalPeriodLocked,
  lockFiscalPeriod,
  subtractDays,
  unlockFiscalPeriod,
} from './fiscalPeriodLock'
import { SqliteDb } from '../../../sqlite'

async function bookWithPeriods(
  periods: { starts: string; ends: string }[],
): Promise<SqliteDb> {
  const db = await SqliteDb.empty()
  db.run(`CREATE TABLE Asetus (avain TEXT PRIMARY KEY, arvo TEXT)`)
  db.run(`CREATE TABLE Tilikausi (alkaa TEXT PRIMARY KEY, loppuu TEXT, json TEXT)`)
  for (const p of periods) {
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, '{}')`, [p.starts, p.ends])
  }
  return db
}

describe('fiscalPeriodLock', () => {
  it('subtractDays handles year boundary', () => {
    expect(subtractDays('2024-01-01', 1)).toBe('2023-12-31')
  })

  it('locks and unlocks a single-period book', async () => {
    const db = await bookWithPeriods([{ starts: '2024-01-01', ends: '2024-12-31' }])
    lockFiscalPeriod(db, '2024-12-31')
    expect(lockDate(db)).toBe('2024-12-31')
    expect(isFiscalPeriodLocked(db, '2024-12-31')).toBe(true)

    expect(unlockFiscalPeriod(db, '2024-12-31')).toBe(true)
    expect(lockDate(db)).toBe('2023-12-31')
    expect(isFiscalPeriodLocked(db, '2024-12-31')).toBe(false)
    db.close()
  })

  it('unlocks an earlier period while keeping an earlier lock when a prior period exists', async () => {
    const db = await bookWithPeriods([
      { starts: '2023-01-01', ends: '2023-12-31' },
      { starts: '2024-01-01', ends: '2024-12-31' },
    ])
    lockFiscalPeriod(db, '2024-12-31')
    expect(unlockFiscalPeriod(db, '2024-12-31')).toBe(true)
    expect(lockDate(db)).toBe('2023-12-31')
    expect(isFiscalPeriodLocked(db, '2023-12-31')).toBe(true)
    expect(isFiscalPeriodLocked(db, '2024-12-31')).toBe(false)
    db.close()
  })

  it('reports locked when a later global lock covers the period', async () => {
    const db = await bookWithPeriods([
      { starts: '2024-01-01', ends: '2024-12-31' },
      { starts: '2025-01-01', ends: '2025-12-31' },
    ])
    lockFiscalPeriod(db, '2025-12-31')
    expect(isFiscalPeriodLocked(db, '2024-12-31')).toBe(true)
    expect(unlockFiscalPeriod(db, '2024-12-31')).toBe(true)
    expect(isFiscalPeriodLocked(db, '2024-12-31')).toBe(false)
    expect(isFiscalPeriodLocked(db, '2025-12-31')).toBe(false)
    db.close()
  })

  it('refuses unlock when tilinpäätös is confirmed', async () => {
    const db = await bookWithPeriods([{ starts: '2026-01-01', ends: '2026-12-31' }])
    const { updateFiscalPeriodJson } = await import('../../../fiscalPeriod')
    updateFiscalPeriodJson(db, '2026-01-01', { vahvistettu: '2026-08-28' })
    lockFiscalPeriod(db, '2026-12-31')
    expect(() => unlockFiscalPeriod(db, '2026-12-31')).toThrow(/vahvistus/)
    db.close()
  })
})
