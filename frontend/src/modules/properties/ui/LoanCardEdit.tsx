import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { FileButton } from '../../../shared/FileButton'
import { formatPcm, parsePcmInput } from '../../../shared/percent'
import { copyGroup, groupOf } from '../../../book/modules/properties/domain/housingLoan'
import {
  fetchProperty,
  HOUSING_LOAN_TYPES,
  LOAN_EVENT_KINDS,
  RATE_REFERENCES,
  saveProperty,
  type HousingCopySource,
  type LoanRate,
  type HousingLoanType,
  type LoanEventKind,
  type PropertyDetail,
  type PropertyDoc,
  type RateReference,
} from '../api'
import { DocPicker } from './DocPicker'
import { clearCardDraft, loadCardDraft, saveCardDraft } from './editDraft'
import { saveErrorText } from './format'
import { invalidProps, issueOf as issueIn, useIssueFocus, type FormIssue } from './formIssues'
import { Field, FormIssueList, NoDocumentCheck, Shown } from './FormParts'
import { buildLoan, emptyCertificate, emptyCharge, emptyRate, newLoanDraft, loanDraft, voucherDoc, type LoanDraft } from './loanDrafts'
import { useDocWriter, type CardInputs } from './useDocWriter'
import { candidateDoc } from './waterDrafts'

/** Titles that name a certificate (isännöitsijäntodistus), a vastike notice, or a rate notice: starred in the picks. */
const CERTIFICATE_WORDS = /is[äa]nn[öo]itsij[äa]ntodistu|lainaosuu|velkaosuu/i
const CHARGE_WORDS = /vastike|yhti[öo]kokou/i
const RATE_WORDS = /korko|euribor/i

type RowKey = 'rates' | 'grace' | 'certificates' | 'charges' | 'events'

/**
 * A section of rows with its heading, a hint, and "Lisää rivi". `issue`: what a save found missing
 * in the section itself (no row at all); the heading says it and takes the focus.
 */
