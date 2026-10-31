/**
 * Synthetic company book for tests. Every name, date and figure is invented (the repo is public).
 * The kinds of mess are real ones: documents on normal vouchers, several documents on one voucher,
 * the same file on two vouchers, and words that only look like documents.
 */
import { buildNewBook, PRACTICE_BUSINESS_ID } from '../../newBook/createBook'
import { SqliteDb } from '../../sqlite'
import {
  TYPE_ATTACHMENT_NOTE,
  TYPE_EXPENSE,
  TYPE_OTHER,
  TYPE_TRANSFER,
  TYPE_VAT_RETURN,
} from '../../vouchers'

export type CompanyFixture = {
  db: SqliteDb
  vouchers: Record<string, number>
  /** `Liite.id` by file name. */
  files: Record<string, number>
  voucher: (key: string, date: string, type: number, title: string, fileNames?: string[], status?: number) => number
  addFile: (voucherId: number, name: string, role?: string | null) => number
}

export async function buildCompanyFixture(): Promise<CompanyFixture> {
  const bytes = await buildNewBook({
    name: 'Esimerkki Oy',
    businessId: PRACTICE_BUSINESS_ID,
    yearStart: '2031-01-01',
    yearEnd: '2031-12-31',
    vatLiable: false,
    vatPeriod: 3,
    practice: true,
  })
  const db = await SqliteDb.fromBytes(bytes)
  for (const year of [2032, 2033, 2034]) {
    db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [`${year}-01-01`, `${year}-12-31`, '{}'])
  }
  db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('TilitPaatetty', '2032-12-31')")

  const vouchers: Record<string, number> = {}
  const files: Record<string, number> = {}

  const addFile = (voucherId: number, name: string, role: string | null = null) => {
    db.run('INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, data) VALUES (?, ?, ?, ?, ?)', [
      voucherId,
      name,
      role,
      'application/pdf',
      new TextEncoder().encode(`%PDF-${name}`),
    ])
    const id = Number(db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id)
    files[name] = id
    return id
  }

  let number = 0
  const voucher = (key: string, date: string, type: number, title: string, fileNames: string[] = [], status = 100) => {
    number += 1
    db.run('INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko) VALUES (?, ?, ?, ?, ?)', [
      date,
      type,
      status,
      status >= 100 ? number : 0,
      title,
    ])
    const id = Number(db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id)
    vouchers[key] = id
    for (const name of fileNames) addFile(id, name)
    return id
  }

  // Period 2031: documents on their own type-800 vouchers.
  voucher('statements2031', '2032-04-10', TYPE_ATTACHMENT_NOTE, 'Tilinpäätös 2031 allekirjoitettu', ['tilinpaatos-2031.pdf'])
  voucher('agm2032', '2032-04-20', TYPE_ATTACHMENT_NOTE, 'Yhtiökokous 2032', ['kokous-poytakirja-2032.pdf'])
  // Kitsas's own statement PDF: voucher 0, by role.
  addFile(0, 'tilinpaatos.pdf', 'TP_2031-12-31')
  addFile(0, 'tilinpaatos.txt', 'TPTEKSTI_2031-12-31')

  // Period 2032: three documents on the voucher that books the decision.
  voucher('decision2033', '2033-05-02', TYPE_TRANSFER, 'Varsinainen yhtiökokous ja tilinpäätös 2033', [
    'Signeerattu tilinpäätös 2032.pdf',
    'Signeerattu tt-kertomus 2032.pdf',
    'Yhtiokokouksen poytakirja 2033.pdf',
  ])
  // One meeting's two documents on one voucher, the second of an extraordinary meeting.
  voucher('board2033', '2033-02-01', TYPE_ATTACHMENT_NOTE, 'Hallituksen kokous ja ylimääräinen yhtiökokous', [
    'Hallituksen poytakirja.pdf',
    'Ylimaarainen yhtiokokous poytakirja 2033.pdf',
  ])
  // The same tax decision on its own document and on the voucher that pays the tax.
  voucher('taxDecision', '2033-10-15', TYPE_ATTACHMENT_NOTE, 'Verotuspäätös tuloverosta 2032', ['Verotuspaatos (pdf)_15.10.2033.pdf'])
  voucher('taxPayment', '2033-11-20', TYPE_OTHER, 'Maksu viitteellä RF1234', ['Verotuspaatos (pdf)_15.10.2033.pdf'])

  // The company's own documents.
  voucher('articles', '2031-02-01', TYPE_ATTACHMENT_NOTE, 'Yhtiöjärjestys', ['yhtiojarjestys.pdf'])
  voucher('extract', '2032-02-01', TYPE_ATTACHMENT_NOTE, 'Kaupparekisteriote', ['ote.pdf'])

  // Words that only look like documents.
  voucher('vatReturn', '2032-03-31', TYPE_VAT_RETURN, 'Arvonlisäveroilmoitus 01.03.2032 - 31.03.2032')
  addFile(vouchers.vatReturn, 'alv.pdf', 'alv')
  voucher('transferTax', '2032-06-01', TYPE_TRANSFER, 'VSV // maksu', ['Varainsiirtoveroilmoitus_01.06.2032.pdf'])
  voucher('statementInvoice', '2032-03-01', TYPE_EXPENSE, 'Tilinpäätöksen laatiminen', ['lasku-tilinpaatos.pdf'])
  voucher('hexName', '2032-08-01', TYPE_OTHER, 'Pankkimaksu', ['f3c90d17ab6b42e08c5d6b7719e0a2cd41be6f08.pdf'])

  // A deleted document, a draft, and a document with no words to go on.
  voucher('deleted', '2033-03-01', TYPE_ATTACHMENT_NOTE, 'Yhtiökokous poistettu', ['poistettu.pdf'], 0)
  voucher('draft', '2033-03-02', TYPE_ATTACHMENT_NOTE, 'Yhtiökokous luonnos', ['luonnos.pdf'], 50)
  voucher('plain', '2033-03-03', TYPE_ATTACHMENT_NOTE, 'Muistio', ['muistio.pdf'])

  // A rental object's document: already somewhere, so neither suggested nor unlinked.
  voucher('rentalDoc', '2033-03-04', TYPE_ATTACHMENT_NOTE, 'Hallituksen kokous vuokrasopimuksista', ['vuokra.pdf'])
  db.run(
    `CREATE TABLE IF NOT EXISTS TilariData (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated TEXT)`,
  )
  db.run('INSERT INTO TilariData (key, value, updated) VALUES (?, ?, ?)', [
    'property/10',
    JSON.stringify({ v: 1, rev: 1, eras: [], doc_voucher_ids: [vouchers.rentalDoc] }),
    '2033-03-04T10:00:00.000Z',
  ])

  return { db, vouchers, files, voucher, addFile }
}
