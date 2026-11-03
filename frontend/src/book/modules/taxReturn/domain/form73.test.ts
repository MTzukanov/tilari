import { describe, expect, it } from 'vitest'
import { ALL_NO, buildTaxFixture, check, type TaxFixture } from '../testFixture'
import { ilmoitinFile } from './ilmoitinFile'
import { sanitizeInputs } from './inputs'
import { omaVeroText } from './omaVeroText'
import type { DividendInput, Form73Input, TaxReturnInputs, TaxReturnView } from './types'

const BANK = 1910
const ID = '010101-0101'
const NOW = new Date(2027, 2, 4, 5, 6, 7)
const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }
const complete: Partial<TaxReturnInputs> = { shareholders: [holder], audit: 3, answers: ALL_NO }

const amount = (cents: number, extra: Partial<DividendInput> = {}): DividendInput => ({ cents, listed: false, ownership: '', ...extra })

/** Invented dividends of 1.000,00 on 9000, which the chart counts as taxable. */
async function withDividends(year = 2026): Promise<TaxFixture> {
  const f = await buildTaxFixture(year)
  f.post(`${year}-02-01`, [[BANK, 1_234_567, 0], [3000, 0, 1_234_567]])
  f.post(`${year}-05-01`, [[BANK, 100_000, 0], [9000, 0, 100_000]])
  return f
}

function form73Input(classes: Form73Input['classes'], company_listed: boolean | null = false): Form73Input {
  return { company_listed, classes }
}

function row(view: TaxReturnView, code: number) {
  return view.groups.flatMap((group) => group.rows).find((item) => item.code === code)!
}

describe('form 73 against the 6B', () => {
  it('is needed for dividends, and says how much is not yet split', async () => {
    const f = await withDividends()
    const view = f.view()
    expect(view.forms.find((form) => form.form === '73')).toMatchObject({ built: true, in_file: true })
    expect(check(view, 'form73_gap')).toMatchObject({ state: 'crit', cents: -100_000 })
    expect(check(view, 'form73_listed')).toMatchObject({ state: 'crit' })
    expect(check(view, 'form73_tax')).toBeUndefined()
    expect(row(view, 337)).toMatchObject({ book_cents: 100_000, tax_cents: 100_000, check: true })
  })

  it('ties when the classes add up to the ledger, to the cent', async () => {
    const f = await withDividends()
    f.inputs({ form73: form73Input({ taxable_fi: amount(60_000), taxable_eu: amount(30_000), taxable_other: amount(10_000) }) })
    const view = f.view()
    expect(check(view, 'form73_gap')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'form73_tax')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'form73_listed')).toBeUndefined()
    expect(view.form73).toMatchObject({ total_cents: 100_000, taxable_cents: 100_000, taxfree_cents: 0, ledger_cents: 100_000 })
    expect(row(view, 337).check).toBe(false)
  })

  it('shows an exact gap when the classes do not add up', async () => {
    const f = await withDividends()
    f.inputs({ form73: form73Input({ taxable_fi: amount(99_999) }) })
    expect(check(f.view(), 'form73_gap')).toMatchObject({ state: 'crit', cents: -1 })
  })

  it('takes the taxable share from its classes, as Vero says to carry it to the 6B', async () => {
    const f = await withDividends()
    f.inputs({ form73: form73Input({ taxfree_fi: amount(40_000), taxable_eu: amount(60_000) }) })
    const view = f.view()
    expect(row(view, 337)).toMatchObject({ book_cents: 100_000, tax_cents: 60_000 })
    expect(view.values[338]).toBe(60_000)
    expect(view.form73.taxfree_cents).toBe(40_000)
  })

  it('flags a typed taxable share that differs from the classes', async () => {
    const f = await withDividends()
    f.inputs({ form73: form73Input({ taxable_fi: amount(100_000) }), manual: { 338: 90_000 } })
    expect(check(f.view(), 'form73_tax')).toMatchObject({ state: 'crit', cents: -10_000 })
  })

  it('is not needed when every dividend is tax-free and from Finland, and says so when the figures disagree', async () => {
    const f = await withDividends()
    f.inputs({ answers: { ...ALL_NO, all_dividends_tax_free: true } })
    const view = f.view()
    expect(view.forms.some((form) => form.form === '73')).toBe(false)
    expect(check(view, 'tax_free_answer')).toMatchObject({ state: 'crit', cents: 100_000 })
    expect(check(view, 'form73_gap')).toBeUndefined()
  })

  it('accepts that answer for dividends booked as tax-free', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-05-01', [[BANK, 100_000, 0], [9270, 0, 100_000]])
    f.inputs({ answers: { ...ALL_NO, all_dividends_tax_free: true } })
    const view = f.view()
    expect(view.forms).toEqual([])
    expect(check(view, 'tax_free_answer')).toBeUndefined()
  })
})

