import { describe, expect, it } from 'vitest'
import { TYPE_INCOME_TAX } from '../../../vouchers'
import { buildTaxFixture, check } from '../testFixture'
import { sanitizeInputs } from './inputs'
import { SALE } from './mapping'

const BANK = 1910

describe("Vero's worked examples", () => {
  it('profit: [20.000 + 1.500 + 250] - [1.500 + 7.000 + 3.000] = 10.250', async () => {
    const f = await buildTaxFixture()
    f.post('2031-03-01', [[BANK, 2_000_000, 0], [3000, 0, 2_000_000]])
    f.post('2031-03-02', [[BANK, 150_000, 0], [3760, 0, 150_000]])
    f.post('2031-03-03', [[BANK, 25_000, 0], [9220, 0, 25_000]])
    f.post('2031-04-01', [[4000, 150_000, 0], [BANK, 0, 150_000]])
    f.post('2031-04-02', [[5800, 700_000, 0], [BANK, 0, 700_000]])
    f.post('2031-04-03', [[7300, 300_000, 0], [BANK, 0, 300_000]])
    const { values } = f.view()
    expect(values[354]).toBe(2_175_000)
    expect(values[397]).toBe(1_150_000)
    expect(values[500]).toBe(1_025_000)
    expect(values[505]).toBe(0)
  })

  it('loss: -3.750, of which 1.000 is not confirmed, leaves 2.750', async () => {
    const f = await buildTaxFixture()
    f.post('2031-03-01', [[BANK, 1_175_000, 0], [3000, 0, 1_000_000], [3760, 0, 150_000], [9220, 0, 25_000]])
    f.post('2031-04-01', [[7300, 1_550_000, 0], [BANK, 0, 1_550_000]])
    f.inputs({ manual: { 504: 100_000 } })
    const { values } = f.view()
    expect(values[500]).toBe(0)
    expect(values[504]).toBe(100_000)
    expect(values[505]).toBe(275_000)
  })

  it('drops the loss exclusion when there is a profit, as Vero forbids both', async () => {
    const f = await buildTaxFixture()
    f.post('2031-03-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    f.inputs({ manual: { 504: 5_000 } })
    const { values } = f.view()
    expect(values[500]).toBe(100_000)
    expect(values[504]).toBeUndefined()
  })
})

describe('what the form says against the book', () => {
  it('ties to the cent with non-deductible and tax-free items', async () => {
    const f = await buildTaxFixture()
    // An owner can mark any cost non-deductible through its account type.
    f.db.run("UPDATE Tili SET tyyppi = 'DZ' WHERE numero = 6500")
    f.post('2031-02-01', [[BANK, 500_001, 0], [3000, 0, 500_001]])
    f.post('2031-02-02', [[BANK, 384, 0], [9240, 0, 384]])
    f.post('2031-02-03', [[7990, 20_001, 0], [BANK, 0, 20_001]])
    f.post('2031-02-04', [[6500, 7_777, 0], [BANK, 0, 7_777]])
    f.post('2031-02-05', [[9540, 3_000, 0], [BANK, 0, 3_000]])
    f.post('2031-12-31', [[9940, 91_000, 0], [2968, 0, 91_000]], 100, TYPE_INCOME_TAX)
    const view = f.view()
    expect(view.values[358]).toBe(384)
    expect(view.values[368]).toBe(20_001)
    expect(view.values[369]).toBe(10_000)
    expect(view.values[384]).toBe(7_777)
    expect(view.values[379]).toBe(3_000)
    expect(view.values[378]).toBe(91_000)
    expect(view.values[500]).toBe(500_001 - 10_000)
    expect(check(view, 'result_ties')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'net_wealth')).toMatchObject({ state: 'ok', cents: 0 })
    expect(view.values[476]).toBe(500_001 + 384 - 20_001 - 7_777 - 3_000 - 91_000)
  })

  it('shows an unplaced account, and the exact gap it leaves', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    f.post('2031-02-02', [[9990, 1_234, 0], [BANK, 0, 1_234]])
    const view = f.view()
    expect(view.unplaced.map((a) => a.account)).toEqual([9990])
    expect(check(view, 'unplaced')?.state).toBe('crit')
    expect(check(view, 'result_ties')).toMatchObject({ state: 'crit', cents: 1_234 })

    f.place({ 9990: 384 })
    const placed = f.view()
    expect(placed.unplaced).toEqual([])
    expect(placed.values[384]).toBe(1_234)
    expect(check(placed, 'result_ties')).toMatchObject({ state: 'ok', cents: 0 })
  })

  it('asks to confirm an account outside the standard chart until the owner picks its field', async () => {
    const f = await buildTaxFixture()
    f.addAccount(9288, 'C', 'Oma tuottotili')
    f.post('2031-02-01', [[BANK, 5_000, 0], [9288, 0, 5_000]])
    const guessed = f.view()
    expect(guessed.values[345]).toBe(5_000)
    expect(check(guessed, 'custom_accounts')).toMatchObject({ state: 'warn', count: 1 })

    f.place({ 9288: 344 })
    const confirmed = f.view()
    expect(confirmed.values[345]).toBe(0)
    expect(confirmed.values[344]).toBe(5_000)
    expect(check(confirmed, 'custom_accounts')).toBeUndefined()
  })

  it('compares the result with the income tax estimate to the cent', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    expect(check(f.view(), 'estimate')).toMatchObject({ state: 'ok', cents: 0 })
    f.inputs({ manual: { 377: 2_500 } })
    expect(check(f.view(), 'estimate')).toMatchObject({ state: 'warn', cents: -2_500 })
  })

  it('keeps a typed tax figure beside the book figure, and says it was typed', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    f.post('2031-02-02', [[6870, 8_000, 0], [1179, 0, 8_000]])
    expect(f.view().values[365]).toBe(8_000)
    expect(check(f.view(), 'to_check')?.codes).toEqual([364])

    f.inputs({ manual: { 365: 6_000 } })
    const view = f.view()
    expect(view.values[364]).toBe(8_000)
    expect(view.values[365]).toBe(6_000)
    expect(view.values[500]).toBe(94_000)
    expect(view.groups.flatMap((g) => g.rows).find((r) => r.code === 364)?.state).toBe('manual')
    expect(check(view, 'manual')?.codes).toEqual([365])
  })
})

