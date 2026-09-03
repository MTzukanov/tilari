import { describe, expect, it } from 'vitest'
import { parsePaymentMethods } from './paymentMethods'

describe('parsePaymentMethods', () => {
  it('reads Kitsas maksutavat JSON', () => {
    const raw = JSON.stringify([
      { fi: 'Pankkitili', TILI: '1910', KUVA: 'pankki' },
      { fi: 'Lasku', sv: 'Faktura', TILI: '2941', KUVA: 'lasku', ERA: '-1' },
    ])
    const methods = parsePaymentMethods(raw)
    expect(methods).toEqual([
      { name: 'Pankkitili', account: 1910, icon: 'pankki', new_era: false },
      { name: 'Lasku', account: 2941, icon: 'lasku', new_era: true },
    ])
  })

  it('returns empty on junk', () => {
    expect(parsePaymentMethods('')).toEqual([])
    expect(parsePaymentMethods('not-json')).toEqual([])
    expect(parsePaymentMethods('{}')).toEqual([])
  })
})
