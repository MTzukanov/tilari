import { describe, expect, it } from 'vitest'
import { loadImportedFixture, voucherSnapshot } from '../../book/importedFixture'
import { saveVoucher } from '../../book/posting'
import { getVoucher } from '../../book/vouchers'
import type { VoucherEntry } from '../../book/types'
import {
  assistantFit,
  draftsFromEntries,
  entriesFromDrafts,
  pairVatLines,
  transferFits,
  withLineIdentity,
  type LineDraft,
} from './editorLines'

const isBank = (n: number) => String(n).startsWith('19')

function header(v: { date: string; title: string; partner: { name: string } | null }) {
  return { date: v.date, title: v.title, partnerName: v.partner?.name || '' }
}

describe('editor drafts round trip', () => {
  it('saving loaded drafts unchanged writes nothing', async () => {
    const { db, ids } = await loadImportedFixture()
    for (const id of Object.values(ids)) {
      const v = getVoucher(db, id)!
      if (v.status < 100) continue
      const before = voucherSnapshot(db, id)
      const entries = entriesFromDrafts(draftsFromEntries(v.entries), header(v), header(v))
      saveVoucher(db, { date: v.date, type: v.type, title: v.title, partner: v.partner, json: v.json, entries }, id)
      expect(voucherSnapshot(db, id), `voucher ${id}`).toEqual(before)
    }
  })

  it('kept lines follow a header change only where they carried the old value', async () => {
    const { db, ids } = await loadImportedFixture()
    const v = getVoucher(db, ids.A)!
    const entries = entriesFromDrafts(
      draftsFromEntries(v.entries),
      { date: '2025-03-06', title: 'New title', partnerName: 'Other Oy' },
      header(v),
    )
    // Bank and expense lines carried the title, date and partner; the VAT line had no
    // partner and an empty description.
    expect(entries.map((e) => e.date)).toEqual(['2025-03-06', '2025-03-06', '2025-03-06'])
    expect(entries.map((e) => e.description)).toEqual(['New title', 'New title', ''])
    expect(entries[0].partner).toEqual({ name: 'Other Oy' })
    expect(entries[2].partner).toBeNull()
    expect(entries[0]).toMatchObject({ archive_id: 'ARCHIVE-A-000001', entry_type: 102, json: { viite: 'RF18539007547034' } })
  })

  it('a copy has no line ids, archive ids or eras', async () => {
    const { db, ids } = await loadImportedFixture()
    const drafts = draftsFromEntries(getVoucher(db, ids.C)!.entries, { asCopy: true })
    for (const d of drafts) {
      expect(d.id).toBeUndefined()
      expect(d.archive_id).toBe('')
      expect(d.item_id).toBeUndefined()
    }
    const entries = entriesFromDrafts(drafts, { date: '2025-06-01', title: 'Copy', partnerName: '' }, null)
    expect(entries.every((e) => e.id === undefined)).toBe(true)
  })

  it('a new 418/428 line opens a parked era; a stored one keeps its eraid', () => {
    const fresh: LineDraft = {
      account: '29391', description: '', debit: '', credit: '10,00', vat_code: '418', vat_percent: '25.5',
      allocation: '0', archive_id: '', accrual_starts: '', accrual_ends: '',
    }
    const [created, kept] = entriesFromDrafts(
      [fresh, { ...fresh, id: 5, item_id: 5 }],
      { date: '2025-01-01', title: 'T', partnerName: '' },
      { date: '2025-01-01', title: 'T', partnerName: '' },
    )
    expect(created).toMatchObject({ item_id: -1, new_era: true })
    expect(kept).toMatchObject({ id: 5, item_id: 5 })
    expect(kept).not.toHaveProperty('new_era')
  })
})