describe('sales of other assets', () => {
  async function withSale() {
    const f = await buildTaxFixture()
    f.addAccount(3991, 'C', 'Luovutushinnat')
    f.addAccount(7316, 'D', 'Luovutettujen hankintamenot')
    f.post('2031-05-01', [[BANK, 1_000_000, 0], [3991, 0, 1_000_000]])
    f.post('2031-05-01', [[7316, 900_000, 0], [1441, 0, 900_000]])
    f.place({ 3991: SALE, 7316: SALE })
    return f
  }

  it('puts the net in one field and asks for the 71B rows', async () => {
    const f = await withSale()
    const view = f.view()
    expect(view.values[261]).toBe(100_000)
    expect(view.values[270]).toBe(0)
    expect(check(view, 'sale_split')).toMatchObject({ state: 'warn', cents: 100_000 })
    expect(check(view, 'result_ties')?.state).toBe('ok')
  })

  it('takes gains and losses from the rows when they match the books exactly', async () => {
    const f = await withSale()
    f.inputs({ sales: { gains_cents: 130_000, losses_cents: 30_000 } })
    const view = f.view()
    expect(view.values[261]).toBe(130_000)
    expect(view.values[270]).toBe(30_000)
    expect(view.values[271]).toBe(30_000)
    expect(check(view, 'sale_gap')).toMatchObject({ state: 'ok', cents: 0 })
    expect(check(view, 'result_ties')?.state).toBe('ok')
  })

  it('shows the exact gap when they do not', async () => {
    const f = await withSale()
    f.inputs({ sales: { gains_cents: 130_000, losses_cents: 29_999 } })
    expect(check(f.view(), 'sale_gap')).toMatchObject({ state: 'crit', cents: 1 })
  })
})

