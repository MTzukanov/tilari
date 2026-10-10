/**
 * Synthetic rental-object book for tests. Every name and amount is invented (the repo is
 * public). Built on a new schema-24 yritys book with rows inserted directly, like Kitsas
 * stores them: an item (tase-erä) root line has `eraid = id`, later lines carry that id.
 */
import { monthEnd } from '../../months'
import { buildNewBook, PRACTICE_BUSINESS_ID } from '../../newBook/createBook'
import { SqliteDb } from '../../sqlite'

export const CC = {
  bundle: 10, // apartment + parking space, two items, a refund moved between items, bank loan
  bundleProject: 11, // renovation project under the bundle
  sold: 20, // bought 2023, sold 2025 (sale voucher + broker invoice later)
  garage: 30, // item on 1453, bought 2024
  commercial: 40, // VAT-coded rent, one brutto line
  office: 50, // not a rental object
  parkingA: 60, // sold with parkingB on one voucher, equal amounts
  parkingB: 61,
  opening: 70, // item from the opening balance, cost centre on the opening line
  duoFlat: 80, // flat and parking space sold on one voucher, every sale line on the flat
  duoParking: 81,
} as const

const E = 100 // euro in cents

type Line = {
  account: number
  debit?: number
  credit?: number
  allocation?: number
  era?: 'new' | string
  description?: string
  vatCode?: number
  vatPct?: number
  date?: string
}

export type PropertyFixture = {
  db: SqliteDb
  /** Root line id of each named item. */
  eras: Record<string, number>
  vouchers: Record<string, number>
}

