import { describe, expect, it } from 'vitest'
import { SessionJournal, normalizeSessionChanges, computeSavedFlags, countUnsavedChanges } from './sessionLog'

describe('SessionJournal', () => {
  it('records changes in reverse chronological order', () => {
    const journal = new SessionJournal()
    journal.record({ kind: 'voucher_create', params: { id: 1 } })
    journal.record({ kind: 'settings' })
    const list = journal.listChanges()
    expect(list).toHaveLength(2)
    expect(list[0]?.kind).toBe('settings')
    expect(list[1]?.kind).toBe('voucher_create')
  })

  it('clears on reset', () => {
    const journal = new SessionJournal()
    journal.record({ kind: 'account', params: { number: 1900 } })
    journal.clear()
    expect(journal.listChanges()).toEqual([])
  })

  it('records book_saved entries', () => {
    const journal = new SessionJournal()
    journal.record({ kind: 'book_saved', params: { target: 'locker', name: 'test.kitsas' } })
    expect(journal.listChanges()[0]).toMatchObject({
      kind: 'book_saved',
      params: { target: 'locker', name: 'test.kitsas' },
    })
  })

  it('computes saved flags relative to the latest book_saved', () => {
    const items = normalizeSessionChanges([
      { id: 3, at: 't3', kind: 'voucher_update', params: { id: 2 } },
      { id: 2, at: 't2', kind: 'book_saved', params: { target: 'locker', name: 'a.kitsas' } },
      { id: 1, at: 't1', kind: 'voucher_create', params: { id: 1 } },
    ])
    expect(computeSavedFlags(items)).toEqual([false, true, true])
    expect(countUnsavedChanges(items)).toBe(1)
  })

  it('keeps saved flags after a snapshot/replace round-trip', () => {
    const journal = new SessionJournal()
    journal.record({ kind: 'settings' })
    journal.record({ kind: 'book_saved', params: { target: 'disk', name: 'a.kitsas' } })
    const restored = new SessionJournal()
    restored.replace(journal.snapshot())
    const items = restored.listChanges()
    expect(items.map((c) => c.kind)).toEqual(['book_saved', 'settings'])
    expect(computeSavedFlags(items)).toEqual([true, true])
    expect(countUnsavedChanges(items)).toBe(0)
  })

  it('normalizes non-array API payloads', () => {
    expect(normalizeSessionChanges({})).toEqual([])
    expect(normalizeSessionChanges(null)).toEqual([])
  })
})
