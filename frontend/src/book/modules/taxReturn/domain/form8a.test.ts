import { describe, expect, it } from 'vitest'
import { ALL_NO, buildTaxFixture, check, type TaxFixture } from '../testFixture'
import { formatShares, parseShares, parseUnitValue } from './form8a'
import { ilmoitinFile } from './ilmoitinFile'
import { sanitizeInputs } from './inputs'
import { omaVeroText } from './omaVeroText'
import type { HoldingInput, TaxReturnInputs, TaxReturnView } from './types'

const BANK = 1910
const ID = '010101-0101'
const NOW = new Date(2027, 2, 4, 5, 6, 7)
const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }
const complete: Partial<TaxReturnInputs> = { shareholders: [holder], audit: 3, answers: ALL_NO }

const typed: HoldingInput = { era: null, group: 'financial', name: 'Esimerkki Oyj', business_id: '4567890-7', shares: '150', cost_cents: 300_000, unit_value: '21,70', total_value_cents: null }

/** A flat and its garage, both shares of one invented housing company, placed in Muu omaisuus. */
async function withFlat(year = 2031): Promise<{ f: TaxFixture; flat: number; garage: number }> {
  const f = await buildTaxFixture(year)
  const flatVoucher = f.post(`${year}-02-01`, [[1441, 5_000_000, 0, 'new'], [BANK, 0, 5_000_000]])
  const garageVoucher = f.post(`${year}-03-01`, [[1441, 300_000, 0, 'new'], [BANK, 0, 300_000]])
  f.place({ 1441: 430 })
  return { f, flat: f.lineId(flatVoucher), garage: f.lineId(garageVoucher) }
}

function group(view: TaxReturnView, key: string) {
  return view.form8a.groups.find((item) => item.key === key)!
}

describe('rows from tase-eriä', () => {
  it('gives each tase-erä a row with the ledger balance as its cost', async () => {
    const { f, flat, garage } = await withFlat()
    const other = group(f.view(), 'other')
    expect(other.rows.map((row) => [row.era, row.cost_cents])).toEqual([
      [flat, 5_000_000],
      [garage, 300_000],
    ])
    expect(other.cost_cents).toBe(5_300_000)
  })

  it('ties the costs to the 6B field to the cent', async () => {
    const { f } = await withFlat()
    expect(check(f.view(), 'form8a_gap')).toMatchObject({ state: 'ok', cents: 0, codes: [430] })
  })

  it('shows the exact gap when part of the balance has no tase-erä', async () => {
    const { f } = await withFlat()
    f.post('2031-04-01', [[1441, 1_234, 0], [BANK, 0, 1_234]])
    expect(check(f.view(), 'form8a_gap')).toMatchObject({ state: 'crit', cents: -1_234, codes: [430] })
  })

  it('takes a sale off the balance, and drops a tase-erä sold in full', async () => {
    const { f, flat, garage } = await withFlat()
    f.post('2031-06-01', [[BANK, 400_000, 0], [1441, 0, 300_000, garage], [3000, 0, 100_000]])
    f.post('2031-06-02', [[BANK, 100_000, 0], [1441, 0, 100_000, flat]])
    const other = group(f.view(), 'other')
    expect(other.rows.map((row) => [row.era, row.cost_cents])).toEqual([[flat, 4_900_000]])
  })

  it('does not take a name or business ID from the partner, who on a purchase is usually the seller', async () => {
    const f = await buildTaxFixture()
    f.db.run("INSERT INTO Kumppani (nimi, alvtunnus) VALUES ('Myyjä Oy', 'FI23456780')")
    const partner = Number(f.db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id)
    const voucher = f.post('2031-02-01', [[1441, 100_000, 0, 'new'], [BANK, 0, 100_000]])
    f.db.run('UPDATE Vienti SET kumppani = ?, selite = ? WHERE id = ?', [partner, 'Asunnon osto', f.lineId(voucher)])
    f.place({ 1441: 430 })
    expect(group(f.view(), 'other').rows[0]).toMatchObject({ name: '', business_id: '', era_text: 'Asunnon osto' })
  })

  it('leaves securities in financial assets to typed rows, since one tase-erä can hold a portfolio', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[1881, 300_000, 0, 'new'], [BANK, 0, 300_000]])
    const before = f.view()
    expect(group(before, 'financial').rows).toEqual([])
    expect(check(before, 'form8a_gap')).toMatchObject({ state: 'crit', cents: -300_000, codes: [424] })
    f.inputs({ holdings: [typed] })
    const after = f.view()
    expect(group(after, 'financial').rows[0]).toMatchObject({ name: 'Esimerkki Oyj', cost_cents: 300_000 })
    expect(check(after, 'form8a_gap')).toMatchObject({ state: 'ok', cents: 0, codes: [424] })
  })
})

