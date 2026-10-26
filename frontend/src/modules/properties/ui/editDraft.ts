/**
 * The edit page's unsaved form, kept for this tab while the owner looks at a voucher and comes
 * back. Only for the book, object and stored revision it was made on; cleared on save or cancel.
 */
import type { DocCandidate, PropertyDoc, PropertyKind } from '../api'
import { leaseDrafts, withKeys, type LeaseDraft, type Partner } from './leaseDrafts'
import { settlementDrafts, type SettlementDraft } from './waterDrafts'
import { formatEurInput } from '../../../shared/money'
import { formatPercentInput } from '../../../shared/percent'

/** What deleting documents does to the form besides clearing the links to them: e.g. remove a row. */
export type DocEdit = {
  leases?: (drafts: LeaseDraft[]) => LeaseDraft[]
  water?: (drafts: SettlementDraft[]) => SettlementDraft[]
}

export type ValuationDraft = { date: string; price: string; debtFree: string; source: string }
export type CapitalDraft = { date: string; amount: string; note: string }

/** Everything the edit form holds, as typed. */
export type EditState = {
  kind: PropertyKind | ''
  excluded: boolean
  leases: LeaseDraft[]
  water: SettlementDraft[]
  /** Documents written on the page (vouchers already in the book). */
  newDocs: DocCandidate[]
  eras: number[]
  docs: number[]
  valuations: ValuationDraft[]
  salePct: string
  saleFixed: string
  target: string
  loanAccounts: string
  interestAccounts: string
  capital: CapitalDraft[]
  note: string
  /** Earlier created documents the owner deleted; deleted from the book on save. */
  toDelete: number[]
}

type EditDraft = { book: string; id: number; rev: number; state: EditState; scrollTop: number }

const KEY = 'tilari.properties.editDraft'

/** The form as the stored document gives it. */
export function stateFromDoc(doc: PropertyDoc, partners: Partner[]): EditState {
  return {
    kind: doc.kind ?? '',
    excluded: Boolean(doc.excluded),
    leases: withKeys(leaseDrafts(doc.leases, partners)),
    water: settlementDrafts(doc.water_settlements),
    newDocs: [],
    eras: doc.eras.map((e) => e.eraid),
    docs: doc.doc_voucher_ids ?? [],
    valuations: (doc.valuations ?? []).map((v) => ({
      date: v.date,
      price: formatEurInput(v.price_snt),
      debtFree: v.debt_free_price_snt != null ? formatEurInput(v.debt_free_price_snt) : '',
      source: v.source ?? '',
    })),
    salePct: formatPercentInput(doc.sale_costs?.pct_bp),
    saleFixed: doc.sale_costs ? formatEurInput(doc.sale_costs.fixed_snt) : '',
    target: formatPercentInput(doc.target_return_bp),
    loanAccounts: (doc.financing?.loan_accounts ?? []).join(', '),
    interestAccounts: (doc.financing?.interest_accounts ?? []).join(', '),
    capital: (doc.manual_capital ?? []).map((c) => ({ date: c.date, amount: formatEurInput(c.amount_snt), note: c.note ?? '' })),
    note: doc.note ?? '',
    toDelete: [],
  }
}

export function loadEditDraft(book: string, id: number, rev: number): { state: EditState; scrollTop: number } | null {
  if (!book) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as EditDraft
    // A save elsewhere (another rev) makes the draft stale.
    if (!draft || draft.book !== book || draft.id !== id || draft.rev !== rev || !draft.state) return null
    // A draft kept by an earlier version of the form lacks fields added since.
    const leases = (draft.state.leases ?? []).map((l) => ({ ...l, exceptions: l.exceptions ?? [] }))
    return { state: { ...draft.state, leases }, scrollTop: draft.scrollTop ?? 0 }
  } catch {
    return null
  }
}

export function saveEditDraft(draft: EditDraft): void {
  if (!draft.book) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* private mode or quota: the draft just is not kept */
  }
}

export function clearEditDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
