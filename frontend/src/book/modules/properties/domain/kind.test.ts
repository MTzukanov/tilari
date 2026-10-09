import { describe, expect, it } from 'vitest'
import { kindFromName } from './kind'

describe('kindFromName', () => {
  it('reads unit designators', () => {
    expect(kindFromName('As Oy Esimerkki, Mallitie 5 AP 205, 206, 209')).toBe('parking')
    expect(kindFromName('As Oy Testipiha, Ratakatu 8 AH250')).toBe('parking')
    expect(kindFromName('As Oy Malli 2 B, Kujatie 2 B AK30')).toBe('parking')
    expect(kindFromName('Malli 2 B AK B 30')).toBe('parking')
    expect(kindFromName('As Oy Lehtola, Puistotie 7 AP46')).toBe('parking')
    expect(kindFromName('As Oy Kauppakatu 35b LH 3')).toBe('commercial')
    expect(kindFromName('Torikatu 1 LH3')).toBe('commercial')
  })

  it('reads words', () => {
    expect(kindFromName('Testikuja 3 autotalli')).toBe('garage')
    expect(kindFromName('Pysäköinti Satama P1')).toBe('parking')
    expect(kindFromName('Liiketila Kauppatie 4')).toBe('commercial')
    expect(kindFromName('Kellarin varastotila')).toBe('storage')
  })

  it('defaults to an apartment and ignores letters inside words', () => {
    expect(kindFromName('As Oy Apilatie 4 A 12')).toBe('apartment')
    expect(kindFromName('As Oy Ahotie 3 C 58')).toBe('apartment')
    expect(kindFromName('As Oy Akkukatu 1 as 6')).toBe('apartment')
    expect(kindFromName('As Oy Lhasa 1 B 2')).toBe('apartment')
  })
})
