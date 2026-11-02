/** Synthetic book for tax return tests. Every name, date and figure is invented (the repo is public). */
import { buildNewBook, PRACTICE_BUSINESS_ID } from '../../newBook/createBook'
import { SqliteDb } from '../../sqlite'
import { computeTaxReturn } from './domain/compute'
import { ANSWERS } from './domain/fields6b'
import { writeInputs, writeOverrides } from './domain/inputs'
import type { Target } from './domain/mapping'
import type { TaxReturnInputs, TaxReturnView } from './domain/types'

/** Every OmaVero question answered no. */
export const ALL_NO: Record<string, boolean> = Object.fromEntries(ANSWERS.map((answer) => [answer.key, false]))

export type Posting = [account: number, debitCents: number, creditCents: number]

export type TaxFixture = {
  db: SqliteDb
  ends: string
  post: (date: string, lines: Posting[], status?: number, type?: number) => number
  addAccount: (account: number, type: string, name: string) => void
  inputs: (inputs: Partial<TaxReturnInputs>, ends?: string) => void
  place: (accounts: Record<string, Target | null>) => void
  view: (ends?: string, today?: string) => TaxReturnView
}

export async function buildTaxFixture(year = 2031): Promise<TaxFixture> {
  const bytes = await buildNewBook({
    name: 'Esimerkki Oy',
    businessId: PRACTICE_BUSINESS_ID,
    yearStart: `${year}-01-01`,
    yearEnd: `${year}-12-31`,
    vatLiable: false,
    vatPeriod: 3,
    practice: true,
  })
  const db = await SqliteDb.fromBytes(bytes)
  db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [`${year + 1}-01-01`, `${year + 1}-12-31`, '{}'])
  db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('VeroYhteysHenkilo', 'Essi Esimerkki')")
  db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('VeroYhteysPuhelin', '0401234567')")
  const ends = `${year}-12-31`
  let number = 0
  return {
    db,
    ends,
    post(date, lines, status = 100, type = 0) {
      number += 1
      db.run('INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko) VALUES (?, ?, ?, ?, ?)', [date, type, status, status >= 100 ? number : 0, 'Tosite'])
      const voucher = Number(db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id)
      lines.forEach(([account, debit, credit], index) => {
        db.run('INSERT INTO Vienti (tosite, rivi, pvm, tili, debetsnt, kreditsnt) VALUES (?, ?, ?, ?, ?, ?)', [voucher, index + 1, date, account, debit || null, credit || null])
      })
      return voucher
    },
    addAccount(account, type, name) {
      db.run('INSERT INTO Tili (numero, tyyppi, json) VALUES (?, ?, ?)', [account, type, JSON.stringify({ nimi: { fi: name } })])
    },
    inputs(inputs, at = ends) {
      writeInputs(db, at, inputs, '2030-01-01T00:00:00.000Z')
    },
    place(accounts) {
      writeOverrides(db, accounts, '2030-01-01T00:00:00.000Z')
    },
    view(at = ends, today = `${year + 3}-01-01`) {
      return computeTaxReturn(db, at, { today })
    },
  }
}

export function check(view: TaxReturnView, key: string) {
  return view.checks.find((c) => c.key === key)
}
