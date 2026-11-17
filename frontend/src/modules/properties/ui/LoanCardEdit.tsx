import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { FileButton } from '../../../shared/FileButton'
import { formatPcm, parsePcmInput } from '../../../shared/percent'
import {
  HOUSING_LOAN_TYPES,
  LOAN_EVENT_KINDS,
  RATE_REFERENCES,
  type HousingLoanType,
  type LoanEventKind,
  type PropertyDetail,
  type PropertyDoc,
  type RateReference,
} from '../api'
import { DocPicker } from './DocPicker'
import { clearCardDraft, loadCardDraft, saveCardDraft } from './editDraft'
import { saveErrorText } from './format'
import { NoDocumentCheck, Shown } from './FormParts'
import { buildLoan, newLoanDraft, loanDraft, voucherDoc, type LoanDraft } from './loanDrafts'
import { useDocWriter, type CardInputs } from './useDocWriter'
import { candidateDoc } from './waterDrafts'

/** Titles that name a certificate (isännöitsijäntodistus), a vastike notice, or a rate notice: starred in the picks. */
const CERTIFICATE_WORDS = /is[äa]nn[öo]itsij[äa]ntodistu|lainaosuu|velkaosuu/i
const CHARGE_WORDS = /vastike|yhti[öo]kokou/i
const RATE_WORDS = /korko|euribor/i

/** A section of rows with its heading, a hint, and "Lisää rivi". */
function RowSection({ title, hint, onAdd, children }: { title: string; hint?: string; onAdd: () => void; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <>
      <h4>{title}</h4>
      {hint ? <p className="muted property-lease-hint">{hint}</p> : null}
      {children}
      <button type="button" className="btn-link property-lease-add" onClick={onAdd}>
        {t('properties.housing.addRow')}
      </button>
    </>
  )
}

/**
 * One housing-company loan card in edit, in place on the Taloyhtiö tab, with its own Tallenna and
 * Peruuta (ADR-034). A save writes the object with only this loan changed (or added, or removed).
 */