describe('what the owner adds', () => {
  it('keeps what was typed on a tase-erä, but the cost stays the ledger figure', async () => {
    const { f, flat } = await withFlat()
    f.inputs({ holdings: [{ ...typed, era: flat, group: 'other', cost_cents: 1 }] })
    expect(group(f.view(), 'other').rows[0]).toMatchObject({ era: flat, name: 'Esimerkki Oyj', cost_cents: 5_000_000 })
  })

  it('works out the total value as count times unit value, rounded to the cent', async () => {
    const f = await buildTaxFixture()
    f.inputs({ holdings: [{ ...typed, shares: '3,5', unit_value: '1,235' }] })
    expect(group(f.view(), 'financial').rows[0]?.value_cents).toBe(432)
  })

  it('prefers a typed total', async () => {
    const f = await buildTaxFixture()
    f.inputs({ holdings: [{ ...typed, total_value_cents: 123_456 }] })
    expect(group(f.view(), 'financial').rows[0]?.value_cents).toBe(123_456)
  })

  it('combines rows with one business ID into one line on the form', async () => {
    const { f, flat, garage } = await withFlat()
    const row = { group: 'other' as const, name: 'As Oy Esimerkki', business_id: '2345678-0', cost_cents: 0, unit_value: '', total_value_cents: null }
    f.inputs({
      holdings: [
        { ...row, era: flat, shares: '120', total_value_cents: 400_000 },
        { ...row, era: garage, shares: '', total_value_cents: 20_000 },
      ],
    })
    const other = group(f.view(), 'other')
    expect(other.rows).toHaveLength(2)
    expect(other.lines).toEqual([{ name: 'As Oy Esimerkki', business_id: '2345678-0', shares: '120', cost_cents: 5_300_000, unit_value: '', value_cents: 420_000 }])
  })

  it('carries names, IDs and counts to the next year, not comparison values', async () => {
    const f = await buildTaxFixture()
    f.inputs({ holdings: [{ ...typed, total_value_cents: 5 }] })
    const next = f.view('2032-12-31')
    expect(next.inputs.holdings[0]).toMatchObject({ name: 'Esimerkki Oyj', business_id: '4567890-7', shares: '150', cost_cents: 300_000, unit_value: '', total_value_cents: null })
  })

  it('will not keep a personal ID in a business ID field', () => {
    const clean = sanitizeInputs({ holdings: [{ ...typed, business_id: '010101-0101', name: '010101-0101' }], sale_rows: [{ id_code: '010101A123B', name: 'As Oy' }] })
    expect(JSON.stringify(clean)).not.toMatch(/010101/)
  })
})

describe('counts and unit values', () => {
  it.each([
    ['120', 1_200_000],
    ['1,5', 15_000],
    ['1.5', 15_000],
    ['0,0001', 1],
    ['', 0],
  ])('reads the count %s', (text, scaled) => {
    expect(parseShares(text)).toBe(scaled)
  })

  it.each(['1,23456', '-1', 'x'])('refuses the count %s', (text) => {
    expect(parseShares(text)).toBeNull()
  })

  it('writes a count without trailing zeros', () => {
    expect(formatShares(1_215_000)).toBe('121,5')
    expect(formatShares(1_200_000)).toBe('120')
  })

  it('takes three decimals only under 10 euros, as Vero does', () => {
    expect(parseUnitValue('9,999')).toBe(9_999)
    expect(parseUnitValue('10,99')).toBe(10_990)
    expect(parseUnitValue('10,999')).toBeNull()
    expect(parseUnitValue('1,2345')).toBeNull()
  })
})

