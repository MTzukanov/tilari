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
    expect(pickBest(score('Vuokrasopimus Rantatie 3 B 7'))).toEqual({ id: 2, candidates: [2] })
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
