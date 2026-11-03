import { describe, expect, it } from 'vitest'
import { buildTaxFixture, type TaxFixture } from '../testFixture'
import { parseHoldingTable } from './form8a'
import { decodeTable, findRowFiles, parseDividendTable } from './rowFiles'

/** As tilari-bank-import's Nordnet year end writes them: UTF-16 with a byte order mark, tabs and CRLF. Invented rows. */
const TABLE_8A = [
  'Nimi\tY-tunnus\tLukumäärä\tHankintameno\tVertailuarvo kappaleelta',
  'TESTIRAHASTO\t0000000-0\t10\t1000,00\t77,00',
  'ESIMERKKI OYJ\t\t150\t1400,50\t5,686',
]
const TABLE_73 = [
  'Maa\tLuokka\tOsingot ja ylijäämät\tPidätetty vero',
  'Suomi\tSuomesta saadut veronalaiset osingot ja ylijäämät\t12,00\t0,00',
  'Saksa\tToisesta EU- tai ETA-valtiosta saadut veronalaiset osingot ja ylijäämät\t10,00\t2,64',
  'Ruotsi\tToisesta EU- tai ETA-valtiosta saadut veronalaiset osingot ja ylijäämät\t5,50\t1,65',
  'Yhdysvallat\tEU:n ja ETAn ulkopuolelta saadut veronalaiset osingot ja ylijäämät\t12,01\t1,80',
]

function utf16(lines: string[]): Uint8Array {
  const text = lines.map((line) => `${line}\r\n`).join('')
  const out = new Uint8Array(2 + text.length * 2)
  out.set([0xff, 0xfe])
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = code & 0xff
    out[3 + i * 2] = code >> 8
  }
  return out
}

function attach(f: TaxFixture, voucher: number, name: string, data = new Uint8Array([1])): number {
  f.db.run('INSERT INTO Liite (tosite, nimi, data) VALUES (?, ?, ?)', [voucher, name, data])
  return Number(f.db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id)
}

describe('files of form rows on a voucher', () => {
  it('finds the newest of each kind on a draft or posted voucher of the period', async () => {
    const f = await buildTaxFixture(2031)
    const older = f.post('2031-06-30', [], 100)
    attach(f, older, '8a-2031.csv')
    const yearEnd = f.post('2031-12-31', [], 50)
    attach(f, yearEnd, 'vuosiyhteenveto.pdf')
    const form8a = attach(f, yearEnd, '8a-2031.csv')
    const form73 = attach(f, yearEnd, '73-2031.csv')
    // Deleted, a template, and the next period: none of them count.
    attach(f, f.post('2031-12-31', [], 0), '8a-2031.csv')
    attach(f, f.post('2031-12-31', [], 5), '73-2031.csv')
    attach(f, f.post('2032-01-15', [], 100), '8a-2032.csv')

    expect(findRowFiles(f.db, '2031-01-01', '2031-12-31')).toEqual({
      form8a: { attachment_id: form8a, name: '8a-2031.csv', voucher_id: yearEnd, voucher_title: 'Tosite', date: '2031-12-31', posted: false },
      form73: { attachment_id: form73, name: '73-2031.csv', voucher_id: yearEnd, voucher_title: 'Tosite', date: '2031-12-31', posted: false },
    })
    expect(f.view().row_files.form8a?.attachment_id).toBe(form8a)
  })

  it('has none when no voucher of the period carries one', async () => {
    const f = await buildTaxFixture(2031)
    attach(f, f.post('2031-12-31', [], 100), '8a-2031-vanha.csv')
    expect(f.view().row_files).toEqual({ form8a: null, form73: null })
  })
})

describe('reading a file of rows', () => {
  it('decodes UTF-16 with either byte order, and UTF-8 with or without a byte order mark', () => {
    expect(decodeTable(utf16(['Åke\tÖ']))).toBe('Åke\tÖ\r\n')
    const big = utf16(['Ä'])
    for (let i = 0; i < big.length; i += 2) [big[i], big[i + 1]] = [big[i + 1]!, big[i]!]
    expect(decodeTable(big)).toBe('Ä\r\n')
    expect(decodeTable(new TextEncoder().encode('﻿Ä;1'))).toBe('Ä;1')
    expect(decodeTable(new TextEncoder().encode('Ä;1'))).toBe('Ä;1')
  })

  it('reads the 8A file like rows pasted from a spreadsheet', () => {
    const pasted = parseHoldingTable(decodeTable(utf16(TABLE_8A)), 'financial', [
      { era: null, group: 'financial', name: 'Esimerkki Oyj', business_id: '4567890-7', shares: '100', cost_cents: 1, unit_value: '', total_value_cents: null },
    ])
    expect(pasted.skipped).toEqual([])
    expect(pasted.kept_ids).toBe(1)
    expect(pasted.rows.map((row) => [row.name, row.business_id, row.shares, row.cost_cents, row.unit_value])).toEqual([
      ['TESTIRAHASTO', '0000000-0', '10', 100_000, '77,00'],
      ['ESIMERKKI OYJ', '4567890-7', '150', 140_050, '5,686'],
    ])
  })

  it('adds the 73 file up by class and lists the lines it cannot read', () => {
    const table = parseDividendTable(decodeTable(utf16([...TABLE_73, 'Norja\tJokin muu luokka\t1,00\t0,00', 'Suomi;Suomesta saadut veronalaiset osingot ja ylijäämät;3,00'])))
    expect(table.classes).toEqual({ taxable_fi: 1_500, taxable_eu: 1_550, taxable_other: 1_201 })
    expect(table.rows).toBe(5)
    expect(table.skipped).toEqual([6])
  })
})