export function LoanCardEdit({
  detail,
  inputs,
  bookKey,
  restore = false,
  loanKey,
  prefill,
  onSave,
  onClose,
  onDirty,
}: {
  detail: PropertyDetail
  inputs: CardInputs
  /** The open book's session: the card's unsaved form is kept for it. */
  bookKey: string
  /** Opened from the address (back from a voucher): start from the form kept for this card, if any. */
  restore?: boolean
  /** The stored loan in edit; null for a new one. */
  loanKey: string | null
  /** A new loan's first draft (copied from another object); none: an empty loan. */
  prefill?: LoanDraft
  /** Saves the object as given and shows it; throws on a refused save. */
  onSave: (doc: PropertyDoc) => Promise<void>
  onClose: () => void
  /** Whether the card holds changes not saved. */
  onDirty: (dirty: boolean) => void
}) {
  const { t } = useI18n()
  const doc = detail.doc
  const stored = doc.housing_loans ?? []
  const cardId = `loan:${loanKey ?? 'new'}`
  const [kept] = useState(() => (restore ? loadCardDraft<LoanDraft>(bookKey, detail.id, doc.rev, cardId) : null))
  const writer = useDocWriter(detail, inputs, kept?.docs)
  const [initial] = useState<LoanDraft>(() => {
    const loan = loanKey ? stored.find((l) => l.key === loanKey) : undefined
    return loan ? loanDraft(loan) : (prefill ?? newLoanDraft())
  })
  const [draft, setDraft] = useState<LoanDraft>(kept?.drafts[0] ?? initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || writer.state.newDocs.length > 0

  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])

  // The unsaved form, kept for the way back from a voucher (any voucher opened from the page).
  const { newDocs, toDelete } = writer.state
  useEffect(() => {
    if (dirty) saveCardDraft({ book: bookKey, id: detail.id, rev: doc.rev, card: cardId, drafts: [draft], docs: { newDocs, toDelete } })
    else clearCardDraft()
  }, [dirty, draft, newDocs, toDelete, bookKey, detail.id, doc.rev, cardId])

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))
  const set = (patch: Partial<LoanDraft>) => setDraft((d) => ({ ...d, ...patch }))
  /** Changes row `i` of a section. */
  const setRow = <K extends 'rates' | 'grace' | 'certificates' | 'charges' | 'events'>(key: K, i: number, patch: Partial<LoanDraft[K][number]>) =>
    setDraft((d) => ({ ...d, [key]: (d[key] as LoanDraft[K][number][]).map((row, j) => (j === i ? { ...row, ...patch } : row)) }))
  const addRow = <K extends 'rates' | 'grace' | 'certificates' | 'charges' | 'events'>(key: K, row: LoanDraft[K][number]) =>
    setDraft((d) => ({ ...d, [key]: [...d[key], row] }))
  const removeRow = (key: 'rates' | 'grace' | 'certificates' | 'charges' | 'events', i: number) =>
    setDraft((d) => ({ ...d, [key]: (d[key] as unknown[]).filter((_, j) => j !== i) }))

  /** What a row's document can be: the Liitetieto documents, the object's vouchers with files, and those already linked. */
  const docs = [
    ...new Map(
      [...writer.allDocs, ...detail.water.statement_candidates.map(candidateDoc), ...detail.housing.vouchers.map(voucherDoc)].map((d) => [d.voucher_id, d]),
    ).values(),
  ]

  async function write(remove = false) {
    setError(null)
    const built = remove ? null : buildLoan(t, draft)
    if (typeof built === 'string') {
      setError(built)
      return
    }
    // Every loan of the object with this card's in its place (saving puts them in order); none removes it.
    const loans = [...stored.filter((l) => l.key !== loanKey), ...(built ? [built] : [])]
    const next: PropertyDoc = { ...doc }
    if (loans.length) next.housing_loans = loans
    else delete next.housing_loans
    setSaving(true)
    try {
      await onSave(writer.withDocs(next))
      await writer.flushDeletes()
      clearCardDraft()
      onDirty(false)
      onClose()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    try {
      await writer.discardUnsaved()
    } catch (err) {
      fail(err)
      return
    }
    clearCardDraft()
    onDirty(false)
    onClose()
  }

  async function remove() {
    if (!loanKey) {
      await cancel()
      return
    }
    if (window.confirm(t('properties.housing.confirmRemove', { name: draft.name || t('properties.housing.unnamed') }))) await write(true)
  }

  /** Uploads a document for row `i` of `key` (a certificate or a rahoitusvastike notice) and picks it. */
  async function upload(key: 'certificates' | 'charges', i: number, files: File[]) {
    if (!files.length) return
    setError(null)
    const row = draft[key][i]
    const day = 'date' in row ? row.date : row.from
    const title =
      key === 'certificates'
        ? t('properties.housing.certificateTitle', { object: detail.name, date: formatDate(day || inputs.today) })
        : t('properties.housing.chargeTitle', { object: detail.name, loan: draft.name, date: formatDate(day || inputs.today) })
    try {
      const id = await writer.createDoc(title, '', files)
      setRow(key, i, { voucherId: String(id) })
    } catch (err) {
      fail(err)
    }
  }

  /** Deletes a document written from a form (after asking) and clears the rows that pointed at it. */
  async function deleteDoc(voucherId: string) {
    setError(null)
    let gone: Set<string> | null
    try {
      gone = await writer.deleteOwn([Number(voucherId)])
    } catch (err) {
      fail(err)
      return
    }
    if (!gone?.size) return
    const clear = <R extends { voucherId: string }>(rows: R[]) => rows.map((r) => (gone.has(r.voucherId) ? { ...r, voucherId: '' } : r))
    setDraft((d) => ({ ...d, rates: clear(d.rates), certificates: clear(d.certificates), charges: clear(d.charges), events: clear(d.events) }))
  }

  /** A row's document: the pick, then "Ei asiakirjaa" (where it may be skipped), an upload, delete and remove-row. */
  function docRow(opts: {
    label: string
    voucherId: string
    words: RegExp
    onPick: (voucherId: string) => void
    noDocument?: { checked: boolean; onChange: (checked: boolean) => void }
    onUpload?: (files: File[]) => void
    onRemove: () => void
  }) {
    const { voucherId } = opts
    return (
      <div className="property-lease-notice">
        <DocPicker label={opts.label} docs={docs} value={voucherId} starred={(d) => opts.words.test(d.title)} onChange={opts.onPick} />
        <div className="property-lease-actions">
          {!voucherId && opts.noDocument ? <NoDocumentCheck checked={opts.noDocument.checked} onChange={opts.noDocument.onChange} /> : null}
          {voucherId && writer.isCreated(Number(voucherId)) ? (
            <button type="button" className="btn-secondary" onClick={() => void deleteDoc(voucherId)}>
              {t('properties.edit.deleteDoc')}
            </button>
          ) : null}
          {opts.onUpload ? <FileButton onFiles={opts.onUpload}>{t('properties.housing.upload')}</FileButton> : null}
          <button type="button" className="btn-link property-delete" onClick={opts.onRemove}>
            {t('properties.housing.removeRow')}
          </button>
        </div>
      </div>
    )
  }

  const margin = parsePcmInput(draft.margin) ?? 0
  return (
    <div className="property-lease-card property-lease-card-edit property-loan-card-edit">
      <div className="property-lease-edit property-loan-edit">
        <div className="property-lease-grid">
          <label className="span-2">
            {t('properties.housing.field.name')}
            <input type="text" value={draft.name} placeholder={t('properties.housing.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="span-2">
            {t('properties.housing.field.lender')}
            <input type="text" value={draft.lender} onChange={(e) => set({ lender: e.target.value })} />
          </label>
          <label>
            {t('properties.housing.field.starts')}
            <input type="date" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} />
          </label>
          <label>
            {t('properties.housing.field.ends')}
            <input type="date" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} />
          </label>
          <label>
            {t('properties.housing.field.type')}
            <select value={draft.type} onChange={(e) => set({ type: e.target.value as HousingLoanType })}>
              {HOUSING_LOAN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`properties.housing.type.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('properties.housing.field.total')}
            <EuroInput value={draft.total} placeholder="" onChange={(total) => set({ total })} />
          </label>
          <label>
            {t('properties.housing.field.reference')}
            <select value={draft.reference} onChange={(e) => set({ reference: e.target.value as RateReference })}>
              {RATE_REFERENCES.map((ref) => (
                <option key={ref} value={ref}>
                  {t(`properties.housing.reference.${ref}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('properties.housing.field.margin')}
            <input type="text" inputMode="decimal" value={draft.margin} placeholder="0,000" onChange={(e) => set({ margin: e.target.value })} />
          </label>
          <label>
            {t('properties.housing.field.resetMonths')}
            <input type="number" min={1} max={120} value={draft.resetMonths} onChange={(e) => set({ resetMonths: e.target.value })} />
          </label>
        </div>
        {draft.group ? <p className="muted property-lease-hint">{t('properties.housing.copiedHint')}</p> : null}

        <RowSection
          title={t('properties.housing.certificates')}
          hint={t('properties.housing.certificatesHint')}
          onAdd={() => addRow('certificates', { date: '', share: '', voucherId: '', noDocument: false })}
        >
          {draft.certificates.map((c, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <label>
                {t('properties.housing.field.date')}
                <input type="date" value={c.date} onChange={(e) => setRow('certificates', i, { date: e.target.value })} />
              </label>
              <label>
                {t('properties.housing.field.share')}
                <EuroInput value={c.share} onChange={(share) => setRow('certificates', i, { share })} />
              </label>
              {docRow({
                label: t('properties.housing.field.certificate'),
                voucherId: c.voucherId,
                words: CERTIFICATE_WORDS,
                onPick: (voucherId) => setRow('certificates', i, { voucherId }),
                noDocument: { checked: c.noDocument, onChange: (noDocument) => setRow('certificates', i, { noDocument }) },
                onUpload: (files) => void upload('certificates', i, files),
                onRemove: () => removeRow('certificates', i),
              })}
            </div>
          ))}
        </RowSection>

        <RowSection
          title={t('properties.housing.charges')}
          hint={t('properties.housing.chargesHint')}
          onAdd={() => addRow('charges', { from: '', amount: '', rahastoitu: false, voucherId: '', noDocument: false })}
        >
          {draft.charges.map((c, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <label>
                {t('properties.housing.field.from')}
                <input type="date" value={c.from} onChange={(e) => setRow('charges', i, { from: e.target.value })} />
              </label>
              <label>
                {t('properties.housing.field.charge')}
                <EuroInput value={c.amount} onChange={(amount) => setRow('charges', i, { amount })} />
              </label>
              <label className="allocation-check property-loan-check" title={t('properties.housing.rahastoituHint')}>
                <input type="checkbox" checked={c.rahastoitu} onChange={() => setRow('charges', i, { rahastoitu: !c.rahastoitu })} />
                {t('properties.housing.field.rahastoitu')}
              </label>
              {docRow({
                label: t('properties.housing.field.chargeNotice'),
                voucherId: c.voucherId,
                words: CHARGE_WORDS,
                onPick: (voucherId) => setRow('charges', i, { voucherId }),
                noDocument: { checked: c.noDocument, onChange: (noDocument) => setRow('charges', i, { noDocument }) },
                onUpload: (files) => void upload('charges', i, files),
                onRemove: () => removeRow('charges', i),
              })}
            </div>
          ))}
        </RowSection>

        <RowSection title={t('properties.housing.rates')} hint={t('properties.housing.ratesHint')} onAdd={() => addRow('rates', { from: '', rate: '', voucherId: '' })}>
          {draft.rates.map((r, i) => {
            const rate = parsePcmInput(r.rate)
            return (
              <div key={i} className="property-lease-grid property-lease-increase">
                <label>
                  {t('properties.housing.field.from')}
                  <input type="date" value={r.from} onChange={(e) => setRow('rates', i, { from: e.target.value })} />
                </label>
                <label>
                  {t('properties.housing.field.rate')}
                  <input type="text" inputMode="decimal" value={r.rate} placeholder="0,000" onChange={(e) => setRow('rates', i, { rate: e.target.value })} />
                </label>
                <Shown
                  label={t('properties.housing.field.totalRate')}
                  value={rate != null && !Number.isNaN(rate) ? formatPcm(rate + margin) : '–'}
                />
                {docRow({
                  label: t('properties.housing.field.document'),
                  voucherId: r.voucherId,
                  words: RATE_WORDS,
                  onPick: (voucherId) => setRow('rates', i, { voucherId }),
                  onRemove: () => removeRow('rates', i),
                })}
              </div>
            )
          })}
        </RowSection>

        <RowSection title={t('properties.housing.grace')} onAdd={() => addRow('grace', { from: '', to: '' })}>
          {draft.grace.map((g, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <label>
                {t('properties.housing.field.from')}
                <input type="date" value={g.from} onChange={(e) => setRow('grace', i, { from: e.target.value })} />
              </label>
              <label>
                {t('properties.housing.field.to')}
                <input type="date" value={g.to} onChange={(e) => setRow('grace', i, { to: e.target.value })} />
              </label>
              <div className="property-lease-actions">
                <button type="button" className="btn-link property-delete" onClick={() => removeRow('grace', i)}>
                  {t('properties.housing.removeRow')}
                </button>
              </div>
            </div>
          ))}
        </RowSection>

        <RowSection
          title={t('properties.housing.events')}
          onAdd={() => addRow('events', { date: '', kind: 'note', amount: '', voucherId: '', note: '' })}
        >
          {draft.events.map((e, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <label>
                {t('properties.housing.field.date')}
                <input type="date" value={e.date} onChange={(ev) => setRow('events', i, { date: ev.target.value })} />
              </label>
              <label>
                {t('properties.housing.field.eventKind')}
                <select value={e.kind} onChange={(ev) => setRow('events', i, { kind: ev.target.value as LoanEventKind })}>
                  {LOAN_EVENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`properties.housing.event.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('properties.housing.field.amount')}
                <EuroInput value={e.amount} placeholder="" onChange={(amount) => setRow('events', i, { amount })} />
              </label>
              <label>
                {t('properties.housing.field.note')}
                <input type="text" value={e.note} onChange={(ev) => setRow('events', i, { note: ev.target.value })} />
              </label>
              {docRow({
                label: t('properties.housing.field.document'),
                voucherId: e.voucherId,
                words: CHARGE_WORDS,
                onPick: (voucherId) => setRow('events', i, { voucherId }),
                onRemove: () => removeRow('events', i),
              })}
            </div>
          ))}
        </RowSection>

        <div className="property-lease-foot">
          <span />
          <button type="button" className="btn-link property-delete" onClick={() => void remove()}>
            {t('properties.housing.remove')}
          </button>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving || detail.read_only} onClick={() => void write()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => void cancel()}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
