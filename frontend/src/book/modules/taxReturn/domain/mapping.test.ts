import { describe, expect, it } from 'vitest'
import yritysChart from '../../../newBook/vendor/yritys.json'
import { rowByCode } from './fields6b'
import { debtTerm, isBankAccount, placeBalanceSheet, placeIncomeStatement, SALE } from './mapping'

const accounts = (yritysChart.tilit as { numero: number; tyyppi: string }[]).filter((a) => !a.tyyppi.startsWith('H'))

/** Only group accounts, deferred taxes and the owner's own choice have no field. */
const NO_FIELD = /^(899|903|169|239|298|999)/

describe('every account in the standard chart', () => {
  it('has a field that exists on the form, or is knowingly left for the owner', () => {
    const missing: number[] = []
    for (const { numero, tyyppi } of accounts) {
      const { code } = String(numero) >= '3' ? placeIncomeStatement(numero, tyyppi) : placeBalanceSheet(numero)
      if (code == null) {
        if (!NO_FIELD.test(String(numero))) missing.push(numero)
      } else if (code === SALE || !rowByCode(code)) {
        missing.push(numero)
      }
    }
    expect(missing).toEqual([])
  })

  it('never lands in a field only the owner can type', () => {
    for (const { numero, tyyppi } of accounts) {
      const { code } = String(numero) >= '3' ? placeIncomeStatement(numero, tyyppi) : placeBalanceSheet(numero)
      if (typeof code === 'number') expect(rowByCode(code)?.row.manualOnly, String(numero)).toBeFalsy()
    }
  })
})

describe('placing an account', () => {
  it.each([
    [3000, 'CL', 330],
    [3760, 'C', 336],
    [4490, 'D', 360],
    [5800, 'D', 361],
    [6100, 'D', 362],
    [6300, 'D', 363],
    [8390, 'D', 377],
    [9220, 'C', 341],
    [9260, 'C', 345],
    [9460, 'D', 387],
    [9670, 'D', 392],
  ])('%i of type %s goes by its chart heading', (account, type, code) => {
    expect(placeIncomeStatement(account, type)).toMatchObject({ code, source: 'chart' })
  })

  it('follows the account type before the heading', () => {
    expect(placeIncomeStatement(6500, 'DZ')).toMatchObject({ code: 384, source: 'type' })
    expect(placeIncomeStatement(7990, 'DH')).toMatchObject({ code: 368, source: 'type' })
    expect(placeIncomeStatement(6870, 'DP')).toMatchObject({ code: 364, source: 'type' })
    expect(placeIncomeStatement(9240, 'CZ')).toMatchObject({ code: 358, source: 'type' })
    expect(placeIncomeStatement(6880, 'DPZ')).toMatchObject({ code: 364, notInTax: true })
  })

  it('treats income tax accounts as direct taxes although their type says non-deductible', () => {
    expect(placeIncomeStatement(9930, 'DZ').code).toBe(378)
    expect(placeIncomeStatement(9940, 'DZ').code).toBe(378)
  })

  it('names the accounts whose type would mislead', () => {
    expect(placeIncomeStatement(9530, 'DZ').code).toBe(379)
    expect(placeIncomeStatement(9540, 'DZ').code).toBe(379)
    expect(placeIncomeStatement(9270, 'CZ')).toMatchObject({ code: 337, notInTax: true })
  })

  it('compares numbers as text, as Kitsas orders its chart', () => {
    expect(placeBalanceSheet(17631).code).toBe(423)
    expect(placeBalanceSheet(29391).code).toBe(458)
    expect(placeIncomeStatement(36599, 'C').code).toBe(336)
  })

  it.each([
    [1179, 403],
    [1441, 405],
    [1701, 419],
    [1849, 425],
    [1881, 424],
    [1910, 427],
    [2251, 474],
    [2261, 474],
    [2621, 452],
    [2741, 458],
    [2835, 452],
    [2871, 453],
    [2920, 458],
    [2941, 456],
    [2943, 456],
    [2949, 458],
    [2968, 457],
  ])('balance sheet account %i goes to %i', (account, code) => {
    expect(placeBalanceSheet(account).code).toBe(code)
  })

  it("lets the book's choice win over every rule", () => {
    expect(placeBalanceSheet(1441, { 1441: 430 })).toEqual({ code: 430, source: 'override' })
    expect(placeIncomeStatement(6500, 'DZ', { 6500: 377 })).toEqual({ code: 377, source: 'override' })
    expect(placeIncomeStatement(3990, 'C', { 3990: SALE })).toEqual({ code: SALE, source: 'override' })
  })

  it('knows bank accounts and the term of a debt', () => {
    expect(isBankAccount(1910)).toBe(true)
    expect(isBankAccount(1849)).toBe(false)
    expect(debtTerm(2621)).toBe('long')
    expect(debtTerm(2741)).toBe('long')
    expect(debtTerm(2835)).toBe('short')
    expect(debtTerm(2968)).toBe('short')
  })
})
