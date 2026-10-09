/**
 * Unsaved setup choices and scroll position, kept for this tab while the owner looks at a
 * voucher and comes back. Only for the book it was made on; cleared on save or cancel.
 */
import type { CentreDraft } from './setupInput'

export type SetupDraft = {
  book: string
  centres: [number, CentreDraft][]
  eras: [number, number | null][]
  docs: [number, number | null][]
  showAllEras: boolean
  showAllDocs: boolean
  scrollTop: number
}

const KEY = 'tilari.properties.setupDraft'

export function loadSetupDraft(book: string): SetupDraft | null {
  if (!book) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as SetupDraft
    return draft && draft.book === book && Array.isArray(draft.centres) ? draft : null
  } catch {
    return null
  }
}

export function saveSetupDraft(draft: SetupDraft): void {
  if (!draft.book) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* private mode or quota: the draft just is not kept */
  }
}

export function clearSetupDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** The element the page scrolls in (`main.workspace`), else the document. */
export function scrollContainer(): HTMLElement | null {
  return (document.querySelector('main.workspace') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement | null)
}
