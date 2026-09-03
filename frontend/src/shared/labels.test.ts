import { describe, expect, it } from 'vitest'
import { accountTypeDescription } from './accountTypes'
import { voucherStatusName, voucherTypeName } from './voucherTypes'

describe('type labels', () => {
  it('maps known account types', () => {
    expect(accountTypeDescription('ARP')).toBe('Pankkitili')
    expect(accountTypeDescription('BE')).toContain('Edellisten')
    expect(accountTypeDescription('ZZZ')).toBe('Tilityyppi ZZZ')
    expect(accountTypeDescription(undefined)).toBe('')
  })

  it('maps voucher type and status', () => {
    expect(voucherTypeName(200)).toBe('Tulo')
    expect(voucherTypeName(9010)).toBe('Tilinavaus')
    expect(voucherStatusName(50)).toBe('Luonnos')
    expect(voucherStatusName(100)).toBe('Kirjanpidossa')
  })
})

describe('finnish date and VAT labels', () => {
  it('formats ISO dates', async () => {
    const { formatFiDate } = await import('./dates')
    expect(formatFiDate('2026-01-02')).toBe('2.1.2026')
  })

  it('names vat choices', async () => {
    const { vatName, vatFromKey } = await import('../modules/vat/ui/vatCodes')
    expect(vatFromKey('21:25.5').label).toContain('osto')
    expect(vatName(0)).toBe('Ei ALV-käsittelyä')
  })
})