describe('assistantFit', () => {
  const opts = (type: number, date: string) => ({ voucherType: type, voucherDate: date, vatLiable: true, isBank })

  it('reads the payment line by Kitsas type, also on a liability (2941)', async () => {
    const { db, ids } = await loadImportedFixture()
    const a = getVoucher(db, ids.A)!
    expect(assistantFit(a.entries, opts(100, a.date))).toEqual({ fits: true, paymentIndex: 0 })
    const e = getVoucher(db, ids.E)!
    expect(assistantFit(e.entries, opts(100, e.date))).toEqual({ fits: true, paymentIndex: 0 })
    expect(e.entries[0].account).toBe(2941)
  })

  it('gross of a row is net + booked VAT, so the rebuilt VAT is the same', async () => {
    const { db, ids } = await loadImportedFixture()
    const a = getVoucher(db, ids.A)!
    const { pairs } = pairVatLines(a.entries, 0)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].vat?.debit_cents).toBe(2550)
  })

  it('fits an open item on the payment line; not odd VAT rounding or extra payment lines', async () => {
    const { db, ids } = await loadImportedFixture()
    const c = getVoucher(db, ids.C)!
    expect(assistantFit(c.entries, opts(100, c.date))).toEqual({ fits: true, paymentIndex: 0 })
    const a = getVoucher(db, ids.A)!
    // Invoice VAT one cent off the assistant's rounding: the assistant would change it.
    const odd: VoucherEntry[] = a.entries.map((e) =>
      e.account === 1763 ? { ...e, debit_cents: 2551 } : e.account === 1910 ? { ...e, credit_cents: 12551 } : e,
    )
    expect(assistantFit(odd, opts(100, a.date))).toMatchObject({ fits: false, reason: 'vat' })
    const twoPayments = [...a.entries, { ...a.entries[0], id: 999 }]
    expect(assistantFit(twoPayments, opts(100, a.date))).toMatchObject({ fits: false, reason: 'payment' })
    const notLiable = { ...opts(100, a.date), vatLiable: false }
    expect(assistantFit(a.entries, notLiable)).toMatchObject({ fits: false, reason: 'not_liable' })
  })

  it('transfer form fits a plain pair only', async () => {
    const { db, ids } = await loadImportedFixture()
    const d = getVoucher(db, ids.D)!
    expect(transferFits(d.entries, d.date)).toBe(true) // open-item payment: eraid kept by id
    const a = getVoucher(db, ids.A)!
    expect(transferFits(a.entries, a.date)).toBe(false) // three lines with VAT
    const e = getVoucher(db, ids.E)!
    expect(transferFits(e.entries, e.date)).toBe(true)
  })
})

describe('withLineIdentity', () => {
  it('keeps the payment line open item while its account is unchanged', async () => {
    const { db, ids, openItemLineId } = await loadImportedFixture()
    const previous = draftsFromEntries(getVoucher(db, ids.C)!.entries)
    const rebuilt = previous.map((l) => ({ ...l, id: undefined, item_id: undefined }))
    const out = withLineIdentity(rebuilt, previous, { voucherType: 100, paymentFirst: true })
    expect(out[0]).toMatchObject({ id: openItemLineId, item_id: openItemLineId })
    const moved = withLineIdentity([{ ...rebuilt[0], account: '2941' }, rebuilt[1]], previous, {
      voucherType: 100,
      paymentFirst: true,
    })
    expect(moved[0]).toMatchObject({ id: openItemLineId, item_id: null })
  })

  it('reuses payment, net and VAT line ids and sets Kitsas line types', async () => {
    const { db, ids } = await loadImportedFixture()
    const previous = draftsFromEntries(getVoucher(db, ids.A)!.entries)
    const rebuilt: LineDraft[] = [
      { ...previous[0], id: undefined, archive_id: '', json: undefined, entry_type: undefined },
      { ...previous[1], id: undefined, allocation: '2', entry_type: undefined },
      { ...previous[2], id: undefined, entry_type: undefined },
    ]
    const out = withLineIdentity(rebuilt, previous, { voucherType: 100, paymentFirst: true })
    expect(out.map((l) => l.id)).toEqual(previous.map((l) => l.id))
    expect(out.map((l) => l.entry_type)).toEqual([102, 101, 103])
    expect(out[0].archive_id).toBe('ARCHIVE-A-000001')
    expect(out[0].json).toEqual({ viite: 'RF18539007547034' })
    expect(out[1].allocation).toBe('2')
  })
})
