/**
 * Drafts the object page's edits share: a card's unsaved form, kept for this tab while the owner
 * looks at a voucher and comes back (only for the book, object and stored revision it was made on;
 * cleared on save or cancel), and the rows of the Talous sections' forms.
 */
import type { LeaseDraft } from './leaseDrafts'
import type { SettlementDraft } from './waterDrafts'
import type { DocWriterState } from './useDocWriter'

/** What deleting documents does to the form besides clearing the links to them: e.g. remove a row. */
export type DocEdit = {
  leases?: (drafts: LeaseDraft[]) => LeaseDraft[]
  water?: (drafts: SettlementDraft[]) => SettlementDraft[]
}

export type ValuationDraft = { date: string; price: string; debtFree: string; source: string }
export type CapitalDraft = { date: string; amount: string; note: string }

/**
 * A card's unsaved form on the view page (one card in edit at a time), kept the same way while the
 * owner looks at a voucher. `card` names it: 'lease:l2', 'lease:new', 'water:w1', 'water:new'.
 */
export type CardDraft<D = LeaseDraft> = { book: string; id: number; rev: number; card: string; drafts: D[]; docs: DocWriterState }

const CARD_KEY = 'tilari.properties.cardDraft'

export function loadCardDraft<D = LeaseDraft>(book: string, id: number, rev: number, card: string): CardDraft<D> | null {
  if (!book) return null
  try {
    const raw = sessionStorage.getItem(CARD_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as CardDraft<D>
    if (!draft || draft.book !== book || draft.id !== id || draft.rev !== rev || draft.card !== card || !draft.drafts) return null
    return draft
  } catch {
    return null
  }
}

export function saveCardDraft<D>(draft: CardDraft<D>): void {
  if (!draft.book) return
  try {
    sessionStorage.setItem(CARD_KEY, JSON.stringify(draft))
  } catch {
    /* private mode or quota: the draft just is not kept */
  }
}

export function clearCardDraft(): void {
  try {
    sessionStorage.removeItem(CARD_KEY)
  } catch {
    /* ignore */
  }
}
