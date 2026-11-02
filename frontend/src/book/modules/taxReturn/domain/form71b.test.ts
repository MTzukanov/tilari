import { describe, expect, it } from 'vitest'
import { ALL_NO, buildTaxFixture, check, type TaxFixture } from '../testFixture'
import { ilmoitinFile } from './ilmoitinFile'
import { SALE } from './mapping'
import { omaVeroText } from './omaVeroText'
import type { SaleInput, TaxReturnInputs } from './types'

const BANK = 1910
const ID = '010101-0101'
const NOW = new Date(2027, 2, 4, 5, 6, 7)
const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }
const complete: Partial<TaxReturnInputs> = { shareholders: [holder], audit: 3, answers: ALL_NO }

const row: SaleInput = {
  voucher: null,
  id_type: 1,
  name: 'As Oy Esimerkki',
  id_code: '2345678-0',
  apartment: 'A1',
  acquired: '2020-03-02',
  sold: '2026-05-01',
  share_after: '0',
  price_cents: 1_000_000,
  cost_cents: 900_000,
  expenses_cents: 25_000,
}

/** A flat bought earlier and sold this year, as its voucher books it: price, booked cost, and the tase-erä credited. */
async function withSale(year = 2026): Promise<{ f: TaxFixture; sale: number }> {
  const f = await buildTaxFixture(year)
  f.db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [`${year - 1}-01-01`, `${year - 1}-12-31`, '{}'])
  f.addAccount(3991, 'C', 'Luovutushinnat')
  f.addAccount(7316, 'D', 'Luovutettujen hankintamenot')
  const bought = f.post(`${year - 1}-03-02`, [[1441, 900_000, 0, 'new'], [BANK, 0, 900_000]])
  const era = f.lineId(bought)
  const sale = f.post(`${year}-05-01`, [[BANK, 1_000_000, 0], [3991, 0, 1_000_000], [7316, 900_000, 0], [1441, 0, 900_000, era]])
  f.place({ 3991: SALE, 7316: SALE, 1441: 430 })
  return { f, sale }
}

describe('suggestions from sale vouchers', () => {
  it('offers a row with price, cost and dates from the ledger', async () => {
    const { f, sale } = await withSale()
    const { form71b } = f.view()
    expect(form71b.saved).toBe(false)
    expect(form71b.rows).toHaveLength(1)
    expect(form71b.rows[0]).toMatchObject({ voucher: sale, price_cents: 1_000_000, cost_cents: 900_000, expenses_cents: 0, acquired: '2025-03-02', sold: '2026-05-01', result_cents: 100_000 })
  })

  it('counts the suggestion in the 6B, tied to the sale accounts', async () => {
    const { f } = await withSale()
    const view = f.view()
    expect(view.values[261]).toBe(100_000)
    expect(check(view, 'sale_gap')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'sale_split')).toBeUndefined()
  })

  it('takes costs on several tase-eriä sold on one voucher into one row', async () => {
    const f = await buildTaxFixture(2026)
    f.addAccount(3991, 'C', 'Luovutushinnat')
    f.addAccount(7316, 'D', 'Luovutettujen hankintamenot')
    const flat = f.post('2026-01-02', [[1441, 900_000, 0, 'new'], [BANK, 0, 900_000]])
    const garage = f.post('2026-01-03', [[1441, 50_000, 0, 'new'], [BANK, 0, 50_000]])
    f.post('2026-05-01', [[BANK, 1_000_000, 0], [3991, 0, 1_000_000], [7316, 950_000, 0], [1441, 0, 900_000, f.lineId(flat)], [1441, 0, 50_000, f.lineId(garage)]])
    f.place({ 3991: SALE, 7316: SALE })
    expect(f.view().form71b.rows).toEqual([expect.objectContaining({ price_cents: 1_000_000, cost_cents: 950_000, result_cents: 50_000 })])
  })

  it('leaves a voucher that sells nothing out, and shows it as the exact gap', async () => {
    const { f } = await withSale()
    f.post('2026-05-20', [[7316, 25_000, 0], [BANK, 0, 25_000]])
    const view = f.view()
    expect(view.form71b.rows).toHaveLength(1)
    expect(check(view, 'sale_gap')).toMatchObject({ state: 'crit', cents: 25_000 })
    // Suggested rows that do not tie leave the form's figures as the ledger has them.
    expect(view.values[261]).toBe(75_000)
    expect(check(view, 'result_ties')?.state).toBe('ok')
    f.inputs({ sale_rows: [{ ...view.form71b.rows[0]!, expenses_cents: 25_000 }] })
    expect(check(f.view(), 'sale_gap')).toMatchObject({ state: 'ok', cents: 0 })
  })

  it('reports a gap on saved rows once, as itself', async () => {
    const { f } = await withSale()
    const [suggested] = f.view().form71b.rows
    f.inputs({ sale_rows: [{ ...suggested!, cost_cents: 850_000 }] })
    const view = f.view()
    expect(view.values[261]).toBe(150_000)
    expect(check(view, 'sale_gap')).toMatchObject({ state: 'crit', cents: 50_000 })
    expect(check(view, 'result_ties')?.state).toBe('ok')
    expect(check(view, 'estimate')?.state).toBe('ok')
  })

  it('does not put a removed row back, but lists the voucher as one to add', async () => {
    const { f, sale } = await withSale()
    f.inputs({ sale_rows: [] })
    const { form71b } = f.view()
    expect(form71b.saved).toBe(true)
    expect(form71b.rows).toEqual([])
    expect(form71b.suggestions.map((item) => item.voucher)).toEqual([sale])
  })

  it('needs sale accounts to be marked before it suggests anything', async () => {
    const f = await buildTaxFixture(2026)
    const flat = f.post('2026-01-02', [[1441, 900_000, 0, 'new'], [BANK, 0, 900_000]])
    f.post('2026-05-01', [[BANK, 950_000, 0], [1441, 0, 900_000, f.lineId(flat)], [3000, 0, 50_000]])
    expect(f.view().form71b.rows).toEqual([])
  })
})