function RowSection({ title, hint, issue, onAdd, children }: { title: string; hint?: string; issue?: string; onAdd: () => void; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <>
      <h4 tabIndex={issue ? -1 : undefined} data-issue={issue ? true : undefined}>
        {title}
        {issue ? <span className="field-issue"> · {issue}</span> : null}
      </h4>
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
 * A save the form cannot make marks every field to fix, says why in its label, lists them above
 * the buttons and moves to the first; the marks follow the form until it can be saved.
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
  /** A save was tried: from then on the fields to fix are marked as the form changes. */
  const [tried, setTried] = useState(false)
  /** Counts the saves that found fields to fix: each moves to the first of them. */
  const [refused, setRefused] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || writer.state.newDocs.length > 0

  const built = buildLoan(t, draft)
  const issues: FormIssue[] = tried && Array.isArray(built) ? built : []

  /**
   * The same company loan on other objects (copies share a `group`; the original's is named after
   * it): a rate row new on this card can be added to them on save, each ticked by default.
   */
  const group = draft.group || (loanKey ? groupOf(detail.id, loanKey) : '')
  const members = group ? detail.housing.copy_sources.filter((s) => copyGroup(s.loan, s.object_id) === group) : []
  const before = new Set(initial.rates.map((r) => r.from))
  const newRates: LoanRate[] = Array.isArray(built) ? [] : (built.rates ?? []).filter((r) => !before.has(r.from)).map(({ voucher_id: _v, ...r }) => r)
  const memberKey = (m: HousingCopySource) => `${m.object_id}:${m.loan.key}`
  const [skipMembers, setSkipMembers] = useState<Set<string>>(new Set())
  const issueOf = (field: string) => issueIn(issues, field)
  const invalid = (field: string) => invalidProps(issues, field)

  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])

  // The unsaved form, kept for the way back from a voucher (any voucher opened from the page).
  const { newDocs, toDelete } = writer.state
  useEffect(() => {
    if (dirty) saveCardDraft({ book: bookKey, id: detail.id, rev: doc.rev, card: cardId, drafts: [draft], docs: { newDocs, toDelete } })
    else clearCardDraft()
  }, [dirty, draft, newDocs, toDelete, bookKey, detail.id, doc.rev, cardId])

  useIssueFocus(cardRef, refused)

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))
  const set = (patch: Partial<LoanDraft>) => setDraft((d) => ({ ...d, ...patch }))
  /** Changes row `i` of a section. */
  const setRow = <K extends RowKey>(key: K, i: number, patch: Partial<LoanDraft[K][number]>) =>
    setDraft((d) => ({ ...d, [key]: (d[key] as LoanDraft[K][number][]).map((row, j) => (j === i ? { ...row, ...patch } : row)) }))
  const addRow = <K extends RowKey>(key: K, row: LoanDraft[K][number]) => setDraft((d) => ({ ...d, [key]: [...d[key], row] }))
  const removeRow = (key: RowKey, i: number) => setDraft((d) => ({ ...d, [key]: (d[key] as unknown[]).filter((_, j) => j !== i) }))

  /** What a row's document can be: the Liitetieto documents, the object's vouchers with files, and those already linked. */
  const docs = [
    ...new Map(
      [...writer.allDocs, ...detail.water.statement_candidates.map(candidateDoc), ...detail.housing.vouchers.map(voucherDoc)].map((d) => [d.voucher_id, d]),
    ).values(),
  ]

  async function write(remove = false) {
    setError(null)
    if (!remove && Array.isArray(built)) {
      setTried(true)
      setRefused((n) => n + 1)
      return
    }
    // Every loan of the object with this card's in its place (saving puts them in order); none removes it.
    const loans = [...stored.filter((l) => l.key !== loanKey), ...(!remove && !Array.isArray(built) ? [built] : [])]
    const next: PropertyDoc = { ...doc }
    if (loans.length) next.housing_loans = loans
    else delete next.housing_loans
    setSaving(true)
    try {
      await onSave(writer.withDocs(next))
      await writer.flushDeletes()
      clearCardDraft()
      onDirty(false)
      const failed = remove ? [] : await addRatesToMembers()
      if (failed.length) {
        setError(t('properties.housing.alsoFailed', { objects: failed.join(', ') }))
        return
      }
      onClose()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  /** Adds this card's new rate rows to the ticked copies on other objects; returns the objects that failed. */
  async function addRatesToMembers(): Promise<string[]> {
    const failed: string[] = []
    for (const member of members) {
      if (!newRates.length || skipMembers.has(memberKey(member))) continue
      try {
        const other = await fetchProperty(member.object_id)
        const loans = (other.doc.housing_loans ?? []).map((l) => {
          if (l.key !== member.loan.key) return l
          const have = new Set((l.rates ?? []).map((r) => r.from))
          return { ...l, rates: [...(l.rates ?? []), ...newRates.filter((r) => !have.has(r.from))] }
        })
        await saveProperty(member.object_id, { ...other.doc, housing_loans: loans })
      } catch {
        failed.push(member.object_name)
      }
    }
    return failed
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

  const fixed = draft.reference === 'fixed'
  const margin = fixed ? 0 : (parsePcmInput(draft.margin) ?? 0)
  return (
    <div ref={cardRef} className="property-lease-card property-lease-card-edit property-loan-card-edit">
      <div className="property-lease-edit property-loan-edit">
        <div className="property-lease-grid">
          <Field className="span-2" label={t('properties.housing.field.name')} issue={issueOf('name')}>
            <input
              type="text"
              value={draft.name}
              placeholder={t('properties.housing.namePlaceholder')}
              onChange={(e) => set({ name: e.target.value })}
              {...invalid('name')}
            />
          </Field>
          <Field className="span-2" label={t('properties.housing.field.lender')}>
            <input type="text" value={draft.lender} onChange={(e) => set({ lender: e.target.value })} />
          </Field>
          <Field label={t('properties.housing.field.starts')} issue={issueOf('starts')}>
            <input type="date" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} {...invalid('starts')} />
          </Field>
          <Field label={t('properties.housing.field.ends')} issue={issueOf('ends')}>
            <input type="date" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} {...invalid('ends')} />
          </Field>
          <Field label={t('properties.housing.field.type')}>
            <select value={draft.type} onChange={(e) => set({ type: e.target.value as HousingLoanType })}>
              {HOUSING_LOAN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`properties.housing.type.${type}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('properties.housing.field.total')} issue={issueOf('total')}>
            <EuroInput value={draft.total} placeholder="" onChange={(total) => set({ total })} {...invalid('total')} />
          </Field>
          <Field label={t('properties.housing.field.reference')}>
            <select value={draft.reference} onChange={(e) => set({ reference: e.target.value as RateReference })}>
              {RATE_REFERENCES.map((ref) => (
                <option key={ref} value={ref}>
                  {t(`properties.housing.reference.${ref}`)}
                </option>
              ))}
            </select>
          </Field>
          {/* A fixed rate is all in its rate rows: no margin and no resets. */}
          {!fixed ? (
            <Field label={t('properties.housing.field.margin')} issue={issueOf('margin')}>
              <input
                type="text"
                inputMode="decimal"
                value={draft.margin}
                placeholder="0,000"
                onChange={(e) => set({ margin: e.target.value })}
                {...invalid('margin')}
              />
            </Field>
          ) : null}
          {!fixed ? (
            <Field label={t('properties.housing.field.resetMonths')} issue={issueOf('resetMonths')}>
              <input
                type="number"
                min={1}
                max={120}
                value={draft.resetMonths}
                onChange={(e) => set({ resetMonths: e.target.value })}
                {...invalid('resetMonths')}
              />
            </Field>
          ) : null}
        </div>
        {draft.group ? <p className="muted property-lease-hint">{t('properties.housing.copiedHint')}</p> : null}

        <RowSection
          title={t('properties.housing.certificates')}
          hint={t('properties.housing.certificatesHint')}
          issue={issueOf('certificates')}
          onAdd={() => addRow('certificates', emptyCertificate())}
        >
          {draft.certificates.map((c, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <Field label={t('properties.housing.field.date')} issue={issueOf(`certificates.${i}.date`)}>
                <input type="date" value={c.date} onChange={(e) => setRow('certificates', i, { date: e.target.value })} {...invalid(`certificates.${i}.date`)} />
              </Field>
              <Field label={t('properties.housing.field.share')} issue={issueOf(`certificates.${i}.share`)}>
                <EuroInput value={c.share} onChange={(share) => setRow('certificates', i, { share })} {...invalid(`certificates.${i}.share`)} />
              </Field>
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
          issue={issueOf('charges')}
          onAdd={() => addRow('charges', emptyCharge())}
        >
          {draft.charges.map((c, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <Field label={t('properties.housing.field.from')} issue={issueOf(`charges.${i}.from`)}>
                <input type="date" value={c.from} onChange={(e) => setRow('charges', i, { from: e.target.value })} {...invalid(`charges.${i}.from`)} />
              </Field>
              <Field label={t('properties.housing.field.charge')} issue={issueOf(`charges.${i}.amount`)}>
                <EuroInput value={c.amount} onChange={(amount) => setRow('charges', i, { amount })} {...invalid(`charges.${i}.amount`)} />
              </Field>
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

        <RowSection
          title={t('properties.housing.rates')}
          hint={t(fixed ? 'properties.housing.ratesHintFixed' : 'properties.housing.ratesHint')}
          issue={issueOf('rates')}
          onAdd={() => addRow('rates', emptyRate())}
        >
          {draft.rates.map((r, i) => {
            const rate = parsePcmInput(r.rate)
            return (
              <div key={i} className="property-lease-grid property-lease-increase">
                <Field label={t('properties.housing.field.from')} issue={issueOf(`rates.${i}.from`)}>
                  <input type="date" value={r.from} onChange={(e) => setRow('rates', i, { from: e.target.value })} {...invalid(`rates.${i}.from`)} />
                </Field>
                <Field label={t(fixed ? 'properties.housing.field.fixedRate' : 'properties.housing.field.rate')} issue={issueOf(`rates.${i}.rate`)}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.rate}
                    placeholder="0,000"
                    onChange={(e) => setRow('rates', i, { rate: e.target.value })}
                    {...invalid(`rates.${i}.rate`)}
                  />
                </Field>
                {!fixed ? (
                  <Shown
                    label={t('properties.housing.field.totalRate')}
                    value={rate != null && !Number.isNaN(rate) ? formatPcm(rate + margin) : '–'}
                  />
                ) : null}
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

        {members.length && newRates.length ? (
          <div className="property-loan-also">
            <p className="muted property-lease-hint">
              {t('properties.housing.alsoLead', { dates: newRates.map((r) => formatDate(r.from)).join(', ') })}
            </p>
            {members.map((m) => (
              <label key={memberKey(m)} className="allocation-check">
                <input
                  type="checkbox"
                  checked={!skipMembers.has(memberKey(m))}
                  onChange={() =>
                    setSkipMembers((prev) => {
                      const next = new Set(prev)
                      if (next.has(memberKey(m))) next.delete(memberKey(m))
                      else next.add(memberKey(m))
                      return next
                    })
                  }
                />
                {m.object_name} · {m.loan.name}
              </label>
            ))}
          </div>
        ) : null}

        <RowSection title={t('properties.housing.grace')} onAdd={() => addRow('grace', { from: '', to: '' })}>
          {draft.grace.map((g, i) => (
            <div key={i} className="property-lease-grid property-lease-increase">
              <Field label={t('properties.housing.field.from')} issue={issueOf(`grace.${i}.from`)}>
                <input type="date" value={g.from} onChange={(e) => setRow('grace', i, { from: e.target.value })} {...invalid(`grace.${i}.from`)} />
              </Field>
              <Field label={t('properties.housing.field.to')} issue={issueOf(`grace.${i}.to`)}>
                <input type="date" value={g.to} onChange={(e) => setRow('grace', i, { to: e.target.value })} {...invalid(`grace.${i}.to`)} />
              </Field>
              <div className="property-lease-actions property-row-end">
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
              <Field label={t('properties.housing.field.date')} issue={issueOf(`events.${i}.date`)}>
                <input type="date" value={e.date} onChange={(ev) => setRow('events', i, { date: ev.target.value })} {...invalid(`events.${i}.date`)} />
              </Field>
              <Field label={t('properties.housing.field.eventKind')}>
                <select value={e.kind} onChange={(ev) => setRow('events', i, { kind: ev.target.value as LoanEventKind })}>
                  {LOAN_EVENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`properties.housing.event.${kind}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('properties.housing.field.amount')} issue={issueOf(`events.${i}.amount`)}>
                <EuroInput value={e.amount} placeholder="" onChange={(amount) => setRow('events', i, { amount })} {...invalid(`events.${i}.amount`)} />
              </Field>
              <Field label={t('properties.housing.field.note')}>
                <input type="text" value={e.note} onChange={(ev) => setRow('events', i, { note: ev.target.value })} />
              </Field>
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
      <FormIssueList issues={issues} />
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
