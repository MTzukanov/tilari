import { describe, expect, it } from 'vitest'
import { buildTaxFixture } from '../testFixture'
import { ilmoitinFile } from './ilmoitinFile'
import { omaVeroText, plainAmount, typedAmount } from './omaVeroText'

const holder = { name: 'Essi Esimerkki', shares: 100, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }

async function book() {
  const f = await buildTaxFixture()
  f.post('2031-02-01', [[1910, 1_234_567, 0], [3000, 0, 1_234_567]])
  f.post('2031-02-02', [[7990, 10_001, 0], [1910, 0, 10_001]])
  return f
}

describe('amounts', () => {
  it('reads with plain spaces and a plain minus', () => {
    expect(plainAmount(123_456_789)).toBe('1 234 567,89')
    expect(plainAmount(-500)).toBe('-5,00')
  })

  it('types without thousands separators', () => {
    expect(typedAmount(123_456_789)).toBe('1234567,89')
    expect(typedAmount(-5)).toBe('-0,05')
    expect(typedAmount(0)).toBe('0,00')
  })
})

describe('the text for filling OmaVero by hand', () => {
  it("uses OmaVero's wording, in its order, without the file's codes", async () => {
    const f = await book()
    f.inputs({ shareholders: [holder], audit: 3 })
    const text = omaVeroText(f.view())
    expect(text).toContain('Esimerkki Oy, 1234567-1')
    expect(text).toContain('Tilikausi 01.01.2031 - 31.12.2031')
    expect(text).toContain('Liikevaihto: 12 345,67')
    expect(text).toContain('Edustuskulut: Kirjanpito 100,01, Verotus 50,00')
    expect(text).toContain('Elinkeinotoiminnan tulos: 12 295,67')
    expect(text).toContain('Valitse, onko tilintarkastus tehty: Ei, tilintarkastaja on jätetty valitsematta.')
    expect(text.indexOf('Liikevaihto')).toBeLessThan(text.indexOf('Edustuskulut'))
    expect(text.indexOf('Edustuskulut')).toBeLessThan(text.indexOf('Pankkisaamiset'))
    expect(text).not.toMatch(/\b(330|368|500)\b/)
  })

  it('never holds a personal ID, and says to fill it in', async () => {
    const f = await book()
    f.inputs({ shareholders: [holder] })
    const text = omaVeroText(f.view())
    expect(text).toContain('Henkilötunnus tai Y-tunnus: täytä itse')
    expect(text).toContain('Osakkeiden lukumäärä: 100')
  })

  it('leaves out zero rows and says what the rest are', async () => {
    const f = await book()
    const text = omaVeroText(f.view())
    expect(text).not.toContain('Leasingmaksut')
    expect(text).toContain('Kaikki muut rahakentät: 0,00')
  })

  it('marks what was typed and what to check', async () => {
    const f = await book()
    f.post('2031-03-01', [[6870, 8_000, 0], [1179, 0, 8_000]])
    expect(omaVeroText(f.view())).toContain('Vähennettävät poistot: Kirjanpito 80,00, Verotus 80,00 (tarkista)')
    f.inputs({ manual: { 365: 6_000 } })
    expect(omaVeroText(f.view())).toContain('Vähennettävät poistot: Kirjanpito 80,00, Verotus 60,00 (käsin)')
  })

  it('gives every yes/no question, with no as the default', async () => {
    const f = await book()
    f.inputs({ answers: { aland: true } })
    const text = omaVeroText(f.view())
    expect(text).toContain('Onko yhtiöllä toimintaa sekä Manner-Suomessa että Ahvenanmaalla? Kyllä')
    expect(text).toContain('Onko yhtiöllä kiinteä toimipaikka ulkomailla (lomake 75)? Ei')
  })

  it('writes the dividend decision in the words OmaVero asks it', async () => {
    const f = await book()
    f.inputs({ dividend: { decided: '2032-03-15', payable: '2032-03-16', amount_cents: 500_000 } })
    const text = omaVeroText(f.view())
    expect(text).toContain('Onko yhteisö päättänyt jakaa osinkoa tai varoja vapaan oman pääoman rahastosta? Kyllä')
    expect(text).toContain('Päivä, jolloin päätös osingon- tai ylijäämänjaosta on tehty: 15.03.2032')
    expect(text).toContain('Jaettavan osingon tai ylijäämän määrä yhteensä: 5 000,00')
  })

  it('lists the forms the figures call for', async () => {
    const f = await book()
    expect(omaVeroText(f.view())).toContain('Liitelomakkeet ja muut ilmoitukset: ei lukujen perusteella')
    f.post('2031-03-01', [[1881, 1_000, 0], [1910, 0, 1_000]])
    expect(omaVeroText(f.view())).toContain('Liitelomakkeet ja muut ilmoitukset: 8A')
  })
})

describe('the two outputs', () => {
  it('give the same figures, because they render one calculation', async () => {
    const f = await book()
    f.inputs({ shareholders: [holder], audit: 3 })
    const view = f.view()
    const text = omaVeroText(view)
    const file = ilmoitinFile(view, { ids: ['010101-0101'], now: new Date(2032, 0, 1) }).text
    expect(text).toContain('Liikevaihto: 12 345,67')
    expect(file).toContain('330:12345,67')
    expect(text).toContain('Oma pääoma yhteensä: 12 245,66')
    expect(file).toContain('478:12245,66')
  })
})