describe('in the outputs', () => {
  async function filled() {
    const f = await buildTaxFixture(2026)
    const voucher = f.post('2026-02-01', [[1441, 5_000_000, 0, 'new'], [BANK, 0, 5_000_000]])
    f.post('2026-02-02', [[BANK, 5_300_000, 0], [2941, 0, 5_300_000]])
    f.post('2026-02-03', [[1881, 300_000, 0], [BANK, 0, 300_000]])
    f.place({ 1441: 430 })
    f.inputs({
      ...complete,
      holdings: [
        { era: f.lineId(voucher), group: 'other', name: 'As Oy Esimerkki', business_id: '2345678-0', shares: '120,5', cost_cents: 0, unit_value: '41,50', total_value_cents: null },
        typed,
      ],
    })
    return f
  }

  it('follows the 6B in the file, numbered in sequence', async () => {
    const lines = ilmoitinFile((await filled()).view(), { ids: [ID], now: NOW }).text.split('\r\n')
    expect(lines.filter((line) => line.startsWith('000:'))).toEqual(['000:VSY06B26', '000:VSY08A26'])
    expect(lines.filter((line) => line.startsWith('999:'))).toEqual(['999:1', '999:2'])
    const start = lines.indexOf('000:VSY08A26')
    expect(lines.slice(start, start + 6)).toEqual(['000:VSY08A26', '048:Tilari', '014:1234567-1_TL', '198:04032027050607', '010:1234567-1', '054:01012026-31122026'])
    expect(lines.slice(start + 6)).toEqual([
      '001:1',
      '240:Esimerkki Oyj',
      '241:4567890-7',
      '248:150',
      '249:3000,00',
      '250:21,70',
      '251:3255,00',
      '009:1',
      '601:150',
      '559:3000,00',
      '565:3255,00',
      '001:1',
      '440:As Oy Esimerkki',
      '441:2345678-0',
      '448:120,5',
      '449:50000,00',
      '450:41,50',
      '451:5000,75',
      '009:1',
      '603:120,5',
      '604:50000,00',
      '605:5000,75',
      '489:53000,00',
      '490:8255,75',
      '999:2',
    ])
  })

  it('says the form is built, so it no longer holds the file back', async () => {
    const view = (await filled()).view()
    expect(view.forms.find((form) => form.form === '8A')).toMatchObject({ built: true, in_file: true })
    expect(ilmoitinFile(view, { ids: [ID], now: NOW }).notices).toEqual([])
  })

  it('stops the file on a missing name or a bad value, and only remarks on what Vero only remarks on', async () => {
    const f = await filled()
    const view = f.view()
    const holdings = view.inputs.holdings
    f.inputs({ ...complete, holdings: [{ ...holdings[0]!, name: '' }, { ...holdings[1]!, unit_value: '1,2345' }] })
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).problems.map((p) => p.key)).toEqual(expect.arrayContaining(['holding_name', 'holding_unit']))
    f.inputs({ ...complete, holdings: [{ ...holdings[0]!, business_id: '1234567-2' }, holdings[1]!] })
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).problems.map((p) => p.key)).toContain('holding_id')
    f.inputs({ ...complete, holdings: [{ ...holdings[0]!, business_id: '', unit_value: '' }, holdings[1]!] })
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems).toEqual([])
    expect(file.remarks).toEqual([
      { key: 'holding_no_id', count: 1 },
      { key: 'holding_no_value', count: 1 },
    ])
    expect(file.bytes).not.toBeNull()
  })

  it('gives the same rows in the OmaVero text, in its wording', async () => {
    const text = omaVeroText((await filled()).view())
    expect(text).toContain('Luettelo yhteisön omistamista arvopapereista ja arvo-osuuksista (lomake 8A)')
    expect(text).toContain('Yhtiön tai osuuskunnan nimi: As Oy Esimerkki')
    expect(text).toContain('Osakkeiden lukumäärä: 120,5')
    expect(text).toContain('Tuloverotuksessa poistamaton hankintameno: 50 000,00')
    expect(text).toContain('Vertailuarvo yhteensä: 5 000,75')
    expect(text).toContain('Muun omaisuuden hankintamenot yhteensä: 50 000,00')
    expect(text).toContain('Rahoitusomaisuuden vertailuarvot yhteensä: 3 255,00')
    expect(text).toContain('Tuloverotuksen poistamattomat hankintamenot yhteensä: 53 000,00')
  })
})
