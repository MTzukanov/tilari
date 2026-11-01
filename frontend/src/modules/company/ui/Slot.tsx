import { useEffect, useState } from 'react'
import { saveVoucher, uploadAttachment } from '../../../api'
import { voucherDateFor } from '../../../book/modules/company/domain/upload'
import { TYPE_ATTACHMENT_NOTE } from '../../../book/vouchers'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines, DocRow, type DocRowTone } from '../../../shared/DocRows'
import { FileButton } from '../../../shared/FileButton'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { FilePill, Pill, VoucherPill, type PillTone } from '../../../shared/Pill'
import { SearchSelect } from '../../../shared/SearchSelect'
import { voucherTypeName } from '../../../shared/voucherTypes'
import {
  fetchCompanyCandidates,
  type CompanyChanges,
  type CompanyOverview,
  type DocCandidate,
  type DocumentView,
  type KitsasStatement,
  type SlotStatus,
  type Suggestion,
} from '../api'
import { errorText, suggestionAdd, type T } from './format'

export type SlotActions = {
  apply: (changes: CompanyChanges) => Promise<void>
  refresh: () => Promise<void>
  onOpenVoucher: (voucherId: number) => void
}

/** The pill that opens a voucher, by its number; the full date on hover. */
function OpenVoucher({
  voucher,
  actions,
}: {
  voucher: { voucher_id: number; series: string; doc_number: number | null; date: string | null }
  actions: SlotActions
}) {
  const { t } = useI18n()
  const id = formatVoucherId(voucher.series, voucher.doc_number, voucher.date ?? '')
  return (
    <VoucherPill
      label={id ? t('company.link.voucher', { id }) : t('company.link.voucherNoId')}
      title={formatDate(voucher.date)}
      onOpen={() => actions.onOpenVoucher(voucher.voucher_id)}
    />
  )
}

