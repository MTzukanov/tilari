/**
 * Which editor instance a voucher address gets (React `key` of the voucher form).
 *
 * React keeps a component's state while only its props change, and every voucher address renders
 * the same editor. Without a key, `#/voucher/new/{type}` opened straight from another voucher kept
 * that voucher's form: its type, title, lines with their Vienti ids, number and loaded fields
 * (MEMORY.md 2026-11-19). A new voucher's form therefore always gets a fresh editor. A stored
 * voucher, and a new one once saved, load into the editor shown (`applyLoaded` sets every loaded
 * field), so moving between stored vouchers and saving a new one do not remount it.
 */

/** A new voucher's form as its address names it (type, the voucher it copies); null for a stored voucher. */
export function newVoucherForm(
  voucherId: number | null,
  type: number | null,
  copyFromId?: number | null,
): string | null {
  if (voucherId != null) return null
  return `${type ?? 100}/${copyFromId ?? ''}`
}

/** The form shown and its key. */
export type EditorKey = { form: string | null; key: number }

/**
 * The key after the address changed to `form`: a new voucher's form other than the one shown gets a
 * new key (a fresh editor); a stored voucher keeps the key and loads in place.
 */
export function nextEditorKey(prev: EditorKey, form: string | null): EditorKey {
  if (form === prev.form) return prev
  return { form, key: form == null ? prev.key : prev.key + 1 }
}
