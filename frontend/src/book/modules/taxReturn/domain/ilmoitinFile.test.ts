import { describe, expect, it } from 'vitest'
import { buildTaxFixture } from '../testFixture'
import { ilmoitinFile } from './ilmoitinFile'
import type { TaxReturnInputs, TaxReturnView } from './types'

/** Vero's own example ID from the general description of e-filing. */
const ID = '010101-0101'
const NOW = new Date(2027, 2, 4, 5, 6, 7)

const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }
const complete: Partial<TaxReturnInputs> = { shareholders: [holder], audit: 3, statements_prepared: true }

async function simpleBook(year = 2026, inputs: Partial<TaxReturnInputs> = complete): Promise<TaxReturnView> {
  const f = await buildTaxFixture(year)
  f.post(`${year}-02-01`, [[1910, 1_234_567, 0], [3000, 0, 1_234_567]])
  f.post(`${year}-02-02`, [[7300, 100_050, 0], [1910, 0, 100_050]])
  f.inputs(inputs)
  return f.view()
}

function linesOf(text: string): string[] {
  return text.split('\r\n')
}

describe('the file format', () => {
  it('follows the name:value layout in Vero\'s illustration', async () => {
    const file = ilmoitinFile(await simpleBook(), { ids: [ID], now: NOW })
    const lines = linesOf(file.text)
    expect(lines[0]).toBe('000:VSY06B26')
    expect(lines.at(-1)).toBe('999:1')
    expect(file.text.endsWith('\n')).toBe(false)
    for (const line of lines) expect(line).toMatch(/^\d{3}:\S/)
    expect(lines).toEqual(
      expect.arrayContaining([
        '048:Tilari',
        '014:1234567-1_TL',
        '198:04032027050607',
        '010:1234567-1',
        '054:01012026-31122026',
        '041:Essi Esimerkki',
        '042:0401234567',
        '330:12345,67',
        '377:1000,50',
        '500:11345,17',
        '427:11345,17',
        '573:11345,17',
        '476:11345,17',
        '478:11345,17',
        '177:3',
        '179:1',
      ]),
    )
    expect(file.problems).toEqual([])
    expect(file.name).toBe('6B_1234567-1_2026.txt')
  })

  it('writes shareholders as a repeating group between 001 and 009', async () => {
    const file = ilmoitinFile(
      await simpleBook(2026, { ...complete, shareholders: [holder, { ...holder, name: 'Eero Esimerkki', shares: 40, loans_cents: 270 }] }),
      { ids: [ID, '111171-123X'], now: NOW },
    )
    const lines = linesOf(file.text)
    const start = lines.indexOf('001:2')
    expect(lines.slice(start, start + 9)).toEqual([
      '001:2',
      '701:Essi Esimerkki',
      '703:010101-0101',
      '570:100',
      '009:1',
      '701:Eero Esimerkki',
      '703:111171-123X',
      '570:40',
      '864:2,70',
    ])
    expect(lines[start + 9]).toBe('009:2')
  })

  it('leaves out zero fields but always gives the result and net wealth', async () => {
    const f = await buildTaxFixture(2026)
    f.inputs(complete)
    const lines = linesOf(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text)
    expect(lines).toEqual(expect.arrayContaining(['500:0,00', '573:0,00', '478:0,00']))
    expect(lines.some((line) => line.startsWith('330:'))).toBe(false)
    expect(lines.some((line) => line.endsWith(':'))).toBe(false)
  })

  it('gives both columns of a field that has them', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-02-01', [[7990, 10_001, 0], [1910, 0, 10_001]])
    f.inputs(complete)
    const lines = linesOf(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text)
    expect(lines).toEqual(expect.arrayContaining(['368:100,01', '369:50,00']))
  })

  it('writes a loss with its own field and a negative net wealth', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-02-01', [[7300, 20_000, 0], [2941, 0, 20_000]])
    f.inputs(complete)
    const lines = linesOf(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).text)
    expect(lines).toEqual(expect.arrayContaining(['505:200,00', '574:200,00']))
    expect(lines.some((line) => line.startsWith('500:'))).toBe(false)
    expect(lines.some((line) => line.startsWith('573:'))).toBe(false)
  })

  it('encodes as ISO-8859-1, one byte a character', async () => {
    const file = ilmoitinFile(await simpleBook(2026, { ...complete, shareholders: [{ ...holder, name: 'Äijä Öljy' }] }), { ids: [ID], now: NOW })
    expect(file.bytes).not.toBeNull()
    expect(file.bytes!.length).toBe(file.text.length)
    const start = file.text.indexOf('Äijä')
    expect(file.bytes![start]).toBe(0xc4)
    expect(file.bytes![start + 3]).toBe(0xe4)
  })

  it('writes the dividend decision as dates and an amount', async () => {
    const lines = linesOf(
      ilmoitinFile(await simpleBook(2026, { ...complete, dividend: { decided: '2027-03-15', payable: '2027-03-16', amount_cents: 500_000 } }), { ids: [ID], now: NOW }).text,
    )
    const start = lines.indexOf('537:15032027')
    expect(lines.slice(start - 1, start + 4)).toEqual(['001:1', '537:15032027', '538:16032027', '522:5000,00', '009:1'])
  })

  it('writes yes answers as 1 and no answers not at all', async () => {
    const lines = linesOf(ilmoitinFile(await simpleBook(2026, { ...complete, answers: { aland: true, own_shares_changed: true } }), { ids: [ID], now: NOW }).text)
    expect(lines).toEqual(expect.arrayContaining(['184:1', '586:1']))
    expect(lines.some((line) => line.startsWith('173:'))).toBe(false)
  })

  it('leaves out the field Vero added for 2026 from earlier years', async () => {
    const lines = linesOf(ilmoitinFile(await simpleBook(2025), { ids: [ID], now: NOW }).text)
    expect(lines[0]).toBe('000:VSY06B25')
    expect(lines.some((line) => line.startsWith('179:'))).toBe(false)
  })
})