export async function buildPropertyFixture(): Promise<PropertyFixture> {
  const bytes = await buildNewBook({
    name: 'Esimerkki Vuokraus Oy',
    businessId: PRACTICE_BUSINESS_ID,
    yearStart: '2023-01-01',
    yearEnd: '2023-12-31',
    vatLiable: true,
    vatPeriod: 3,
    practice: true,
  })
  const db = await SqliteDb.fromBytes(bytes)
  for (const year of [2024, 2025, 2026]) {
    db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [`${year}-01-01`, `${year}-12-31`, '{}'])
  }
  const centre = (id: number, name: string, type = 1, parent: number | null = null, starts?: string, ends?: string) => {
    const json: Record<string, unknown> = { nimi: { fi: name } }
    if (starts) json.alkaa = starts
    if (ends) json.paattyy = ends
    db.run('INSERT INTO Kohdennus (id, tyyppi, kuuluu, json) VALUES (?, ?, ?, ?)', [id, type, parent, JSON.stringify(json)])
  }
  centre(CC.bundle, 'As Oy Esimerkkikatu 1 A 1', 1, null, '2023-02-01')
  centre(CC.bundleProject, 'Remontti A 1', 2, CC.bundle)
  centre(CC.sold, 'As Oy Mallitie 2 B 5', 1, null, '2023-03-01', '2025-12-31')
  centre(CC.garage, 'Testikuja 3 autotalli', 1)
  centre(CC.commercial, 'Liiketila Kauppatie 4', 1)
  centre(CC.office, 'Toimisto', 1)
  centre(CC.parkingA, 'Pysäköinti Satama P1', 1)
  centre(CC.parkingB, 'Pysäköinti Satama P2', 1)
  centre(CC.opening, 'As Oy Vanhatie 7 C 9', 1)
  centre(CC.duoFlat, 'As Oy Rantapolku 5 A 3', 1)
  centre(CC.duoParking, 'As Oy Rantapolku 5 AP 7', 1)

  const eras: Record<string, number> = {}
  const vouchers: Record<string, number> = {}
  const voucher = (
    key: string,
    date: string,
    type: number,
    title: string,
    lines: Line[],
    status = 100,
  ): number => {
    const id = db.run('INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko, json) VALUES (?, ?, ?, ?, ?, ?)', [
      date,
      type,
      status,
      status >= 100 ? Object.keys(vouchers).length + 1 : 0,
      title,
      '{}',
    ]).lastInsertRowid
    vouchers[key] = id
    lines.forEach((line, i) => {
      const lineId = db.run(
        `INSERT INTO Vienti (rivi, tosite, pvm, tili, kohdennus, selite, debetsnt, kreditsnt, alvkoodi, alvprosentti)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          i + 1,
          id,
          line.date ?? date,
          line.account,
          line.allocation ?? 0,
          line.description ?? title,
          line.debit ?? 0,
          line.credit ?? 0,
          line.vatCode ?? 0,
          line.vatPct ?? 0,
        ],
      ).lastInsertRowid
      if (line.era === 'new') {
        db.run('UPDATE Vienti SET eraid = ? WHERE id = ?', [lineId, lineId])
        eras[`${key}:${i}`] = lineId
      } else if (line.era) {
        db.run('UPDATE Vienti SET eraid = ? WHERE id = ?', [eras[line.era], lineId])
      }
    })
    return id
  }

  // Opening balance: an item on the shares account carrying its cost centre.
  voucher('opening', '2023-01-01', 9010, 'Tilinavaus', [
    { account: 1441, debit: 30_000 * E, allocation: CC.opening, era: 'new', description: 'Vanhatie 7 C 9 osakkeet' },
    { account: 2001, credit: 30_000 * E },
  ])
  eras.opening = eras['opening:0']

  // Bundle: apartment and parking space bought separately, transfer tax on the apartment item.
  voucher('buyA', '2023-02-01', 300, 'Kauppahinta Esimerkkikatu 1 A 1', [
    { account: 1441, debit: 80_000 * E, era: 'new' },
    { account: 1910, credit: 80_000 * E },
  ])
  eras.bundleFlat = eras['buyA:0']
  voucher('buyP', '2023-02-01', 300, 'Autopaikka Esimerkkikatu 1', [
    { account: 1453, debit: 5_000 * E, era: 'new' },
    { account: 1910, credit: 5_000 * E },
  ])
  eras.bundleParking = eras['buyP:0']
  voucher('taxA', '2023-02-10', 300, 'Varainsiirtovero Esimerkkikatu 1 A 1', [
    { account: 1441, debit: 1_600 * E, era: 'buyA:0' },
    { account: 1910, credit: 1_600 * E },
  ])
  // Bank loan for the bundle; instalments with interest on the same voucher.
  voucher('loan', '2023-02-01', 0, 'Pankkilaina', [
    { account: 1910, debit: 40_000 * E },
    { account: 2621, credit: 40_000 * E },
  ])
  for (const month of ['2023-03-01', '2023-04-01']) {
    voucher(`instalment${month}`, month, 0, 'Lainan lyhennys', [
      { account: 2621, debit: 500 * E },
      { account: 9460, debit: 100 * E },
      { account: 1910, credit: 600 * E },
    ])
  }

  // Sold object.
  voucher('buyB', '2023-03-01', 300, 'Kauppahinta Mallitie 2 B 5', [
    { account: 1441, debit: 60_000 * E, era: 'new' },
    { account: 1910, credit: 60_000 * E },
  ])
  eras.sold = eras['buyB:0']

  // Commercial unit.
  voucher('buyC', '2023-01-15', 300, 'Liiketila Kauppatie 4 kauppa', [
    { account: 1441, debit: 50_000 * E, era: 'new' },
    { account: 1910, credit: 50_000 * E },
  ])
  eras.commercial = eras['buyC:0']

  // Two parking spaces on one voucher each, sold together later.
  voucher('buyPA', '2023-05-01', 300, 'Pysäköinti Satama P1', [
    { account: 1453, debit: 3_000 * E, era: 'new' },
    { account: 1910, credit: 3_000 * E },
  ])
  eras.parkingA = eras['buyPA:0']
  voucher('buyPB', '2023-05-01', 300, 'Pysäköinti Satama P2', [
    { account: 1453, debit: 3_000 * E, era: 'new' },
    { account: 1910, credit: 3_000 * E },
  ])
  eras.parkingB = eras['buyPB:0']

  // Flat and parking space in one housing company, bought on their own vouchers.
  voucher('buyDuoFlat', '2023-04-01', 300, 'Kauppahinta Rantapolku 5 A 3', [
    { account: 1441, debit: 40_000 * E, era: 'new' },
    { account: 1910, credit: 40_000 * E },
  ])
  eras.duoFlat = eras['buyDuoFlat:0']
  voucher('buyDuoParking', '2023-04-01', 300, 'Autopaikka Rantapolku 5 AP 7', [
    { account: 1453, debit: 2_000 * E, era: 'new' },
    { account: 1910, credit: 2_000 * E },
  ])
  eras.duoParking = eras['buyDuoParking:0']

  // Monthly bank statements: rent and vastike for several objects on one voucher.
  const months: string[] = []
  for (let y = 2023; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (key >= '2023-03' && key <= '2026-09') months.push(key)
    }
  }
  for (const key of months) {
    // Kitsas dates a statement at its period end; the transactions come earlier in the month.
    const date = `${key}-05`
    const lines: Line[] = [
      { account: 3760, credit: 1_000 * E, allocation: CC.bundle, description: 'Vuokra A 1' },
      { account: 7300, debit: 300 * E, allocation: CC.bundle, description: 'Vastike A 1' },
    ]
    if (key <= '2025-05') {
      lines.push(
        { account: 3760, credit: 800 * E, allocation: CC.sold, description: 'Vuokra B 5' },
        { account: 7300, debit: 250 * E, allocation: CC.sold, description: 'Vastike B 5' },
      )
    }
    if (key >= '2024-02') lines.push({ account: 3790, credit: 100 * E, allocation: CC.garage, description: 'Autotallin vuokra' })
    if (key === '2024-03') {
      // One brutto-coded line: 1 240 incl. 24 % VAT = 1 000 net.
      lines.push({ account: 3790, credit: 1_240 * E, allocation: CC.commercial, vatCode: 12, vatPct: 24, description: 'Liiketilan vuokra' })
    } else {
      lines.push({ account: 3790, credit: 1_000 * E, allocation: CC.commercial, vatCode: 11, vatPct: 24, description: 'Liiketilan vuokra' })
    }
    const net = lines.reduce((s, l) => s + (l.credit ?? 0) - (l.debit ?? 0), 0)
    lines.push({ account: 1910, debit: net })
    voucher(`statement${key}`, monthEnd(key), 400, `Tiliote ${key}`, lines.map((l) => ({ ...l, date })))
  }
  db.run(
    "INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, data) VALUES (?, 'tiliote-2024-03.pdf', NULL, 'application/pdf', ?)",
    [vouchers['statement2024-03'], new TextEncoder().encode('%PDF-statement')],
  )

  // Transfer-tax refund credited to the account without an item, then moved off the item.
  voucher('refund', '2024-01-15', 300, 'Varainsiirtoveron palautus', [
    { account: 1910, debit: 400 * E },
    { account: 1441, credit: 400 * E },
  ])
  voucher('refundMove', '2024-02-01', 300, 'Tekninen kirjaus - kohdistaminen tase-erään', [
    { account: 1441, debit: 400 * E },
    { account: 1441, credit: 400 * E, era: 'buyA:0' },
  ])

  // Renovation booked on the project under the bundle.
  voucher('renovation', '2024-05-10', 100, 'Kylpyhuoneremontti', [
    { account: 7430, debit: 2_000 * E, allocation: CC.bundleProject },
    { account: 1910, credit: 2_000 * E },
  ])

  // Accrual and its reversal on the bundle (not cash).
  voucher('accrual', '2023-12-31', 9920, 'Jaksotus', [
    { account: 7300, debit: 300 * E, allocation: CC.bundle },
    { account: 2001, credit: 300 * E },
  ])
  voucher('accrualBack', '2024-01-01', 9920, 'Jaksotuksen palautus', [
    { account: 7300, credit: 300 * E, allocation: CC.bundle },
    { account: 2001, debit: 300 * E },
  ])

  // Garage bought 2024 on the other-shares account.
  voucher('buyG', '2024-01-10', 300, 'Testikuja 3 autotalli osakkeet', [
    { account: 1453, debit: 4_000 * E, era: 'new' },
    { account: 1910, credit: 4_000 * E },
  ])
  eras.garage = eras['buyG:0']

  // Both parking spaces sold on one voucher with equal amounts.
  voucher('saleParking', '2024-06-01', 0, 'Pysäköintipaikkojen myynti', [
    { account: 1910, debit: 5_000 * E },
    { account: 3990, credit: 2_500 * E, allocation: CC.parkingA },
    { account: 3990, credit: 2_500 * E, allocation: CC.parkingB },
    { account: 8850, debit: 3_000 * E, allocation: CC.parkingA },
    { account: 8850, debit: 3_000 * E, allocation: CC.parkingB },
    { account: 1453, credit: 3_000 * E, era: 'buyPA:0' },
    { account: 1453, credit: 3_000 * E, era: 'buyPB:0' },
  ])

  // Sale of the sold object, and the broker's invoice two weeks later.
  voucher('saleB', '2025-06-15', 0, 'Myynti Mallitie 2 B 5', [
    { account: 1910, debit: 55_000 * E },
    { account: 3990, credit: 55_000 * E, allocation: CC.sold },
    { account: 8850, debit: 60_000 * E, allocation: CC.sold },
    { account: 1441, credit: 60_000 * E, era: 'buyB:0' },
  ])
  voucher('broker', '2025-06-29', 100, 'Välityspalkkio Mallitie 2 B 5', [
    { account: 8850, debit: 1_500 * E, allocation: CC.sold },
    { account: 1910, credit: 1_500 * E },
  ])

  // Flat and parking space sold for one price (the parking space at 0): the price and the
  // cost of both items on the flat's cost centre. The broker fee comes later.
  voucher('saleDuo', '2025-09-01', 0, 'Myynti Rantapolku 5 A 3 ja AP 7', [
    { account: 1910, debit: 45_000 * E },
    { account: 3990, credit: 45_000 * E, allocation: CC.duoFlat },
    { account: 8850, debit: 42_000 * E, allocation: CC.duoFlat },
    { account: 1441, credit: 40_000 * E, era: 'buyDuoFlat:0' },
    { account: 1453, credit: 2_000 * E, era: 'buyDuoParking:0' },
  ])
  voucher('brokerDuo', '2025-09-10', 100, 'Välityspalkkio Rantapolku 5', [
    { account: 8850, debit: 1_800 * E, allocation: CC.duoFlat },
    { account: 1910, credit: 1_800 * E },
  ])

  // Office costs: a cost centre that is not a rental object.
  voucher('office', '2024-03-01', 100, 'Toimistotarvikkeet', [
    { account: 7300, debit: 50 * E, allocation: CC.office },
    { account: 1910, credit: 50 * E },
  ])

  // Not posted: a draft and a deleted voucher on the bundle must not count.
  voucher('draft', '2025-01-20', 200, 'Luonnos', [
    { account: 3760, credit: 9_999 * E, allocation: CC.bundle },
    { account: 1910, debit: 9_999 * E },
  ], 50)
  voucher('deleted', '2025-01-21', 200, 'Poistettu', [
    { account: 3760, credit: 8_888 * E, allocation: CC.bundle },
    { account: 1910, debit: 8_888 * E },
  ], 0)

  // Documents: a lease (type 800, no lines) with a PDF, and a deleted one.
  voucher('lease', '2023-02-20', 800, 'Vuokrasopimus As Oy Esimerkkikatu 1 A 1 1.3.2023-', [])
  db.run(
    "INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, data) VALUES (?, 'vuokrasopimus.pdf', NULL, 'application/pdf', ?)",
    [vouchers.lease, new TextEncoder().encode('%PDF-lease')],
  )
  voucher('leaseOld', '2023-03-20', 800, 'Vuokrasopimus As Oy Mallitie 2 B 5', [], 0)
  voucher('leaseGarage', '2024-02-01', 800, 'Vuokrasopimus autotalli Testikuja 3', [])
  db.run(
    "INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, data) VALUES (?, 'kauppakirja.pdf', NULL, 'application/pdf', ?)",
    [vouchers.buyA, new TextEncoder().encode('%PDF-deed')],
  )
  return { db, eras, vouchers }
}
