export type SessionChangeKind =
  | 'voucher_create'
  | 'voucher_update'
  | 'voucher_delete'
  | 'attachment_add'
  | 'bank_split'
  | 'settings'
  | 'account'
  | 'allocation'
  | 'fiscal_period'
  | 'vat_create'
  | 'depreciation'
  | 'accrual'
  | 'tax_save'
  | 'tax_clear'
  | 'income_tax'
  | 'period_lock'
  | 'period_unlock'
  | 'statement_start'
  | 'statement_save'
  | 'statement_pdf'
  | 'statement_confirm'
  | 'statement_unconfirm'
  | 'tax_reconcile'
  | 'book_saved'

export type SessionChange = {
  id: number
  at: string
  kind: SessionChangeKind
  params: Record<string, string | number>
}

export type MutateMeta = {
  kind: SessionChangeKind
  params?: Record<string, string | number>
}

export function normalizeSessionChanges(value: unknown): SessionChange[] {
  return Array.isArray(value) ? value : []
}

/** Newest-first list: entries newer than the latest book_saved are unsaved. */
export function computeSavedFlags(items: SessionChange[]): boolean[] {
  const saveIndex = items.findIndex((c) => c.kind === 'book_saved')
  return items.map((change, index) => {
    if (change.kind === 'book_saved') return true
    if (saveIndex === -1) return false
    return index > saveIndex
  })
}

export function countUnsavedChanges(items: SessionChange[]): number {
  const flags = computeSavedFlags(items)
  return items.filter((change, index) => change.kind !== 'book_saved' && !flags[index]).length
}

export class SessionJournal {
  private changes: SessionChange[] = []
  private listeners = new Set<() => void>()
  private nextId = 1

  clear(): void {
    this.changes = []
    this.nextId = 1
    this.emit()
  }

  /** Replace journal from a persisted snapshot (oldest-first). */
  replace(changes: SessionChange[]): void {
    const cleaned = normalizeSessionChanges(changes).filter(
      (c) => c && typeof c.id === 'number' && typeof c.at === 'string' && typeof c.kind === 'string',
    )
    this.changes = cleaned.map((c) => ({
      id: c.id,
      at: c.at,
      kind: c.kind,
      params: c.params && typeof c.params === 'object' ? c.params : {},
    }))
    this.nextId = this.changes.reduce((max, c) => Math.max(max, c.id), 0) + 1
    this.emit()
  }

  /** Oldest-first snapshot for persistence. */
  snapshot(): SessionChange[] {
    return [...this.changes]
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  listChanges(): SessionChange[] {
    return [...this.changes].reverse()
  }

  record(meta: MutateMeta): void {
    this.changes.push({
      id: this.nextId++,
      at: new Date().toISOString(),
      kind: meta.kind,
      params: meta.params ?? {},
    })
    this.emit()
  }
}
