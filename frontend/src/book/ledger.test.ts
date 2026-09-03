import { describe, expect, it } from 'vitest'
import { computeAllocationBalances, listAllocations } from './allocations'
import { computeAccountOpening, computeBalances } from './balances'
import { listVouchers } from './browse'
import {
  ACCOUNT_BANK,
  ACCOUNT_SALES,
  BALANCES_2024,
  BALANCES_2025,
  KP1_2024_WITH_PROJECTS,
  KP1_2024_WITHOUT_PROJECTS,
  LEDGER_1910_2024_03_CLOSING_RUNNING,
  LEDGER_1910_2024_03_COUNT,
  LEDGER_1910_2024_03_OPENING,
  LEDGER_3000_2024_04_OPENING,
} from './expected'
import { loadGoldenDb } from './golden'
import { registerPostingHooks } from './kernel/postingHooks'
import { computeVat } from './modules/vat/domain/vat'
import { allPostingHooks } from './modules/registry'
import { saveVoucher } from './posting'
import { balancesWithLines, entriesWithRunning } from './reports'
import { getSettings } from './access'
import { getCompany, putCompany } from './settings'
import { Ledger } from './ledger'
import { wallToday } from './clock'
import type { SqliteDb } from './sqlite'
import { getAttachment, getVoucher } from './vouchers'

registerPostingHooks(allPostingHooks())

async function withGolden(fn: (db: SqliteDb) => void | Promise<void>) {
  const db = await loadGoldenDb()
  try {
    await fn(db)
  } finally {
    db.close()
  }
}

describe('read-only domain', () => {
  it('year-end 2024 and 2025 balances', async () => {
    await withGolden((db) => {
      const y24 = computeBalances(db, '2024-12-31')
      const y25 = computeBalances(db, '2025-12-31')
      for (const [k, v] of Object.entries(BALANCES_2024)) expect(y24.balances[k]).toBe(v)
      for (const [k, v] of Object.entries(BALANCES_2025)) expect(y25.balances[k]).toBe(v)
      const lines = balancesWithLines(db, '2024-12-31').lines
      expect(lines.find((l) => l.number === 1910)?.section).toBe('assets')
      expect(lines.find((l) => l.number === 2251)?.section).toBe('liabilities')
      expect(lines.find((l) => l.number === 3000)?.section).toBe('profit')
    })
  })

  it('excludes drafts from reports', async () => {
    await withGolden((db) => {
      const draft = getVoucher(db, 6)
      expect(draft?.status).toBe(50)
      const listed = listVouchers(db)
      expect(listed.some((v) => v.id === 6)).toBe(false)
      expect(computeBalances(db, '2024-12-31').balances[String(ACCOUNT_BANK)]).toBe(
        BALANCES_2024[String(ACCOUNT_BANK)],
      )
    })
  })

  it('ledger opening and March running saldo', async () => {
    await withGolden((db) => {
      const march = entriesWithRunning(db, ACCOUNT_BANK, '2024-03-01', '2024-03-31')
      expect(march.opening_cents).toBe(LEDGER_1910_2024_03_OPENING)
      expect(march.count).toBe(LEDGER_1910_2024_03_COUNT)
      expect(march.entries.at(-1)?.balance_cents).toBe(LEDGER_1910_2024_03_CLOSING_RUNNING)
      expect(computeAccountOpening(db, ACCOUNT_SALES, '2024-04-01', { endDate: '2024-04-30' })).toBe(
        LEDGER_3000_2024_04_OPENING,
      )
    })
  })

  it('allocation P&L with and without projects', async () => {
    await withGolden((db) => {
      const names = listAllocations(db).map((a) => a.name)
      expect(names).toContain('Toimisto')
      const withP = computeAllocationBalances(db, 1, '2024-01-01', '2024-12-31', true)
      const without = computeAllocationBalances(db, 1, '2024-01-01', '2024-12-31', false)
      expect(withP.profit_cents).toBe(KP1_2024_WITH_PROJECTS.profit_cents)
      expect(without.profit_cents).toBe(KP1_2024_WITHOUT_PROJECTS.profit_cents)
    })
  })

  it('reads attachment bytes and company settings', async () => {
    await withGolden((db) => {
      const att = getAttachment(db, 1)
      expect(att?.name).toBe('kuitti.txt')
      expect(new TextDecoder().decode(att?.data)).toBe('test-liite\n')
      expect(getCompany(db).Nimi).toBe('Testikirja Oy')
      const vat = computeVat(db, '2024-01-01', '2024-12-31')
      expect(vat.start_date).toBe('2024-01-01')
    })
  })
})

describe('writes', () => {
  it('rejects unbalanced meno and posts a balanced siirto', async () => {
    await withGolden((db) => {
      expect(() =>
        saveVoucher(db, {
          date: '2024-08-01',
          type: 100,
          status: 100,
          title: 'x',
          entries: [{ account: 4000, debit_cents: 1 }],
        }),
      ).toThrow(/tasmaa/)
      const id = saveVoucher(db, {
        date: '2024-08-01',
        type: 300,
        status: 100,
        title: 'Siirto',
        entries: [
          { account: 1910, debit_cents: 100, description: 'siirto' },
          { account: 1910, credit_cents: 100, description: 'siirto' },
        ],
      })
      expect(getVoucher(db, id)?.type).toBe(300)
    })
  })

  it('updates company settings', async () => {
    await withGolden((db) => {
      putCompany(db, { Kaupunki: 'Turku' })
      expect(getCompany(db).Kaupunki).toBe('Turku')
    })
  })

  it('saveSettings ignores TilitPaatetty', async () => {
    const db = await loadGoldenDb()
    const bytes = db.export()
    const before = getCompany(db).TilitPaatetty
    db.close()
    const ledger = new Ledger()
    await ledger.openBytes(bytes, { sourceName: 'tilari-test.kitsas', dbPath: 'test:golden' })
    await ledger.saveSettings({ TilitPaatetty: '1999-01-01', Kaupunki: 'Tampere' })
    const company = getCompany(ledger.requireDb())
    expect(company.TilitPaatetty).toBe(before)
    expect(company.Kaupunki).toBe('Tampere')
    ledger.closeLedger()
  })
})

describe('practice clock', () => {
  it('exposes book_date from the session, not Asetus', async () => {
    const db = await loadGoldenDb()
    const bytes = db.export()
    db.close()
    const ledger = new Ledger()
    const meta = await ledger.openBytes(bytes, {
      sourceName: 'tilari-test.kitsas',
      dbPath: 'test:golden',
    })
    expect(meta.practice).toBe(true)
    expect(meta.book_date).toBe(wallToday())

    const moved = await ledger.setPracticeDate('2024-12-31')
    expect(moved.book_date).toBe('2024-12-31')
    expect(ledger.today()).toBe('2024-12-31')
    const stored = getSettings(ledger.requireDb(), ['Harjoitus', 'HarjoitusPvm', 'book_date'])
    expect(stored.Harjoitus).toBe('ON')
    expect(stored.HarjoitusPvm).toBeUndefined()
    expect(stored.book_date).toBeUndefined()

    await ledger.saveSettings({ Harjoitus: '1' })
    expect(ledger.isPractice()).toBe(true)
    expect((await ledger.fetchMeta()).practice).toBe(true)

    await ledger.saveSettings({ Harjoitus: 'EI' })
    expect(ledger.isPractice()).toBe(false)
    expect(ledger.today()).toBe(wallToday())
    const ignored = await ledger.setPracticeDate('2020-01-01')
    expect(ignored.book_date).toBe(wallToday())
    ledger.closeLedger()
  })
})
