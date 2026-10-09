import { describe, expect, it } from 'vitest'
import { pickBest, textScorer, tokenize } from './suggest'

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
    { id: 44, name: 'As Oy Kuopion Koivikkotie 7 F 44' },
    { id: 48, name: 'As Oy Kuopion Koivikkotie 7 F 48' },
    { id: 6, name: 'As Oy Kajaanin Orvokki, Kanervakuja 7 as 6' },
    { id: 21, name: 'As Oy Kajaanin Orvokki, Kanervakuja 7 as 21' },
    { id: 45, name: 'As Oy Kajaanin Orvokki, Kanervakuja 7 AP45' },
    { id: 32, name: 'As Oy Oulun Rehtori 3, Rehtorintie 15 C 32, 90100 Oulu' },
    { id: 2, name: 'As Oy Oulun Rehtori 3, Rehtorintie 15 C 2, 90100 Oulu' },
  ]
  const score = textScorer(names)

  it('picks the unit whose number the text names', () => {
    expect(pickBest(score('Vuokrankorotus Koivikkotie 7 F 44, Kuopio 1.1.2024-')).id).toBe(44)
    expect(pickBest(score('Vuokrasopimus Koivikkotie 7 F 48 Kuopio')).id).toBe(48)
    expect(pickBest(score('Kajaani Orvokki A21 vastikelasku 1.11.2023-')).id).toBe(21)
    expect(pickBest(score('Kajaani Orvokki A6 vastikelasku 1.11.2023-')).id).toBe(6)
    expect(pickBest(score('Kauppahinta - Tekninen kirjaus - Rehtorintie 15 C 32 tase-erä')).id).toBe(32)
  })

  it('stays undecided when the text fits two units equally', () => {
    const r = pickBest(score('KAUPPAKIRJA AS OY OULUN REHTORI 3 OSAKKEET 59-97'))
    expect(r.id).toBeNull()
    expect(r.candidates.sort((a, b) => a - b)).toEqual([2, 32])
  })
})

describe('words before numbers', () => {
  const names = [
    { id: 24, name: 'As Oy Oulun Tammipuisto, Kirkkokatu 11A12' },
    { id: 3, name: 'As Oy Oulun Etelän Puutarha, Puutarhantie 1 AP6' },
    { id: 4, name: 'As Oy Oulun Etelän Puutarha, Puutarhantie 1 AP5' },
    { id: 1, name: 'As Oy Oulun Rehtori 3, Rehtorintie 15 C 32, 90100 Oulu' },
    { id: 5, name: 'As Oy Oulun Tehtaan Flora, Vaunukatu 8 AH250' },
    { id: 9, name: 'As Oy Kangasalan Tuulimylly, Tuulimyllynkatu 6 A 22' },
  ]
  const score = textScorer(names)

  it('a housing-company name beats a city plus a stray number', () => {
    expect(pickBest(score('As Oy Oulun Tammipuisto 7.2024-6.2025')).id).toBe(24)
    expect(pickBest(score('Vastikelasku Tammipuisto 1.10.24-30.6.25')).id).toBe(24)
  })

  it('a city alone never picks, even with a matching number', () => {
    const r = pickBest(score('Oulun vuokrasopimus 6 kk'))
    expect(r.id).toBeNull()
    expect(r.candidates.length).toBeGreaterThan(1)
  })

  it('month.year dates are not unit numbers', () => {
    expect(tokenize('As Oy Oulun Tammipuisto 7.2024-6.2025')).toEqual(['oulun', 'tammipuisto'])
  })
})

