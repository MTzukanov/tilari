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