describe('what stops the file', () => {
  it.each([
    ['audit', { shareholders: [holder], statements_prepared: true }, 'audit'],
    ['audit remarks', { shareholders: [holder], audit: 1 as const }, 'audit_remarks'],
    ['shareholders', { audit: 3 as const }, 'no_shareholders'],
    ['a half-filled dividend', { ...complete, dividend: { decided: '2027-03-15', payable: '', amount_cents: 1 } }, 'distribution'],
    ['an answer the file cannot carry', { ...complete, answers: { owner_housing: true } }, 'answer'],
  ])('%s', async (_name, inputs, key) => {
    const file = ilmoitinFile(await simpleBook(2026, inputs), { ids: [ID], now: NOW })
    expect(file.problems.map((p) => p.key)).toContain(key)
    expect(file.bytes).toBeNull()
  })

  it('a missing or malformed ID, naming the shareholder', async () => {
    const view = await simpleBook()
    for (const ids of [[], ['12345'], ['010101 0101']]) {
      const file = ilmoitinFile(view, { ids, now: NOW })
      expect(file.problems).toContainEqual({ key: 'shareholder_id', name: 'Essi Esimerkki' })
      expect(file.bytes).toBeNull()
    }
  })

  it("accepts Vero's dummy ID for test files", async () => {
    const file = ilmoitinFile(await simpleBook(), { ids: ['010101AUUUU'], now: NOW })
    expect(file.problems).toEqual([])
  })

  it('accepts a business ID for a company shareholder', async () => {
    const file = ilmoitinFile(await simpleBook(), { ids: ['1234567-1'], now: NOW })
    expect(file.problems).toEqual([])
  })

  it('a character outside ISO-8859-1, such as the euro sign', async () => {
    const file = ilmoitinFile(await simpleBook(2026, { ...complete, shareholders: [{ ...holder, name: 'Euro € Oy' }] }), { ids: [ID], now: NOW })
    expect(file.problems).toContainEqual({ key: 'text', code: 701 })
    expect(file.bytes).toBeNull()
  })

  it('text longer than the field takes', async () => {
    const file = ilmoitinFile(await simpleBook(2026, { ...complete, shareholders: [{ ...holder, name: 'A'.repeat(71) }] }), { ids: [ID], now: NOW })
    expect(file.problems).toContainEqual({ key: 'text', code: 701 })
  })

  it('a negative figure in a field that does not allow one', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-02-01', [[2943, 500, 0], [1910, 0, 500]])
    f.inputs(complete)
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.problems).toContainEqual({ key: 'negative', code: 456 })
    expect(file.bytes).toBeNull()
  })

  it('missing contact details', async () => {
    const f = await buildTaxFixture(2026)
    f.db.run("DELETE FROM Asetus WHERE avain IN ('VeroYhteysHenkilo', 'VeroYhteysPuhelin')")
    f.inputs(complete)
    const keys = ilmoitinFile(f.view(), { ids: [ID], now: NOW }).problems.map((p) => p.key)
    expect(keys).toEqual(expect.arrayContaining(['contact_name', 'contact_phone']))
  })
})

describe('what says the file is not ready to send, while it can still be checked', () => {
  it('a form that belongs in the same file and is not built yet', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-02-01', [[1881, 10_000, 0], [2941, 0, 10_000]])
    f.inputs(complete)
    const file = ilmoitinFile(f.view(), { ids: [ID], now: NOW })
    expect(file.notices).toContainEqual({ key: 'form', form: '8A' })
    expect(file.bytes).not.toBeNull()
  })

  it('not a separate annual return', async () => {
    const file = ilmoitinFile(await simpleBook(2026, { ...complete, dividend: { decided: '2027-03-15', payable: '2027-03-16', amount_cents: 500 } }), { ids: [ID], now: NOW })
    expect(file.notices).toEqual([])
  })

  it('a reconciliation to fix', async () => {
    const f = await buildTaxFixture(2026)
    f.post('2026-02-01', [[9990, 500, 0], [1910, 0, 500]])
    f.inputs(complete)
    expect(ilmoitinFile(f.view(), { ids: [ID], now: NOW }).notices).toContainEqual({ key: 'checks' })
  })

  it('a year the record description was not checked for', async () => {
    const file = ilmoitinFile(await simpleBook(2031), { ids: [ID], now: NOW })
    expect(file.notices).toContainEqual({ key: 'spec_year', year: 2031 })
  })

  it('nothing, once everything is in place', async () => {
    const file = ilmoitinFile(await simpleBook(), { ids: [ID], now: NOW })
    expect(file.problems).toEqual([])
    expect(file.notices).toEqual([])
  })
})
