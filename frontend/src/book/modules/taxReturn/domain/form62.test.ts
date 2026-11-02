import { describe, expect, it } from 'vitest'
import { TYPE_DEPRECIATION } from '../../../vouchers'
import { ALL_NO, buildTaxFixture, check, type TaxFixture } from '../testFixture'
import { ilmoitinFile } from './ilmoitinFile'
import { omaVeroText } from './omaVeroText'
import type { TaxReturnInputs, TaxReturnView } from './types'

const BANK = 1910
const ID = '010101-0101'
const NOW = new Date(2027, 2, 4, 5, 6, 7)
const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }
const complete: Partial<TaxReturnInputs> = { shareholders: [holder], audit: 3, answers: ALL_NO }

function section(view: TaxReturnView, key: string) {
  return view.form62.sections.find((item) => item.key === key)!
}

function figures(view: TaxReturnView, key: string): Record<number, number> {
  return Object.fromEntries(section(view, key).rows.filter((row) => row.cents).map((row) => [row.code, row.cents]))
}

/** Machinery with an opening balance, a purchase this year and the year's depreciation. */
async function withMachine(year = 2026): Promise<TaxFixture> {
  const f = await buildTaxFixture(year)
  f.db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', [`${year - 1}-01-01`, `${year - 1}-12-31`, '{}'])
  f.post(`${year - 1}-06-01`, [[1179, 800_000, 0], [BANK, 0, 800_000]])
  f.post(`${year}-03-01`, [[1179, 200_000, 0], [BANK, 0, 200_000]])
  f.post(`${year}-12-31`, [[6870, 250_000, 0], [1179, 0, 250_000]], 100, TYPE_DEPRECIATION)
  return f
}

describe('from the ledger', () => {
  it('fills movable assets from the accounts in Koneet ja kalusto', async () => {
    const view = (await withMachine()).view()
    expect(figures(view, 'movable')).toEqual({ 800: 800_000, 801: 200_000, 804: 250_000, 806: 750_000, 807: 250_000 })
    expect(view.form62.used).toBe(true)
  })

  it('still shows the movements in the year the balance reaches zero', async () => {
    const f = await buildTaxFixture(2026)
    f.db.run('INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES (?, ?, ?)', ['2025-01-01', '2025-12-31', '{}'])
    f.post('2025-06-01', [[1179, 100_000, 0], [BANK, 0, 100_000]])
    f.post('2026-12-31', [[6870, 100_000, 0], [1179, 0, 100_000]], 100, TYPE_DEPRECIATION)
    const view = f.view()
    expect(figures(view, 'movable')).toEqual({ 800: 100_000, 804: 100_000, 807: 100_000 })
    expect(check(view, 'form62_tax')).toMatchObject({ state: 'ok', cents: 0 })
  })

  it('reads depreciation from a plain voucher too, when it books on a depreciation account', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-03-01', [[1179, 200_000, 0], [BANK, 0, 200_000]])
    f.post('2026-12-31', [[6870, 50_000, 0], [1179, 0, 50_000]])
    expect(figures(f.view(), 'movable')).toEqual({ 801: 200_000, 804: 50_000, 806: 150_000, 807: 50_000 })
  })

  it('counts an opening voucher as the opening balance, not an addition', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-01-01', [[1179, 100_000, 0], [2251, 0, 100_000]], 100, 9010)
    expect(figures(f.view(), 'movable')).toEqual({ 800: 100_000, 806: 100_000 })
  })

  it('shows a sale of machinery as a disposal', async () => {
    const f = await withMachine()
    f.post('2026-06-01', [[BANK, 30_000, 0], [1179, 0, 30_000]])
    expect(figures(f.view(), 'movable')).toMatchObject({ 802: 30_000, 806: 720_000 })
  })

  it('ties to the depreciation on the 6B, both columns', async () => {
    const view = (await withMachine()).view()
    expect(check(view, 'form62_tax')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'form62_book')).toMatchObject({ state: 'ok', cents: 0 })
  })

  it('stays out of a book with nothing to depreciate', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-03-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    const view = f.view()
    expect(view.form62.used).toBe(false)
    expect(check(view, 'form62_tax')).toBeUndefined()
    expect(ilmoitinFile({ ...view }, { ids: [], now: NOW }).text).not.toContain('VSY062')
  })
})