export function DocumentRow({
  doc,
  actions,
  readOnly,
  onError,
}: {
  doc: DocumentView
  actions: SlotActions
  readOnly: boolean
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const gone = doc.state === 'missing'
  // A closed year keeps the document's own date on the link only: say whose date this is.
  const date = doc.date && doc.date !== doc.voucher_date ? t('company.docDate', { date: formatDate(doc.date) }) : formatDate(doc.date)
  return (
    <DocLine
      title={gone ? <span className="muted">{t('company.link.gone', { id: doc.voucher_id })}</span> : doc.title || voucherTypeName(doc.type)}
      date={gone ? null : date}
      end={
        readOnly ? null : (
          <button
            type="button"
            className="btn-link btn-quiet"
            onClick={() => actions.apply({ remove: [doc.key] }).catch((err) => onError(errorText(t, err)))}
          >
            {t('company.slot.unlink')}
          </button>
        )
      }
    >
      {doc.files.map((f) => (
        <FilePill key={f.id} id={f.id} name={f.name} />
      ))}
      {gone ? null : <OpenVoucher voucher={{ ...doc, date: doc.voucher_date }} actions={actions} />}
      {doc.state === 'ok' ? null : <Pill tone="crit">{t(`company.link.state.${doc.state}`)}</Pill>}
    </DocLine>
  )
}

export function SuggestionRows({
  suggestions,
  actions,
  readOnly,
  onError,
  showTarget,
}: {
  suggestions: Suggestion[]
  actions: SlotActions
  readOnly: boolean
  onError: (message: string) => void
  /** Names the slot too, where the list is not under its slot. */
  showTarget?: (s: Suggestion) => string
}) {
  const { t } = useI18n()
  if (!suggestions.length) return null
  return (
    <DocLines>
      {suggestions.map((s) => (
        <DocLine
          key={s.key}
          mark={<Pill tone="doc">{showTarget ? showTarget(s) : t('company.suggest.mark')}</Pill>}
          title={s.title || voucherTypeName(s.type)}
          date={formatDate(s.date)}
          end={
            readOnly ? null : (
              <>
                <button
                  type="button"
                  className="btn-small is-primary"
                  onClick={() => actions.apply({ add: [suggestionAdd(s)] }).catch((err) => onError(errorText(t, err)))}
                >
                  {t('company.suggest.add')}
                </button>
                <button
                  type="button"
                  className="btn-link btn-quiet"
                  onClick={() => actions.apply({ dismissed: [s.key] }).catch((err) => onError(errorText(t, err)))}
                >
                  {t('company.suggest.reject')}
                </button>
              </>
            )
          }
        >
          {s.file_id != null ? <FilePill id={s.file_id} name={s.file_name} /> : null}
          <OpenVoucher voucher={s} actions={actions} />
        </DocLine>
      ))}
    </DocLines>
  )
}

function UploadPanel({
  files,
  kind,
  periodEnds,
  defaultTitle,
  overview,
  today,
  actions,
  onClose,
  onError,
}: {
  files: File[]
  kind: string
  periodEnds: string | null
  defaultTitle: string
  overview: CompanyOverview
  today: string
  actions: SlotActions
  onClose: () => void
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const [date, setDate] = useState(today)
  // "Muut" says nothing about a document: its file name says more.
  const [title, setTitle] = useState(kind === 'other' ? files[0].name.replace(/\.[^.]+$/, '') : defaultTitle)
  const [busy, setBusy] = useState(false)
  const when = date ? voucherDateFor(date, today, overview.lock_date, overview.periods) : { ok: false as const }

  async function save() {
    if (!when.ok || !title.trim()) return
    setBusy(true)
    let created = false
    try {
      const saved = await saveVoucher({ date: when.date, type: TYPE_ATTACHMENT_NOTE, status: 100, title: title.trim(), entries: [] })
      created = true
      for (const file of files) await uploadAttachment(saved.id, file)
      await actions.apply({ add: [{ kind, period_ends: periodEnds, voucher_id: saved.id, doc_date: when.doc_date ?? null }] })
      onClose()
    } catch (err) {
      // The voucher stays: it shows as unlinked and can be attached, so nothing is lost or doubled.
      onError(created ? t('company.error.partial', { reason: errorText(t, err) }) : errorText(t, err))
      if (created) {
        onClose()
        await actions.refresh().catch(() => undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="company-panel">
      <p className="muted">{t('company.upload.files', { names: files.map((f) => f.name).join(', ') })}</p>
      <div className="property-form-grid">
        <label>
          {t('company.upload.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('company.upload.titleField')}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <p className="muted">{t('company.upload.willCreate')}</p>
      {when.ok && when.doc_date ? <p className="company-note">{t('company.upload.lockedFallback', { date: formatDate(when.date) })}</p> : null}
      {when.ok ? null : <p className="error">{t('company.upload.noOpenYear')}</p>}
      <div className="company-panel-actions">
        <button type="button" className="btn-primary" disabled={busy || !when.ok || !title.trim()} onClick={() => void save()}>
          {t('company.upload.save')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
          {t('company.upload.cancel')}
        </button>
      </div>
    </div>
  )
}

function candidateLabel(c: DocCandidate): string {
  const parts = [formatDate(c.date), formatVoucherId(c.series, c.doc_number, c.date), c.title || voucherTypeName(c.type), c.file_name]
  return `${c.linked ? '✓ ' : ''}${parts.filter(Boolean).join(' · ')}`
}

function LinkPanel({
  kind,
  periodEnds,
  actions,
  onClose,
  onError,
}: {
  kind: string
  periodEnds: string | null
  actions: SlotActions
  onClose: () => void
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  const [rows, setRows] = useState<DocCandidate[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCompanyCandidates(all).then(
      (next) => {
        if (!cancelled) setRows(next)
      },
      (err) => {
        if (!cancelled) onError(errorText(t, err))
      },
    )
    return () => {
      cancelled = true
    }
    // The error callback and translator do not change what is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])

  const items = (rows ?? []).map((c) => ({ value: `${c.voucher_id}:${c.attachment_id ?? ''}:${c.file_id ?? ''}`, label: candidateLabel(c) }))

  function pick(value: string) {
    const [voucher, attachment] = value.split(':')
    if (!voucher) return
    actions
      .apply({ add: [{ kind, period_ends: periodEnds, voucher_id: Number(voucher), attachment_id: attachment ? Number(attachment) : null }] })
      .then(onClose, (err) => onError(errorText(t, err)))
  }

  return (
    <div className="company-panel">
      <SearchSelect aria-label={t('company.link.pick')} placeholder={t('company.link.pick')} items={items} value="" onChange={pick} />
      <div className="company-panel-actions">
        <label className="allocation-check">
          <input type="checkbox" checked={all} onChange={() => setAll(!all)} />
          {t('company.link.all')}
        </label>
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('company.link.close')}
        </button>
      </div>
    </div>
  )
}

const STATUS_TONE: Record<SlotStatus, PillTone> = {
  complete: 'ok',
  filled: 'ok',
  missing: 'crit',
  waiting: 'warn',
  optional: 'neutral',
  not_needed: 'neutral',
}

function rowTone(status: SlotStatus | undefined, hasDocuments: boolean): DocRowTone {
  if (status === 'missing') return 'missing'
  if (status === 'not_needed') return 'muted'
  return hasDocuments ? 'done' : 'plain'
}

/** A note on a kind, if the catalog has one. */
function kindHint(t: T, kind: string): string | null {
  const key = `company.slot.hint.${kind}`
  const text = t(key)
  return text === key ? null : text
}

/**
 * One document slot: what is linked, what the book suggests, and the ways to fill it. Files can be
 * dropped on the whole row. `other` and the company's slots take any number of documents. A missing
 * slot makes upload the row's main action, unless the book already suggests a document for it.
 */
export function SlotRow({
  kind,
  label,
  status,
  documents,
  suggestions,
  periodEnds,
  defaultTitle,
  overview,
  today,
  actions,
  kitsasStatement,
  notNeededToggle,
}: {
  kind: string
  label: string
  status?: SlotStatus
  documents: DocumentView[]
  suggestions: Suggestion[]
  periodEnds: string | null
  defaultTitle: string
  overview: CompanyOverview
  today: string
  actions: SlotActions
  kitsasStatement?: KitsasStatement | null
  notNeededToggle?: boolean
}) {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[] | null>(null)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readOnly = overview.read_only

  function setNotNeeded(value: boolean) {
    if (periodEnds == null) return
    actions.apply({ not_needed: [{ period_ends: periodEnds, kind, value }] }).catch((err) => setError(errorText(t, err)))
  }

  const rowActions = readOnly ? null : (
    <>
      <FileButton
        className={`btn-small${status === 'missing' && !suggestions.length ? ' is-primary' : ''}`}
        onFiles={(picked) => {
          setError(null)
          if (picked.length) setFiles(picked)
        }}
      >
        {t('company.slot.upload')}
      </FileButton>
      <button
        type="button"
        className="btn-small"
        onClick={() => {
          setError(null)
          setLinking(!linking)
        }}
      >
        {t('company.slot.link')}
      </button>
      {notNeededToggle && status && status !== 'not_needed' && !documents.length ? (
        <button type="button" className="btn-link btn-quiet" onClick={() => setNotNeeded(true)}>
          {t('company.slot.notNeeded')}
        </button>
      ) : null}
      {notNeededToggle && status === 'not_needed' ? (
        <button type="button" className="btn-link btn-quiet" onClick={() => setNotNeeded(false)}>
          {t('company.slot.needed')}
        </button>
      ) : null}
    </>
  )

  return (
    <DocRow
      name={label}
      status={status ? <Pill tone={STATUS_TONE[status]}>{t(`company.slot.status.${status}`)}</Pill> : null}
      actions={rowActions}
      hint={documents.length ? null : kindHint(t, kind)}
      tone={rowTone(status, documents.length > 0)}
      onFiles={
        readOnly
          ? undefined
          : (dropped) => {
              setError(null)
              setFiles(dropped)
            }
      }
    >
      {kitsasStatement || documents.length ? (
        <DocLines>
          {kitsasStatement ? (
            <DocLine title={t('company.slot.kitsasPdf')} date={formatDate(kitsasStatement.created)}>
              <FilePill id={kitsasStatement.attachment_id} name={t('company.slot.kitsasPdfOpen')} />
            </DocLine>
          ) : null}
          {documents.map((doc) => (
            <DocumentRow key={doc.key} doc={doc} actions={actions} readOnly={readOnly} onError={setError} />
          ))}
        </DocLines>
      ) : null}
      <SuggestionRows suggestions={suggestions} actions={actions} readOnly={readOnly} onError={setError} />
      {error ? <p className="error">{error}</p> : null}
      {files ? (
        <UploadPanel
          files={files}
          kind={kind}
          periodEnds={periodEnds}
          defaultTitle={defaultTitle}
          overview={overview}
          today={today}
          actions={actions}
          onClose={() => setFiles(null)}
          onError={setError}
        />
      ) : null}
      {linking ? <LinkPanel kind={kind} periodEnds={periodEnds} actions={actions} onClose={() => setLinking(false)} onError={setError} /> : null}
    </DocRow>
  )
}

/** A kind pick that links a document at once: for lists of documents that have no slot yet. */
export function AttachSelect({
  candidate,
  kinds,
  periodEnds,
  kindLabel,
  actions,
  onError,
}: {
  candidate: DocCandidate
  kinds: readonly string[]
  periodEnds: string | null
  kindLabel: (kind: string) => string
  actions: SlotActions
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  return (
    <select
      aria-label={t('company.unlinked.pickKind')}
      value=""
      onChange={(e) => {
        const kind = e.target.value
        if (!kind) return
        actions
          .apply({ add: [{ kind, period_ends: periodEnds, voucher_id: candidate.voucher_id, attachment_id: candidate.attachment_id }] })
          .catch((err) => onError(errorText(t, err)))
      }}
    >
      <option value="">{t('company.unlinked.pickKind')}</option>
      {kinds.map((kind) => (
        <option key={kind} value={kind}>
          {kindLabel(kind)}
        </option>
      ))}
    </select>
  )
}

export function UnlinkedRow({ candidate, actions, children }: { candidate: DocCandidate; actions: SlotActions; children: React.ReactNode }) {
  return (
    <DocLine title={candidate.title || voucherTypeName(candidate.type)} date={formatDate(candidate.date)} end={children}>
      {candidate.file_id != null ? <FilePill id={candidate.file_id} name={candidate.file_name} /> : null}
      <OpenVoucher voucher={candidate} actions={actions} />
    </DocLine>
  )
}
