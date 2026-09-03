import { describe, expect, it } from 'vitest'
import { creatableVoucherTypes, defaultEditorTab, hasBookTab, voucherTypeDef } from './catalog'

describe('voucher catalog', () => {
  it('gives browse and editor the same icon and kind class', () => {
    const meno = voucherTypeDef(100)
    expect(meno.icon).toBe('expense')
    expect(meno.kindClass).toBe('kind-expense')
    expect(meno.layout).toBe('expense')
    expect(voucherTypeDef(200).icon).toBe('income')
    expect(voucherTypeDef(300).layout).toBe('transfer')
    expect(voucherTypeDef(400).layout).toBe('statement')
    expect(voucherTypeDef(800).layout).toBe('attachment')
  })

  it('lists user-creatable types once', () => {
    const codes = creatableVoucherTypes().map((d) => d.type)
    expect(codes).toEqual([100, 200, 300, 0, 400, 800])
  })

  it('picks the first editor tab from layout', () => {
    expect(hasBookTab(100)).toBe(true)
    expect(hasBookTab(0)).toBe(false)
    expect(defaultEditorTab(100)).toBe('book')
    expect(defaultEditorTab(0)).toBe('entries')
    expect(defaultEditorTab(800)).toBe('attachments')
  })
})