describe('the balance sheet', () => {
  it('moves a credit balance on a bank account to loans, as a short-term debt', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[7300, 40_000, 0], [BANK, 0, 40_000]])
    const view = f.view()
    expect(view.values[427]).toBe(0)
    expect(view.values[452]).toBe(40_000)
    expect(view.values[461]).toBe(40_000)
    expect(view.values[462]).toBe(0)
    const line = view.groups.flatMap((g) => g.rows).find((r) => r.code === 452)?.accounts[0]
    expect(line).toMatchObject({ account: BANK, source: 'moved' })
    expect(check(view, 'negative')).toBeUndefined()
  })

  it('splits debts into long and short term by the chart', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 300_000, 0], [2621, 0, 200_000], [2835, 0, 60_000], [2941, 0, 40_000]])
    const { values } = f.view()
    expect(values[452]).toBe(260_000)
    expect(values[456]).toBe(40_000)
    expect(values[460]).toBe(300_000)
    expect(values[462]).toBe(200_000)
    expect(values[461]).toBe(100_000)
  })

  it('flags a debit balance on a debt, which the form does not allow', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[2943, 500, 0], [BANK, 0, 500]])
    const view = f.view()
    expect(view.values[456]).toBe(-500)
    expect(check(view, 'negative')).toMatchObject({ state: 'crit', codes: [456] })
  })

  it("carries earlier results and dividends into the next year's opening profit", async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    f.post('2032-06-01', [[2261, 30_000, 0], [2943, 0, 30_000]])
    f.post('2032-07-01', [[BANK, 5_000, 0], [3000, 0, 5_000]])
    const view = f.view('2032-12-31')
    expect(view.values[474]).toBe(70_000)
    expect(view.values[476]).toBe(5_000)
    expect(view.values[478]).toBe(75_000)
    expect(check(view, 'net_wealth')).toMatchObject({ state: 'ok', cents: 0 })
    const row = view.groups.flatMap((g) => g.rows).find((r) => r.code === 474)
    expect(row?.prior_results_cents).toBe(100_000)
  })

  it('shows earlier losses in their own field', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[7300, 20_000, 0], [BANK, 0, 20_000]])
    const view = f.view('2032-12-31')
    expect(view.values[474]).toBe(0)
    expect(view.values[475]).toBe(20_000)
    expect(view.values[478]).toBe(-20_000)
    expect(view.values[574]).toBe(20_000)
    expect(view.values[573]).toBe(0)
  })
})

describe('warnings', () => {
  it('counts drafts and leaves them out', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    f.post('2031-03-01', [[BANK, 99_999, 0], [3000, 0, 99_999]], 50)
    const view = f.view()
    expect(view.values[330]).toBe(100_000)
    expect(check(view, 'drafts')).toMatchObject({ state: 'warn', count: 1 })
  })

  it('says when the period has not ended, and only then', async () => {
    const f = await buildTaxFixture()
    expect(check(f.view(f.ends, '2031-06-01'), 'not_ended')?.state).toBe('warn')
    expect(check(f.view(f.ends, '2032-01-01'), 'not_ended')).toBeUndefined()
  })

  it('asks for income tax only when there is a profit and no tax voucher', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    expect(check(f.view(), 'income_tax')?.state).toBe('warn')
    f.post('2031-12-31', [[9940, 20_000, 0], [2968, 0, 20_000]], 100, TYPE_INCOME_TAX)
    expect(check(f.view(), 'income_tax')).toBeUndefined()
  })

  it('notices a dividend booked after the year end while the decision is not filled in', async () => {
    const f = await buildTaxFixture()
    f.post('2032-06-01', [[2261, 30_000, 0], [2943, 0, 30_000]])
    expect(check(f.view(), 'dividend_answer')).toMatchObject({ state: 'warn', cents: 30_000, date: '2032-06-01' })
    f.inputs({ dividend: { decided: '2032-06-01', payable: '2032-06-02', amount_cents: 30_000 } })
    expect(check(f.view(), 'dividend_answer')).toBeUndefined()
  })
})

