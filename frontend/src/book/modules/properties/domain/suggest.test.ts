import { describe, expect, it } from 'vitest'
import type { CostCentre, EraRoot, EraRow, PnlRow } from './ledger'
import { pickBest, suggestEra, textScorer, tokenize } from './suggest'

describe('tokenize', () => {
  it('drops housing-company words and keeps unit designators', () => {
    expect(tokenize('As Oy Esimerkkikatu 1 A 12')).toEqual(['esimerkkikatu', '1', 'a', '12'])
    expect(tokenize('Asunto B5')).toEqual(['asunto', 'b', '5', 'b5'])
    expect(tokenize('Bostads Ab Exempelgatan')).toEqual(['exempelgatan'])
    expect(tokenize('Pysäköinti, Ä-talo')).toEqual(['pysäköinti', 'ä', 'talo'])
    expect(tokenize('Tiliote 01.01.2023 - 31.12.2023, 2024-05-01')).toEqual(['tiliote'])
  })
})

describe('textScorer and pickBest', () => {
  const names = [
    { id: 1, name: 'As Oy Rantatie 3 A 4' },
    { id: 2, name: 'As Oy Rantatie 3 B 7' },
    { id: 3, name: 'Kuusikuja 9 autotalli' },
  ]
  const score = textScorer(names)

  it('picks a clear winner and returns ties as candidates', () => {
    expect(pickBest(score('Vuokrasopimus Rantatie 3 B 7'))).toEqual({ id: 2, candidates: [2, 1] })
    expect(pickBest(score('Vastikelasku Rantatie 3'))).toEqual({ id: null, candidates: [1, 2] })
    expect(pickBest(score('Autotalli Kuusikuja'))).toEqual({ id: 3, candidates: [3] })
    expect(pickBest(score('Pankki'))).toEqual({ id: null, candidates: [] })
    // Numbers alone (here "4", "7") never make a match.
    expect(pickBest(score('Rahasto A4 / B7 osto'))).toEqual({ id: null, candidates: [] })
  })
})

describe('inflected names and unit numbers', () => {
  const names = [
    { id: 17, name: 'As Oy Kuopion Koivikkotie 3 F 17' },
    { id: 19, name: 'As Oy Kuopion Koivikkotie 3 F 19' },
    { id: 4, name: 'As Oy Kajaanin Orvokki, Kanervakuja 9 as 4' },
    { id: 13, name: 'As Oy Kajaanin Orvokki, Kanervakuja 9 as 13' },
    { id: 28, name: 'As Oy Kajaanin Orvokki, Kanervakuja 9 AP28' },
    { id: 26, name: 'As Oy Oulun Rehtori 5, Rehtorintie 4 B 26, 90100 Oulu' },
    { id: 9, name: 'As Oy Oulun Rehtori 5, Rehtorintie 4 B 9, 90100 Oulu' },
  ]
  const score = textScorer(names)

  it('picks the unit whose number the text names', () => {
    expect(pickBest(score('Vuokrankorotus Koivikkotie 3 F 17, Kuopio 1.1.2024-')).id).toBe(17)
    expect(pickBest(score('Vuokrasopimus Koivikkotie 3 F 19 Kuopio')).id).toBe(19)
    expect(pickBest(score('Kajaani Orvokki A13 vastikelasku 1.3.2023-')).id).toBe(13)
    expect(pickBest(score('Kajaani Orvokki A4 vastikelasku 1.3.2023-')).id).toBe(4)
    expect(pickBest(score('Kauppahinta - Tekninen kirjaus - Rehtorintie 4 B 26 tase-erä')).id).toBe(26)
  })

  it('stays undecided when the text fits two units equally', () => {
    const r = pickBest(score('KAUPPAKIRJA AS OY OULUN REHTORI 5 OSAKKEET 140-171'))
    expect(r.id).toBeNull()
    expect(r.candidates.sort((a, b) => a - b)).toEqual([9, 26])
  })
})