describe("form 73's inputs", () => {
  it('do not carry over: each year has its own dividends', async () => {
    const f = await withDividends()
    f.inputs({ form73: form73Input({ taxable_fi: amount(100_000, { listed: true }) }, true) })
    expect(f.view('2027-12-31').inputs.form73).toEqual({ company_listed: null, classes: {} })
  })

  it('keep only known classes and drop what is not valid', () => {
    const clean = sanitizeInputs({
      form73: { company_listed: 'yes', classes: { taxable_fi: { cents: -5, listed: 'x', ownership: ' 5 ' }, made_up: { cents: 100 }, reit: { cents: 0 } } },
    })
    expect(clean.form73).toEqual({ company_listed: null, classes: { taxable_fi: { cents: 0, listed: false, ownership: '5' } } })
  })
})

describe('form 73 in both outputs', () => {
  it('writes its own record after the 6B, with the shares equal to the totals', async () => {
    const f = await withDividends()
    f.inputs({
      ...complete,
      form73: form73Input({ taxable_fi: amount(60_000, { listed: true }), taxfree_eu: amount(30_000, { ownership: '12,5' }), reit: amount(10_000) }),
    })
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems).toEqual([])
    const lines = file.text.split('\r\n')
    const record = lines.slice(lines.indexOf('000:VSY07326'))
    expect(record.slice(0, record.indexOf('999:2') + 1)).toEqual([
      '000:VSY07326',
      '048:Tilari',
      '014:1234567-1_TL',
      '198:04032027050607',
      '010:1234567-1',
      '054:01012026-31122026',
      '333:300,00',
      '945:300,00',
      '311:12,5',
      '308:1',
      '332:600,00',
      '310:600,00',
      '952:100,00',
      '953:100,00',
      '338:1000,00',
      '329:300,00',
      '327:700,00',
      '999:2',
    ])
    expect(lines).toContain('337:1000,00')
    expect(lines).toContain('338:700,00')
  })

  it('stops until the listing question has an answer, and marks a listed filer', async () => {
    const f = await withDividends()
    f.inputs({ ...complete, form73: form73Input({ taxable_fi: amount(100_000) }, null) })
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).problems).toContainEqual({ key: 'form73_listed' })
    f.inputs({ ...complete, form73: form73Input({ taxable_fi: amount(100_000) }, true) })
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text).toContain('000:VSY07326\r\n048:Tilari')
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text).toContain('\r\n300:1\r\n')
  })

  it('refuses an ownership share Vero would not take', async () => {
    const f = await withDividends()
    f.inputs({ ...complete, form73: form73Input({ taxable_other: amount(100_000, { ownership: '120' }) }) })
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).problems).toContainEqual({
      key: 'form73_ownership',
      row: 'EU:n ja ETAn ulkopuolelta saadut veronalaiset osingot ja ylijäämät',
    })
  })

  it('leaves the record out until it has amounts, and says the file is for checking only', async () => {
    const f = await withDividends()
    f.inputs(complete)
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.text).not.toContain('VSY073')
    expect(file.notices).toContainEqual({ key: 'checks' })
  })

  it("gives OmaVero's wording in the text", async () => {
    const f = await withDividends()
    f.inputs({ ...complete, form73: form73Input({ taxable_fi: amount(60_000), taxable_other: amount(40_000) }) })
    const text = omaVeroText(f.view())
    expect(text).toContain('Erittely osinkotuloista ja muista voitonjaon luonteisista eristä (lomake 73)')
    expect(text).toContain('Onko yhtiö julkisesti noteerattu? Ei')
    expect(text).toContain(
      [
        'Veronalaiset osingot ja ylijäämät (100 %)',
        'Suomesta saadut veronalaiset osingot ja ylijäämät',
        'Osingot ja ylijäämät yhteensä: 600,00',
        'Onko jakajayhtiö listattu? Ei tai jakajayhtiöitä on useita',
        'EU:n ja ETAn ulkopuolelta saadut veronalaiset osingot ja ylijäämät',
        'Osingot ja ylijäämät yhteensä: 400,00',
      ].join('\n'),
    )
    expect(text).toContain('Osinkojen ja ylijäämien veronalainen osuus yhteensä: 1 000,00')
    expect(text).not.toContain('Verovapaat osingot ja ylijäämät')
  })
})
