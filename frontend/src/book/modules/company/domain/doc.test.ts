import { describe, expect, it } from 'vitest'
import { applyChanges, emptyCompanyDoc, parseCompanyDoc, serializeCompanyDoc } from './doc'
import type { CompanyDoc } from './types'

const NOW = '2032-05-01T10:00:00.000Z'

const link = { kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: 7 }

function stored(doc: Partial<CompanyDoc> = {}) {
  return parseCompanyDoc(serializeCompanyDoc({ ...emptyCompanyDoc(), rev: 1, ...doc }))
}

describe('the stored company document', () => {
  it('reads as empty when nothing is stored', () => {
    expect(parseCompanyDoc(null)).toEqual({ doc: emptyCompanyDoc(), exists: false, corrupt: false, read_only: false })
  })

  it('flags unreadable data instead of throwing', () => {
    expect(parseCompanyDoc('{not json')).toMatchObject({ corrupt: true, read_only: true })
    expect(parseCompanyDoc('{"v":1,"documents":[{"key":"d1"}]}')).toMatchObject({ corrupt: true, read_only: true })
  })

  it('reads a newer version as read-only and keeps what it does not know', () => {
    const parsed = parseCompanyDoc(JSON.stringify({ v: 2, rev: 3, documents: [], future: { a: 1 } }))
    expect(parsed.read_only).toBe(true)
    expect(parsed.corrupt).toBe(false)
    expect(parsed.doc.future).toEqual({ a: 1 })
  })

  it('serializes the same content to the same text', () => {
    const a = serializeCompanyDoc({ v: 1, rev: 1, documents: [] })
    const b = serializeCompanyDoc({ documents: [], rev: 1, v: 1 })
    expect(a).toBe(b)
  })
})

describe('changes to the company document', () => {
  it('adds a link with a fresh key and bumps the revision', () => {
    const next = applyChanges(stored(), { add: [link] }, NOW)!
    expect(next.rev).toBe(2)
    expect(next.updated_at).toBe(NOW)
    expect(next.documents).toEqual([{ ...link, key: 'd2' }])
  })

  it('does not link the same target twice', () => {
    const once = applyChanges(stored(), { add: [link] }, NOW)!
    expect(applyChanges(parseCompanyDoc(serializeCompanyDoc(once)), { add: [link] }, NOW)).toBeNull()
  })

  it('tells files of one voucher apart', () => {
    const next = applyChanges(stored(), { add: [{ ...link, attachment_id: 1 }, { ...link, attachment_id: 2 }, link] }, NOW)!
    expect(next.documents.map((d) => d.attachment_id ?? null)).toEqual([1, 2, null])
    expect(new Set(next.documents.map((d) => d.key)).size).toBe(3)
  })

  it('removes a link and never reuses its key', () => {
    const one = applyChanges(stored(), { add: [link] }, NOW)!
    const none = applyChanges(parseCompanyDoc(serializeCompanyDoc(one)), { remove: [one.documents[0].key] }, NOW)!
    expect(none.documents).toEqual([])
    const again = applyChanges(parseCompanyDoc(serializeCompanyDoc(none)), { add: [link] }, NOW)!
    expect(again.documents[0].key).not.toBe(one.documents[0].key)
  })

  it('stores nothing for no change, also before the first write', () => {
    expect(applyChanges(parseCompanyDoc(null), {}, NOW)).toBeNull()
    expect(applyChanges(stored(), { remove: [] }, NOW)).toBeNull()
  })

  it('marks and unmarks a slot as not needed', () => {
    const marked = applyChanges(stored(), { not_needed: [{ period_ends: '2031-12-31', kind: 'tax_return_6b', value: true }] }, NOW)!
    expect(marked.not_needed).toEqual([{ period_ends: '2031-12-31', kind: 'tax_return_6b' }])
    const back = applyChanges(parseCompanyDoc(serializeCompanyDoc(marked)), { not_needed: [{ period_ends: '2031-12-31', kind: 'tax_return_6b', value: false }] }, NOW)!
    expect(back.not_needed).toBeUndefined()
  })

  it('keeps settings across other changes and stores only what is on', () => {
    const on = applyChanges(stored(), { settings: { audited: true } }, NOW)!
    expect(on.settings).toEqual({ audited: true })
    const more = applyChanges(parseCompanyDoc(serializeCompanyDoc(on)), { add: [link] }, NOW)!
    expect(more.settings).toEqual({ audited: true })
    const off = applyChanges(parseCompanyDoc(serializeCompanyDoc(more)), { settings: { audited: false } }, NOW)!
    expect(off.settings).toBeUndefined()
  })

  it('collects rejected suggestions once', () => {
    const next = applyChanges(stored({ dismissed: ['b'] }), { dismissed: ['a', 'b'] }, NOW)!
    expect(next.dismissed).toEqual(['a', 'b'])
  })

  it('keeps unknown keys, on the document and on a link', () => {
    const before = stored({ future: 1, documents: [{ ...link, key: 'd1', extra: 'kept' }] })
    const next = applyChanges(before, { settings: { audited: true } }, NOW)!
    expect(next.future).toBe(1)
    expect(next.documents[0].extra).toBe('kept')
  })

  it('refuses a kind of the wrong level', () => {
    expect(() => applyChanges(stored(), { add: [{ ...link, kind: 'articles' }] }, NOW)).toThrow('unknown_kind')
    expect(() => applyChanges(stored(), { add: [{ ...link, period_ends: null }] }, NOW)).toThrow('unknown_kind')
    expect(applyChanges(stored(), { add: [{ ...link, kind: 'articles', period_ends: null }] }, NOW)!.documents).toHaveLength(1)
  })

  it('refuses to write over data it cannot read or a newer format', () => {
    expect(() => applyChanges(parseCompanyDoc('{broken'), { add: [link] }, NOW)).toThrow('corrupt')
    expect(() => applyChanges(parseCompanyDoc(JSON.stringify({ v: 2, documents: [] })), { add: [link] }, NOW)).toThrow('newer_version')
  })
})