describe('words before numbers', () => {
  const names = [
    { id: 24, name: 'As Oy Oulun Tammipuisto, Kirkkokatu 6B15' },
    { id: 3, name: 'As Oy Oulun Etelän Puutarha, Puutarhantie 3 AP8' },
    { id: 4, name: 'As Oy Oulun Etelän Puutarha, Puutarhantie 3 AP7' },
    { id: 1, name: 'As Oy Oulun Rehtori 5, Rehtorintie 4 B 26, 90100 Oulu' },
    { id: 5, name: 'As Oy Oulun Tehtaan Flora, Vaunukatu 2 AH117' },
    { id: 9, name: 'As Oy Kangasalan Tuulimylly, Tuulimyllynkatu 9 A 31' },
  ]
  const score = textScorer(names)

  it('a housing-company name beats a city plus a stray number', () => {
    expect(pickBest(score('As Oy Oulun Tammipuisto 9.2023-8.2024')).id).toBe(24)
    expect(pickBest(score('Vastikelasku Tammipuisto 1.4.24-31.12.24')).id).toBe(24)
  })

  it('a city alone never picks, even with a matching number', () => {
    const r = pickBest(score('Oulun vuokrasopimus 8 kk'))
    expect(r.id).toBeNull()
    expect(r.candidates.length).toBeGreaterThan(1)
  })

  it('month.year dates are not unit numbers', () => {
    expect(tokenize('As Oy Oulun Tammipuisto 9.2023-8.2024')).toEqual(['oulun', 'tammipuisto'])
  })
})


describe('suggestEra: items sold on one voucher', () => {
  const centres: CostCentre[] = [
    { id: 80, name: 'As Oy Rantapolku 5 A 3', starts: null, ends: null, child_ids: [] },
    { id: 81, name: 'As Oy Rantapolku 5 AP 7', starts: null, ends: null, child_ids: [] },
  ]
  const root = (eraid: number, account: number, description: string): EraRoot => ({
    eraid,
    account,
    account_type: 'A',
    account_name: '',
    date: '2023-04-01',
    voucher_id: eraid,
    voucher_type: 300,
    voucher_title: description,
    description,
    allocation: 0,
  })
  const row = (id: number, eraid: number, voucher: number, signed: number): EraRow => ({
    id,
    eraid,
    account: 1441,
    date: '2023-04-01',
    voucher_id: voucher,
    voucher_type: 0,
    signed_snt: signed,
    allocation: 0,
    description: '',
  })
  const pnl = (id: number, account: number, net: number): PnlRow => ({
    id,
    date: '2025-09-01',
    voucher_id: 9,
    voucher_type: 0,
    allocation: 80,
    account,
    account_type: '',
    gross_snt: net,
    net_snt: net,
    partner_id: null,
  })
  const suggest = (flat: EraRoot, parking: EraRoot, withParking = true) =>
    [flat, parking].map((r) =>
      suggestEra(r, {
        centres,
        roots: [flat, parking],
        // Both bought on their own voucher, then credited on sale voucher 9.
        eraRows: [
          row(1, 1, 1, 40_000),
          row(2, 2, 2, 2_000),
          row(91, 1, 9, -40_000),
          ...(withParking ? [row(92, 2, 9, -2_000)] : []),
        ],
        // Price and the cost of both items, all on the flat.
        voucherPnl: new Map([[9, [pnl(93, 3990, 45_000), pnl(94, 8850, -42_000)]]]),
        scorer: textScorer(centres),
      }),
    )

  it("the item's own name decides, not the cost centre of the sale lines", () => {
    const [flat, parking] = suggest(root(1, 1441, 'Kauppahinta Rantapolku 5 A 3'), root(2, 1453, 'Autopaikka Rantapolku 5 AP 7'))
    expect(flat).toMatchObject({ cost_centre_id: 80, source: 'text' })
    expect(parking).toMatchObject({ cost_centre_id: 81, source: 'text' })
  })

  it('with nothing else to go on, the item goes with the sale lines', () => {
    const [flat, parking] = suggest(root(1, 1441, 'Kauppakirja'), root(2, 1453, 'Autopaikka'))
    expect(flat).toMatchObject({ cost_centre_id: 80, source: 'sale' })
    expect(parking).toMatchObject({ cost_centre_id: 80, source: 'sale' })
  })

  it('a voucher selling one item still decides on its own', () => {
    const [flat] = suggest(root(1, 1441, 'Kauppahinta Rantapolku 5 AP 7'), root(2, 1453, 'Autopaikka'), false)
    expect(flat).toMatchObject({ cost_centre_id: 80, source: 'sale' })
  })
})
