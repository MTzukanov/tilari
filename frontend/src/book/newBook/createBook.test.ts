import { describe, expect, it } from 'vitest'
import { getAccounts, getPeriods, getSettings, validateBook } from '../access'
import { Ledger } from '../ledger'
import { SqliteDb } from '../sqlite'
import {
  PRACTICE_BUSINESS_ID,
  buildNewBook,
  isValidFinnishBusinessId,
  isValidFiscalYear,
  kitsasFileName,
  suggestFiscalYear,
} from './createBook'
import { DEFAULT_TEMPLATE_FI } from '../modules/periodEnd/domain/statementTemplate'

const SAMPLE = {
  name: 'Uusi Testi Oy',
  businessId: '1234567-1',
  yearStart: '2026-01-01',
  yearEnd: '2026-12-31',
  vatLiable: true,
  vatPeriod: 1 as const,
  practice: false,
}

describe('new book helpers', () => {
  it('checks Finnish business ids', () => {
    expect(isValidFinnishBusinessId('1234567-1')).toBe(true)
    expect(isValidFinnishBusinessId('1234567-2')).toBe(false)
    expect(isValidFinnishBusinessId('12345671')).toBe(false)
  })

  it('accepts fiscal years up to 18 months', () => {
    expect(isValidFiscalYear('2026-01-01', '2026-12-31')).toBe(true)
    expect(isValidFiscalYear('2026-01-01', '2026-01-01')).toBe(false)
    expect(isValidFiscalYear('2026-01-01', '2027-07-01')).toBe(true)
    expect(isValidFiscalYear('2026-01-01', '2027-07-02')).toBe(false)
  })

  it('suggests the calendar year of today', () => {
    expect(suggestFiscalYear('2026-09-03')).toEqual({ starts: '2026-01-01', ends: '2026-12-31' })
  })

  it('builds a .kitsas file name from the company name', () => {
    expect(kitsasFileName('Uusi Testi Oy')).toBe('Uusi Testi Oy.kitsas')
    expect(kitsasFileName('a/b:c')).toBe('abc.kitsas')
  })
})

describe('buildNewBook', () => {
  it('seeds schema 24, the yritys chart, and user overlays', async () => {
    const bytes = await buildNewBook(SAMPLE)
    const db = await SqliteDb.fromBytes(bytes)
    try {
      validateBook(db)
      const settings = getSettings(db, [
        'KpVersio',
        'Nimi',
        'Ytunnus',
        'Harjoitus',
        'AlvVelvollinen',
        'AlvKausi',
        'AlvAlkaa',
        'TilitPaatetty',
        'muoto',
        'LuotuVersiolla',
        'tppohja/fi',
      ])
      expect(settings.KpVersio).toBe('24')
      expect(settings.Nimi).toBe('Uusi Testi Oy')
      expect(settings.Ytunnus).toBe('1234567-1')
      expect(settings.Harjoitus).toBe('EI')
      expect(settings.AlvVelvollinen).toBe('ON')
      expect(settings.AlvKausi).toBe('1')
      expect(settings.AlvAlkaa).toBe('2026-01-01')
      expect(settings.TilitPaatetty).toBe('2025-12-31')
      expect(settings.muoto).toBe('oy')
      expect(settings.LuotuVersiolla).toBe('tilari')
      expect(settings['tppohja/fi']).toBe(DEFAULT_TEMPLATE_FI)
      expect(settings['tppohja/fi']).toContain('Tilari-ohjelmistolla')

      const periods = getPeriods(db)
      expect(periods).toEqual([{ starts: '2026-01-01', ends: '2026-12-31', json: '{}' }])

      const headings = db.all<{ n: number }>('SELECT COUNT(*) AS n FROM Otsikko')[0]
      const accounts = getAccounts(db)
      expect(Number(headings?.n)).toBeGreaterThan(10)
      expect(accounts.length).toBeGreaterThan(100)
      expect(accounts.some((a) => a.number === 1910 && a.type === 'ARP')).toBe(true)

      const general = db.get<{ id: number }>('SELECT id FROM Kohdennus WHERE id = 0')
      expect(general?.id).toBe(0)
      const tax = db.get<{ nimi: string }>("SELECT nimi FROM Kumppani WHERE nimi = 'Verohallinto'")
      expect(tax?.nimi).toBe('Verohallinto')

      const vouchers = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM Tosite')
      expect(Number(vouchers?.n)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('opens in Ledger and returns meta', async () => {
    const bytes = await buildNewBook({ ...SAMPLE, practice: true, vatLiable: false, vatPeriod: 12 })
    const ledger = new Ledger()
    try {
      const meta = await ledger.openBytes(bytes, {
        sourceName: 'Uusi Testi Oy.kitsas',
        dbPath: 'test:new',
      })
      expect(meta.name).toBe('Uusi Testi Oy')
      expect(meta.business_id).toBe('1234567-1')
      expect(meta.practice).toBe(true)
      expect(meta.schema_version).toBe('24')
      expect(meta.periods).toEqual([{ starts: '2026-01-01', ends: '2026-12-31' }])
      const company = ledger.getSettings().company
      expect(company.AlvVelvollinen).toBe('EI')
      expect(company.AlvKausi).toBe('12')
    } finally {
      ledger.closeLedger()
    }
  })

  it('skips Y-tunnus checksum in practice mode and fills a dummy when empty', async () => {
    const bytes = await buildNewBook({
      ...SAMPLE,
      businessId: '',
      practice: true,
    })
    const db = await SqliteDb.fromBytes(bytes)
    try {
      const settings = getSettings(db, ['Ytunnus', 'Harjoitus'])
      expect(settings.Harjoitus).toBe('ON')
      expect(settings.Ytunnus).toBe(PRACTICE_BUSINESS_ID)
    } finally {
      db.close()
    }

    const garbage = await buildNewBook({
      ...SAMPLE,
      businessId: 'harjoitus',
      practice: true,
    })
    const db2 = await SqliteDb.fromBytes(garbage)
    try {
      expect(getSettings(db2, ['Ytunnus']).Ytunnus).toBe('harjoitus')
    } finally {
      db2.close()
    }
  })
})
