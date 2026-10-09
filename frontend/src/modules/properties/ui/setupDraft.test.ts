import { beforeEach, describe, expect, it } from 'vitest'
import { clearSetupDraft, loadSetupDraft, saveSetupDraft, type SetupDraft } from './setupDraft'

const draft: SetupDraft = {
  book: 'session-a',
  centres: [[1, { included: false, kind: 'parking' }]],
  eras: [[10, 2]],
  docs: [[100, null]],
  showAllEras: true,
  showAllDocs: false,
  scrollTop: 640,
}

describe('setup draft', () => {
  beforeEach(() => clearSetupDraft())

  it('round-trips for the same book only', () => {
    saveSetupDraft(draft)
    expect(loadSetupDraft('session-a')).toEqual(draft)
    expect(loadSetupDraft('session-b')).toBeNull()
    expect(loadSetupDraft('')).toBeNull()
  })

  it('is gone after clearing', () => {
    saveSetupDraft(draft)
    clearSetupDraft()
    expect(loadSetupDraft('session-a')).toBeNull()
  })
})
