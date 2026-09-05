import { describe, expect, it } from 'vitest'
import {
  expandOwnRowToEntries,
  expandOwnRowsToEntries,
  groupOwnRows,
  listOtherBankRows,
  matchAndHideDuplicates,
  splitBankStatementLine,
  statementBalances,
  statementOpening,
  type StatementOwnRow,
  type StatementOtherRow,
} from './bankStatement'
import { saveVoucher } from './posting'
import { ENTRY_COUNTER_POSTING, ENTRY_POSTING, getVoucher } from './vouchers'
import { SqliteDb } from './sqlite'

describe('groupOwnRows / expandOwnRowToEntries', () => {
  it('groups bank VASTAKIRJAUS + counterpart into one white row', () => {
    const rows = groupOwnRows(
      [
        {
          id: 1,
          entry_type: ENTRY_COUNTER_POSTING,
          date: '2024-10-05',
          account: 1910,
          description: 'Vuokra',
          debit_cents: 12550,
          credit_cents: null,
          partner: { id: 1, name: 'ASUNTO ENSIN OY' },
        },
        {
          id: 2,
          entry_type: ENTRY_POSTING,
          date: '2024-10-05',
          account: 3760,
          description: 'Vuokra',
          debit_cents: null,
          credit_cents: 12550,
          vat_code: 0,
          allocation: 3,
        },
      ],
      1910,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].amountCents).toBe(12550)
    expect(rows[0].counterAccount).toBe(3760)
    expect(rows[0].payee).toBe('ASUNTO ENSIN OY')
    expect(rows[0].allocation).toBe(3)
    expect(rows[0].bankEntryId).toBe(1)
  })

  it('round-trips a simple expense row (withdrawal)', () => {
    const own: StatementOwnRow = {
      kind: 'own',
      key: 'a',
      date: '2024-10-02',
      payee: 'VERNERI',
      description: 'PIN',
      counterAccount: 4000,
      vat_code: 0,
      vat_percent: null,
      allocation: 0,
      amountCents: -4500,
    }
    const entries = expandOwnRowToEntries(own, 1910)
    expect(entries).toHaveLength(2)
    expect(entries[0].account).toBe(1910)
    expect(entries[0].credit_cents).toBe(4500)
    expect(entries[0].entry_type).toBe(ENTRY_COUNTER_POSTING)
    expect(entries[1].account).toBe(4000)
    expect(entries[1].debit_cents).toBe(4500)

    const regrouped = groupOwnRows(
      entries.map((e, i) => ({
        id: i + 1,
        entry_type: e.entry_type,
        date: e.date!,
        account: e.account,
        description: e.description,
        debit_cents: e.debit_cents ?? null,
        credit_cents: e.credit_cents ?? null,
        vat_code: e.vat_code,
        allocation: e.allocation,
      })),
      1910,
    )
    expect(regrouped).toHaveLength(1)
    expect(regrouped[0].amountCents).toBe(-4500)
    expect(regrouped[0].counterAccount).toBe(4000)
  })

  it('splits gross amount into net + VAT companion on expand', () => {
    const own: StatementOwnRow = {
      kind: 'own',
      key: 'b',
      date: '2024-10-01',
      payee: '',
      description: 'Ostos',
      counterAccount: 4000,
      vat_code: 21,
      vat_percent: 25.5,
      allocation: 0,
      amountCents: -12550,
    }
    const entries = expandOwnRowToEntries(own, 1910)
    expect(entries).toHaveLength(3)
    const gross = 12550
    const vat = Math.round((gross * 25.5) / 125.5)
    const net = gross - vat
    expect(entries[0].credit_cents).toBe(gross)
    expect(entries[1].debit_cents).toBe(net)
    expect(entries[2].account).toBe(1763)
    expect(entries[2].debit_cents).toBe(vat)
  })

  it('skips hidden rows when expanding many', () => {
    const rows: StatementOwnRow[] = [
      {
        kind: 'own',
        key: '1',
        date: '2024-10-01',
        payee: '',
        description: 'a',
        counterAccount: 4000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: -1000,
        hidden: true,
      },
      {
        kind: 'own',
        key: '2',
        date: '2024-10-02',
        payee: '',
        description: 'b',
        counterAccount: 3000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: 2000,
      },
    ]
    const entries = expandOwnRowsToEntries(rows, 1910)
    expect(entries.every((e) => e.account === 1910 || e.account === 3000)).toBe(true)
    expect(entries.find((e) => e.account === 4000)).toBeUndefined()
  })
})