describe('where tax differs from the book', () => {
  it('follows a typed figure through the section, down to the difference', async () => {
    const f = await withMachine()
    f.inputs({ form62: { 805: 100_000 }, manual: { 365: 350_000 } })
    const view = f.view()
    expect(figures(view, 'movable')).toEqual({ 800: 800_000, 801: 200_000, 804: 250_000, 805: 100_000, 806: 650_000, 807: 250_000, 847: 100_000, 849: 100_000 })
    expect(check(view, 'form62_tax')).toMatchObject({ state: 'ok', cents: 0 })
  })

  it('shows the exact gap when the form and the 6B disagree', async () => {
    const f = await withMachine()
    f.inputs({ form62: { 805: 100_000 } })
    expect(check(f.view(), 'form62_tax')).toMatchObject({ state: 'crit', cents: 100_000 })
  })

  it('shows a smaller tax depreciation as a decrease', async () => {
    const f = await withMachine()
    f.inputs({ form62: { 804: 200_000 }, manual: { 365: 200_000 } })
    const movable = figures(f.view(), 'movable')
    expect(movable).toMatchObject({ 804: 200_000, 806: 800_000, 807: 250_000, 848: 50_000, 849: -50_000 })
  })

  it('takes a typed opening balance over the ledger', async () => {
    const f = await withMachine()
    f.inputs({ form62: { 800: 700_000 } })
    expect(figures(f.view(), 'movable')).toMatchObject({ 800: 700_000, 806: 650_000 })
  })

  it('takes reserves and buildings as typed', async () => {
    const f = await buildTaxFixture(2026)
    f.inputs({ form62: { 871: 10_000, 816: 1_000_000, 820: 40_000 } })
    const view = f.view()
    expect(figures(view, 'reserves')).toEqual({ 871: 10_000 })
    expect(figures(view, 'buildings_offices')).toEqual({ 816: 1_000_000, 820: 40_000, 822: 960_000, 853: 40_000 })
  })
})

describe("Vero's limits on regular depreciation", () => {
  it('allows 25 % of the base exactly, not a cent more', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-03-01', [[1179, 1_000_000, 0], [BANK, 0, 1_000_000]])
    f.inputs({ form62: { 804: 250_000 } })
    expect(check(f.view(), 'form62_limit')).toBeUndefined()
    f.inputs({ form62: { 804: 250_001 } })
    expect(check(f.view(), 'form62_limit')).toMatchObject({ state: 'crit', count: 1 })
  })

  it('does not check a base of at most 1 200 euros', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-03-01', [[1179, 120_000, 0], [BANK, 0, 120_000]])
    f.inputs({ form62: { 804: 120_000 } })
    expect(check(f.view(), 'form62_limit')).toBeUndefined()
  })

  it('checks 4 % on offices', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-03-01', [[1179, 100, 0], [BANK, 0, 100]])
    f.inputs({ form62: { 816: 1_000_000, 820: 40_001 } })
    expect(check(f.view(), 'form62_limit')).toMatchObject({ state: 'crit', count: 1 })
  })
})

describe('in the outputs', () => {
  it('writes the non-zero figures after the 6B', async () => {
    const f = await withMachine()
    f.post('2026-03-02', [[BANK, 2_000_000, 0], [2941, 0, 2_000_000]])
    f.inputs(complete)
    const lines = ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text.split('\r\n')
    const start = lines.indexOf('000:VSY06226')
    expect(start).toBeGreaterThan(0)
    expect(lines.slice(start + 6)).toEqual(['800:8000,00', '801:2000,00', '804:2500,00', '806:7500,00', '807:2500,00', '999:2'])
  })

  it('keeps a negative difference in the file, the one field that allows it', async () => {
    const f = await withMachine()
    f.post('2026-03-02', [[BANK, 2_000_000, 0], [2941, 0, 2_000_000]])
    f.inputs({ ...complete, form62: { 804: 200_000 }, manual: { 365: 200_000 } })
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems).toEqual([])
    expect(file.text.split('\r\n')).toContain('849:-500,00')
  })

  it('refuses another negative figure on the form', async () => {
    const f = await withMachine()
    f.inputs({ ...complete, form62: { 801: -5 } })
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems).toContainEqual({ key: 'form62_negative', row: 'Lisäykset' })
  })

  it('gives the same figures in the OmaVero text', async () => {
    const text = omaVeroText((await withMachine()).view())
    expect(text).toContain('Erittely varauksista, arvonmuutoksista ja poistoista (lomake 62)')
    expect(text).toContain('Irtain käyttöomaisuus (EVL 30 ja 31 §)')
    expect(text).toContain('Verotuksessa jäljellä oleva menojäännös verovuoden alussa: 8 000,00')
    expect(text).toContain('Säännönmukainen poisto (EVL): 2 500,00')
  })
})