describe('forms the figures call for', () => {
  it('follows Vero notices in the record description', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[1881, 10_000, 0], [BANK, 0, 10_000]])
    f.post('2031-02-02', [[1441, 10_000, 0], [BANK, 0, 10_000]])
    f.post('2031-02-03', [[1179, 10_000, 0], [BANK, 0, 10_000]])
    f.post('2031-02-04', [[BANK, 500, 0], [9000, 0, 500]])
    f.inputs({
      dividend: { decided: '2032-06-01', payable: '2032-06-02', amount_cents: 100 },
      answers: { form_70: true },
    })
    const forms = f.view().forms
    expect(forms.map((form) => form.form).sort()).toEqual(['62', '70', '73', '7812', '8A'])
    expect(forms.find((form) => form.form === '7812')?.in_file).toBe(false)
    expect(forms.find((form) => form.form === '8A')?.in_file).toBe(true)
  })

  it('needs none for a book with no such figures', async () => {
    const f = await buildTaxFixture()
    f.post('2031-02-01', [[BANK, 100_000, 0], [3000, 0, 100_000]])
    expect(f.view().forms).toEqual([])
  })
})

describe("the owner's inputs", () => {
  const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 1_000, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }

  it('carries answers and share counts to a later period, not payments or figures', async () => {
    const f = await buildTaxFixture()
    f.inputs({ contact_email: 'essi@example.com', shareholders: [holder], own_shares: 3, answers: { ifrs: true }, audit: 1, manual: { 377: 5 }, dividend: { decided: '2032-06-01', payable: '2032-06-02', amount_cents: 1 } })
    const next = f.view('2032-12-31')
    expect(next.saved).toBe(false)
    expect(next.carried_from).toBe('2031-12-31')
    expect(next.inputs.shareholders).toEqual([{ ...holder, rents_cents: 0 }])
    expect(next.inputs).toMatchObject({ contact_email: 'essi@example.com', own_shares: 3, answers: { ifrs: true }, audit: null, dividend: null, manual: {} })
  })

  it('uses the book\'s tax contact until the owner types another, and never changes the book\'s', async () => {
    const f = await buildTaxFixture()
    expect(f.view().company).toMatchObject({ contact_name: 'Essi Esimerkki', contact_phone: '0401234567' })
    f.inputs({ contact_name: 'Eero Esimerkki', contact_phone: '0507654321' })
    expect(f.view().company).toMatchObject({ contact_name: 'Eero Esimerkki', contact_phone: '0507654321' })
    const stored = f.db.get<{ arvo: string }>("SELECT arvo FROM Asetus WHERE avain = 'VeroYhteysHenkilo'")
    expect(stored?.arvo).toBe('Essi Esimerkki')
  })

  it('prefers what was saved for the period itself', async () => {
    const f = await buildTaxFixture()
    f.inputs({ own_shares: 3 })
    f.inputs({ own_shares: 7 }, '2032-12-31')
    const view = f.view('2032-12-31')
    expect(view.inputs.own_shares).toBe(7)
    expect(view.saved).toBe(true)
    expect(view.carried_from).toBeNull()
  })

  it('keeps a personal ID out of what is saved, whatever arrives', () => {
    const clean = sanitizeInputs({ shareholders: [{ ...holder, id: '010101-0101', hetu: '010101-0101' }], id: '010101-0101' })
    expect(JSON.stringify(clean)).not.toContain('010101-0101')
    expect(clean.shareholders[0]).toEqual(holder)
  })

  it('drops what is not valid rather than saving it', () => {
    const clean = sanitizeInputs({ audit: 9, manual: { abc: 5, 377: 1.5, 378: 100 }, shareholders: [{ name: ' ' }], own_shares: -2, answers: { ifrs: 'yes', aland: true } })
    expect(clean).toMatchObject({ audit: null, manual: { 378: 100 }, shareholders: [], own_shares: 0, answers: { aland: true } })
    expect(Object.keys(clean.answers)).toEqual(['aland'])
  })

  it('removes an account choice when it goes back to the rules', async () => {
    const f = await buildTaxFixture()
    f.place({ 1441: 430 })
    expect(f.view().overrides).toEqual({ 1441: 430 })
    f.place({ 1441: null })
    expect(f.view().overrides).toEqual({})
  })
})