describe('matchAndHideDuplicates', () => {
  it('hides own row matched by archive id', () => {
    const own: StatementOwnRow[] = [
      {
        kind: 'own',
        key: '1',
        date: '2024-10-10',
        payee: 'X',
        description: 'd',
        counterAccount: 4000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: -5000,
        archive_id: 'ARC-1',
      },
    ]
    const other: StatementOtherRow[] = [
      {
        kind: 'other',
        key: 'o1',
        date: '2024-10-10',
        payee: 'Y',
        description: 'other',
        counterAccount: 4000,
        counterAccounts: [4000],
        vat_code: null,
        vat_percent: null,
        amountCents: -5000,
        voucherId: 99,
        voucherRef: '99/24',
        entryId: 5,
        archive_id: 'ARC-1',
      },
    ]
    const matched = matchAndHideDuplicates(own, other)
    expect(matched[0].hidden).toBe(true)
  })

  it('hides unique date+amount twin', () => {
    const own: StatementOwnRow[] = [
      {
        kind: 'own',
        key: '1',
        date: '2024-10-10',
        payee: 'Same',
        description: 'desc',
        counterAccount: 4000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: -5000,
      },
    ]
    const other: StatementOtherRow[] = [
      {
        kind: 'other',
        key: 'o1',
        date: '2024-10-10',
        payee: 'Same',
        description: 'desc',
        counterAccount: 4000,
        counterAccounts: [4000],
        vat_code: null,
        vat_percent: null,
        amountCents: -5000,
        voucherId: 99,
        voucherRef: '99/24',
        entryId: 5,
      },
    ]
    expect(matchAndHideDuplicates(own, other)[0].hidden).toBe(true)
  })
})

describe('statementBalances', () => {
  it('computes opening + deposits − withdrawals', () => {
    const own: StatementOwnRow[] = [
      {
        kind: 'own',
        key: '1',
        date: '2024-10-01',
        payee: '',
        description: '',
        counterAccount: 3000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: 10000,
      },
      {
        kind: 'own',
        key: '2',
        date: '2024-10-02',
        payee: '',
        description: '',
        counterAccount: 4000,
        vat_code: 0,
        vat_percent: null,
        allocation: 0,
        amountCents: -3000,
        hidden: true,
      },
    ]
    const other: StatementOtherRow[] = [
      {
        kind: 'other',
        key: 'o',
        date: '2024-10-03',
        payee: '',
        description: '',
        counterAccount: 4000,
        counterAccounts: [4000],
        vat_code: null,
        vat_percent: null,
        amountCents: -2000,
        voucherId: 1,
        voucherRef: '1/24',
        entryId: 1,
      },
    ]
    const b = statementBalances(50000, own, other)
    expect(b.opening_cents).toBe(50000)
    expect(b.deposits_cents).toBe(10000)
    expect(b.withdrawals_cents).toBe(2000) // hidden own excluded; green included
    expect(b.closing_cents).toBe(58000)
  })
})

