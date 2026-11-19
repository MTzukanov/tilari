import { describe, expect, it } from 'vitest'
import { newVoucherForm, nextEditorKey, type EditorKey } from './editorKey'

/** Keys of the editor along a walk of addresses (voucher id, or a new form's type and copied voucher). */
function walk(addresses: [number | null, number | null, number?][]): number[] {
  const [first, ...rest] = addresses
  let shown: EditorKey = { form: newVoucherForm(...first), key: 0 }
  const keys = [shown.key]
  for (const address of rest) {
    shown = nextEditorKey(shown, newVoucherForm(...address))
    keys.push(shown.key)
  }
  return keys
}

describe('voucher editor key', () => {
  it('names a new form by type and copied voucher; a stored voucher has none', () => {
    expect(newVoucherForm(3, null)).toBeNull()
    expect(newVoucherForm(null, 200)).toBe('200/')
    expect(newVoucherForm(null, null)).toBe('100/')
    expect(newVoucherForm(null, 100, 4)).toBe('100/4')
  })

  it('a new form opened from a stored voucher, a just-saved one or another new form gets a fresh editor', () => {
    // Stored 3 -> new sale: a fresh editor (the defect kept 3's form).
    expect(walk([[3, null], [null, 200]])).toEqual([0, 1])
    // New purchase -> new sale -> a copy of 4: each a fresh editor.
    expect(walk([[null, 100], [null, 200], [null, 100, 4]])).toEqual([0, 1, 2])
    // New sale saved as 11 (loads in place), then a new sale again: fresh.
    expect(walk([[null, 200], [11, null], [null, 200]])).toEqual([0, 0, 1])
  })

  it('stored vouchers, and a new one once saved, load into the editor shown', () => {
    expect(walk([[3, null], [4, null], [3, null]])).toEqual([0, 0, 0])
    expect(walk([[null, 100], [11, null], [12, null]])).toEqual([0, 0, 0])
    // The same address again keeps the editor and its unsaved form.
    const shown: EditorKey = { form: '100/', key: 2 }
    expect(nextEditorKey(shown, '100/')).toBe(shown)
  })
})
