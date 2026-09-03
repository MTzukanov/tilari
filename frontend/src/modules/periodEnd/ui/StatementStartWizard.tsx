import { useState } from 'react'
import {
  startStatement,
  uploadStatementPdf,
  type PmaSize,
  type StatementDoc,
} from '../api'
import { useI18n } from '../../../i18n'
import { ModalShell } from './ModalShell'

const SIZES: PmaSize[] = ['MIKRO', 'PIEN', 'ISO']

/**
 * Pick the PMA size and the optional notes sections,
 * or skip generation entirely by uploading a PDF made elsewhere.
 */
export function StatementStartWizard({
  ends,
  doc,
  onClose,
  onReady,
}: {
  ends: string
  doc: StatementDoc
  onClose: () => void
  onReady: (doc: StatementDoc) => void
}) {
  const { t } = useI18n()
  const [size, setSize] = useState<PmaSize>(doc.size || 'ISO')
  const [headcount, setHeadcount] = useState(doc.headcount == null ? '' : String(doc.headcount))
  const [shareCount, setShareCount] = useState(
    doc.share_count == null ? '' : String(doc.share_count),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set(doc.selected))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = doc.sections.filter((s) => !s.excludes.includes(size))
  const showShareCount = selected.has('oykaytto')

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const next = await startStatement(ends, {
        size,
        selected: [...selected].filter((tag) => available.some((s) => s.tag === tag)),
        headcount: headcount === '' ? null : Number(headcount),
        share_count: shareCount === '' ? null : Number(shareCount),
      })
      onReady(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function uploadPdf(file: File) {
    setBusy(true)
    setError(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      onReady(await uploadStatementPdf(ends, bytes))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={t('yearEnd.notes.startTitle')}
      busy={busy}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void generate()}
            disabled={busy}
          >
            {busy ? t('yearEnd.notes.generating') : t('yearEnd.notes.generate')}
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}
      {doc.drafted_at ? <p className="warn-note">{t('yearEnd.notes.overwrite')}</p> : null}
      <p className="muted">{t('yearEnd.notes.editElsewhereHelp')}</p>

      <fieldset className="tp-fieldset">
        <legend>{t('yearEnd.notes.size')}</legend>
        {SIZES.map((s) => (
          <label key={s} className="tp-radio">
            <input
              type="radio"
              name="pma-size"
              checked={size === s}
              onChange={() => setSize(s)}
              disabled={busy}
            />
            {t(`yearEnd.notes.size.${s}`)}
          </label>
        ))}
      </fieldset>

      <div className="tp-inline-fields">
        <label className="tp-inline-field">
          {t('fiscal.headcount')}
          <input
            type="number"
            min={0}
            step={1}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            disabled={busy}
          />
        </label>
        {showShareCount ? (
          <label className="tp-inline-field">
            {t('yearEnd.notes.shareCount')}
            <input
              type="number"
              min={1}
              step={1}
              value={shareCount}
              onChange={(e) => setShareCount(e.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
      </div>

      <fieldset className="tp-fieldset">
        <legend>{t('yearEnd.notes.sections')}</legend>
        {available.map((section) => (
          <label key={section.tag} className="tp-check">
            <input
              type="checkbox"
              checked={selected.has(section.tag)}
              disabled={busy}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(section.tag)
                else next.delete(section.tag)
                setSelected(next)
              }}
            />
            {section.title}
          </label>
        ))}
      </fieldset>

      <section className="tp-upload">
        <h3>{t('yearEnd.notes.uploadTitle')}</h3>
        <p className="muted">{t('yearEnd.notes.uploadHelp')}</p>
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void uploadPdf(file)
          }}
        />
      </section>
    </ModalShell>
  )
}