describe('listOtherBankRows', () => {
  it('returns other vouchers’ bank lines with counter-accounts and skips self', async () => {
    const db = await SqliteDb.empty()
    db.run(`CREATE TABLE Tosite (
      id INTEGER PRIMARY KEY, pvm TEXT, tyyppi INTEGER, tila INTEGER, tunniste INTEGER,
      sarja TEXT, otsikko TEXT, kumppani INTEGER, laskupvm TEXT, erapvm TEXT, viite TEXT, json TEXT)`)
    db.run(`CREATE TABLE Vienti (
      id INTEGER PRIMARY KEY, rivi INTEGER, tosite INTEGER, tyyppi INTEGER, pvm TEXT, tili INTEGER,
      kohdennus INTEGER, selite TEXT, debetsnt INTEGER, kreditsnt INTEGER, eraid INTEGER,
      alvprosentti REAL, alvkoodi INTEGER, kumppani INTEGER, jaksoalkaa TEXT, jaksoloppuu TEXT,
      arkistotunnus TEXT, json TEXT)`)
    db.run(`CREATE TABLE Kumppani (id INTEGER PRIMARY KEY, nimi TEXT, alvtunnus TEXT, json TEXT)`)
    db.run(`CREATE TABLE Tili (numero INTEGER PRIMARY KEY, tyyppi TEXT, json TEXT)`)
    db.run(`CREATE TABLE Tilikausi (alkaa TEXT PRIMARY KEY, loppuu TEXT, json TEXT)`)
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-01-01', '2024-12-31', '{}')`)
    db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (1910, 'AR', '{}')`)
    db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (4000, 'D', '{}')`)
    db.run(
      `INSERT INTO Tosite (id, pvm, tyyppi, tila, tunniste, sarja, otsikko, json)
       VALUES (10, '2024-10-05', 100, 100, 254, '', 'Meno', '{}')`,
    )
    db.run(
      `INSERT INTO Tosite (id, pvm, tyyppi, tila, tunniste, sarja, otsikko, json)
       VALUES (11, '2024-10-31', 400, 100, 255, '', 'Tiliote', '{}')`,
    )
    db.run(
      `INSERT INTO Vienti (id, rivi, tosite, tyyppi, pvm, tili, kohdennus, selite, debetsnt, kreditsnt, alvkoodi)
       VALUES (1, 1, 10, 0, '2024-10-05', 1910, 0, 'Maksu', NULL, 5000, 0)`,
    )
    db.run(
      `INSERT INTO Vienti (id, rivi, tosite, tyyppi, pvm, tili, kohdennus, selite, debetsnt, kreditsnt, alvkoodi)
       VALUES (2, 2, 10, 0, '2024-10-05', 4000, 0, 'Maksu', 5000, NULL, 0)`,
    )
    db.run(
      `INSERT INTO Vienti (id, rivi, tosite, tyyppi, pvm, tili, kohdennus, selite, debetsnt, kreditsnt, alvkoodi)
       VALUES (3, 1, 11, 2, '2024-10-06', 1910, 0, 'Oma', NULL, 1000, 0)`,
    )

    const other = listOtherBankRows(db, {
      account: 1910,
      startDate: '2024-10-01',
      endDate: '2024-10-31',
      excludeVoucherId: 11,
    })
    expect(other).toHaveLength(1)
    expect(other[0].voucherId).toBe(10)
    expect(other[0].voucherRef).toBe('254/24')
    expect(other[0].amountCents).toBe(-5000)
    expect(other[0].counterAccount).toBe(4000)

    expect(statementOpening(db, 1910, '2024-10-01')).toBe(0)
    db.close()
  })
})

