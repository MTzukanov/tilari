import { describe, expect, it } from 'vitest'
import type { SetupResponse } from '../api'
import { buildSetupInput, initialDoc, initialEra, type CentreDraft } from './setupInput'

const setup: SetupResponse = {
  cost_centres: [
    { id: 1, name: 'A', starts: null, ends: null, configured: true, excluded: false, kind: 'apartment', eras: [10], docs: [100] },
    { id: 2, name: 'B', starts: null, ends: null, configured: false, excluded: false, kind: null, eras: [], docs: [] },
  ],
  eras: [
    { eraid: 10, account: 1441, account_name: '', date: '2023-01-01', voucher_id: 5, description: '', balance_snt: 1, linked_to: 1, suggestion: null },
    { eraid: 11, account: 1441, account_name: '', date: '2023-01-01', voucher_id: 6, description: '', balance_snt: 1, linked_to: null, suggestion: { cost_centre_id: 2, source: 'text', candidates: [2] } },
  ],
  docs: [
    { voucher_id: 100, date: '2023-01-01', title: '', doc_number: 1, attachments: 1, linked_to: [1], suggestion: null },
    { voucher_id: 101, date: '2023-01-01', title: '', doc_number: 2, attachments: 1, linked_to: [], suggestion: { cost_centre_id: null, candidates: [1, 2] } },
  ],
  dismissed: [],
}

describe('buildSetupInput', () => {
  it('starts from links and clear suggestions, and sends only the differences', () => {
    const eraChoice = new Map(setup.eras.map((e) => [e.eraid, initialEra(e)]))
    const docChoice = new Map(setup.docs.map((d) => [d.voucher_id, initialDoc(d)]))
    expect([...eraChoice]).toEqual([[10, 1], [11, 2]])
    expect([...docChoice]).toEqual([[100, 1], [101, null]])
    // Move item 10 from A to B, link doc 101 to B, and exclude nothing.
    eraChoice.set(10, 2)
    docChoice.set(101, 2)
    const centres = new Map<number, CentreDraft>([
      [1, { included: true, kind: 'apartment' }],
      [2, { included: true, kind: '' }],
    ])
    expect(buildSetupInput(setup, centres, eraChoice, docChoice)).toEqual({
      objects: [
        { id: 1, excluded: false, kind: 'apartment', remove_eras: [10] },
        { id: 2, excluded: false, kind: null, add_eras: [10, 11], add_docs: [101] },
      ],
    })
  })
})