describe('in the outputs', () => {
  it('writes gains with their total and summary, following the 6B', async () => {
    const f = await buildTaxFixture(2026)
    f.inputs({ ...complete, sale_rows: [row, { ...row, id_type: 2, name: 'Kiinteistö', id_code: '91-404-1-1', apartment: '', price_cents: 500_000, cost_cents: 100_000, expenses_cents: 0 }] })
    const lines = ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text.split('\r\n')
    const start = lines.indexOf('000:VSY71B26')
    expect(lines.slice(start + 6)).toEqual([
      '001:2',
      '156:1',
      '760:As Oy Esimerkki',
      '761:2345678-0',
      '762:A1',
      '763:02032020',
      '764:01052026',
      '765:0',
      '766:10000,00',
      '767:9000,00',
      '768:250,00',
      '769:750,00',
      '009:1',
      '156:2',
      '760:Kiinteistö',
      '761:91-404-1-1',
      '763:02032020',
      '764:01052026',
      '765:0',
      '766:5000,00',
      '767:1000,00',
      '768:0,00',
      '769:4000,00',
      '009:2',
      '820:4750,00',
      '781:4750,00',
      '784:4750,00',
      '999:2',
    ])
  })

  it('writes a loss in the section for losses deductible in full', async () => {
    const f = await buildTaxFixture(2026)
    f.inputs({ ...complete, sale_rows: [{ ...row, price_cents: 800_000 }] })
    const view = f.view()
    expect(view.values[270]).toBe(125_000)
    expect(view.values[271]).toBe(125_000)
    const lines = ilmoitinFile(view, { ids: [ID], now: NOW }).text.split('\r\n')
    const start = lines.indexOf('000:VSY71B26')
    expect(lines.slice(start + 6)).toEqual([
      '001:1',
      '830:1',
      '831:As Oy Esimerkki',
      '832:2345678-0',
      '833:8000,00',
      '834:9000,00',
      '835:250,00',
      '836:1250,00',
      '009:1',
      '822:1250,00',
      '999:2',
    ])
  })

  it.each([
    ['a missing name', { name: '' }, 'sale_fields'],
    ['a missing date', { acquired: '' }, 'sale_fields'],
    ['a business ID that does not check out', { id_code: '1234567-2' }, 'sale_id'],
    ['a country code that is not one', { id_type: 3 as const, id_code: 'Suomi' }, 'sale_id'],
    ['an ownership share over 100', { share_after: '101' }, 'sale_share'],
    ['an empty ownership share', { share_after: '' }, 'sale_share'],
  ])('stops the file on %s', async (_name, change, key) => {
    const f = await buildTaxFixture(2026)
    f.inputs({ ...complete, sale_rows: [{ ...row, ...change }] })
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems.map((p) => p.key)).toContain(key)
    expect(file.bytes).toBeNull()
  })

  it('calls the form built for other assets, and not when fixed-asset shares are in the figures', async () => {
    const { f } = await withSale()
    expect(f.view().forms.find((form) => form.form === '71B')?.built).toBe(true)
    f.inputs({ manual: { 372: 5_000 } })
    expect(f.view().forms.find((form) => form.form === '71B')?.built).toBe(false)
  })

  it('gives the same rows in the OmaVero text, in its wording', async () => {
    const f = await buildTaxFixture(2026)
    f.inputs({ sale_rows: [row] })
    const text = omaVeroText(f.view())
    expect(text).toContain('Veronalaiset luovutusvoitot ja verotuksessa vähennyskelpoiset luovutustappiot (lomake 71B)')
    expect(text).toContain('Luovutetun kohteen nimi: As Oy Esimerkki')
    expect(text).toContain('Hankinta-aika: 02.03.2020')
    expect(text).toContain('Luovutushinta tai todennäköinen luovutushinta: 10 000,00')
    expect(text).toContain('Voiton hankkimisesta aiheutuneet menot: 250,00')
    expect(text).toContain('Veronalainen luovutusvoitto: 750,00')
    expect(text).toContain('Veronalaiset luovutusvoitot yhteensä: 750,00')
  })
})