describe('splitBankStatementLine', () => {
  async function statementDb() {
    const db = await SqliteDb.empty()
    db.run(`CREATE TABLE Asetus (avain TEXT PRIMARY KEY, arvo TEXT)`)
    db.run(`CREATE TABLE Tilikausi (alkaa TEXT PRIMARY KEY, loppuu TEXT, json TEXT)`)
    db.run(`CREATE TABLE Tili (numero INTEGER PRIMARY KEY, tyyppi TEXT, iban TEXT, json TEXT)`)
    db.run(`CREATE TABLE Kumppani (id INTEGER PRIMARY KEY, nimi TEXT, alvtunnus TEXT, json TEXT)`)
    db.run(`CREATE TABLE Kohdennus (id INTEGER PRIMARY KEY, tyyppi INTEGER, kuuluu INTEGER, json TEXT)`)
    db.run(`INSERT INTO Kohdennus (id, tyyppi, kuuluu, json) VALUES (0, 0, NULL, '{}')`)
    db.run(`CREATE TABLE Tosite (
      id INTEGER PRIMARY KEY, pvm TEXT, tyyppi INTEGER, tila INTEGER, tunniste INTEGER,
      sarja TEXT, otsikko TEXT, kumppani INTEGER, laskupvm TEXT, erapvm TEXT, viite TEXT, json TEXT)`)
    db.run(`CREATE TABLE Vienti (
      id INTEGER PRIMARY KEY, rivi INTEGER, tosite INTEGER, tyyppi INTEGER, pvm TEXT, tili INTEGER,
      kohdennus INTEGER, selite TEXT, debetsnt INTEGER, kreditsnt INTEGER, eraid INTEGER,
      alvprosentti REAL, alvkoodi INTEGER, kumppani INTEGER, jaksoalkaa TEXT, jaksoloppuu TEXT,
      arkistotunnus TEXT, json TEXT)`)
    db.run(`CREATE TABLE Tositeloki (id INTEGER PRIMARY KEY, tosite INTEGER, data TEXT, userid INTEGER, tila INTEGER)`)
    db.run(`CREATE TABLE Liite (id INTEGER PRIMARY KEY, tosite INTEGER, nimi TEXT, roolinimi TEXT, tyyppi TEXT, sha TEXT, data BLOB)`)
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-01-01', '2024-12-31', '{}')`)
    for (const [n, t, name] of [
      [1910, 'AR', 'Pankki'],
      [4000, 'D', 'Ostot'],
      [1763, 'AL', 'ALV-saatavat'],
    ] as const) {
      db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (?, ?, ?)`, [
        n,
        t,
        JSON.stringify({ nimi: { fi: name } }),
      ])
    }
    return db
  }

  it('splits a VAT white row (bank gross ≠ counterpart net) into a balanced voucher', async () => {
    const db = await statementDb()
    const gross = 2035
    const vat = Math.round((gross * 25.5) / 125.5)
    const net = gross - vat
    const statementId = saveVoucher(db, {
      date: '2024-10-15',
      type: 400,
      status: 100,
      title: 'Tiliote',
      json: { tiliote: { alkupvm: '2024-10-01', loppupvm: '2024-10-31', tili: 1910 } },
      entries: [
        {
          line_no: 1,
          entry_type: ENTRY_COUNTER_POSTING,
          date: '2024-10-15',
          account: 1910,
          description: 'Ostos',
          debit_cents: null,
          credit_cents: gross,
          vat_code: 0,
        },
        {
          line_no: 2,
          entry_type: ENTRY_POSTING,
          date: '2024-10-15',
          account: 4000,
          description: 'Ostos',
          debit_cents: net,
          credit_cents: null,
          vat_code: 21,
          vat_percent: 25.5,
        },
        {
          line_no: 3,
          entry_type: 0,
          date: '2024-10-15',
          account: 1763,
          description: 'ALV',
          debit_cents: vat,
          credit_cents: null,
          vat_code: 0,
        },
      ],
    })
    const before = getVoucher(db, statementId)!
    const bankEntryId = before.entries.find((e) => e.account === 1910)!.id

    const newId = splitBankStatementLine(db, statementId, bankEntryId)
    const created = getVoucher(db, newId)!
    expect(created.type).toBe(100) // expense
    expect(created.entries).toHaveLength(3)
    const debit = created.entries.reduce((s, e) => s + (e.debit_cents || 0), 0)
    const credit = created.entries.reduce((s, e) => s + (e.credit_cents || 0), 0)
    expect(debit).toBe(credit)
    expect(debit).toBe(gross)

    const left = getVoucher(db, statementId)!
    expect(left.entries).toHaveLength(0)
    db.close()
  })

  it('splits when arkistotunnus is only on the bank leg (Kitsas import)', async () => {
    const db = await statementDb()
    const statementId = saveVoucher(db, {
      date: '2024-10-15',
      type: 400,
      status: 100,
      title: 'Tiliote',
      json: { tiliote: { alkupvm: '2024-10-01', loppupvm: '2024-10-31', tili: 1910 } },
      entries: [
        {
          line_no: 1,
          entry_type: ENTRY_COUNTER_POSTING,
          date: '2024-10-15',
          account: 1910,
          description: 'Vuokra',
          debit_cents: 1000,
          credit_cents: null,
          vat_code: 0,
          archive_id: 'ARC-ONLY-BANK',
        },
        {
          line_no: 2,
          entry_type: ENTRY_POSTING,
          date: '2024-10-15',
          account: 4000,
          description: 'Vuokra',
          debit_cents: null,
          credit_cents: 1000,
          vat_code: 0,
        },
      ],
    })
    const before = getVoucher(db, statementId)!
    const bankEntryId = before.entries.find((e) => e.account === 1910)!.id
    const newId = splitBankStatementLine(db, statementId, bankEntryId)
    const created = getVoucher(db, newId)!
    expect(created.entries).toHaveLength(2)
    expect(
      created.entries.reduce((s, e) => s + (e.debit_cents || 0), 0),
    ).toBe(created.entries.reduce((s, e) => s + (e.credit_cents || 0), 0))
    db.close()
  })

  it('splits using explicit entryIds even when grouping would struggle', async () => {
    const db = await statementDb()
    const statementId = saveVoucher(db, {
      date: '2024-10-15',
      type: 400,
      status: 100,
      title: 'Tiliote',
      json: { tiliote: { alkupvm: '2024-10-01', loppupvm: '2024-10-31', tili: 1910 } },
      entries: [
        {
          line_no: 1,
          entry_type: 0,
          date: '2024-10-15',
          account: 4000,
          description: 'Meno',
          debit_cents: 1000,
          credit_cents: null,
        },
        {
          line_no: 2,
          entry_type: 0,
          date: '2024-10-15',
          account: 1910,
          description: 'Meno',
          debit_cents: null,
          credit_cents: 1000,
        },
      ],
    })
    const before = getVoucher(db, statementId)!
    const ids = before.entries.map((e) => e.id)
    const newId = splitBankStatementLine(db, statementId, ids[0], null, ids)
    const created = getVoucher(db, newId)!
    expect(created.entries).toHaveLength(2)
    db.close()
  })
})
