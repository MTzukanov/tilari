import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n'
import { deleteProperty, fetchProperty, PROPERTY_KINDS, saveProperty, type PropertyDetail, type PropertyDoc, type PropertyKind } from '../api'
import { saveErrorText } from './format'

/**
 * The object's general settings: its kind, whether it counts in the figures, the owner's note,
 * and removing Tilari's data on it. Everything else is edited where it is shown, on the object's
 * tabs, card by card or section by section.
 */
function EditForm({ detail, onDone }: { detail: PropertyDetail; onDone: () => void }) {
  const { t } = useI18n()
  const doc = detail.doc
  const [kind, setKind] = useState<PropertyKind | ''>(doc.kind ?? '')
  const [excluded, setExcluded] = useState(Boolean(doc.excluded))
  const [note, setNote] = useState(doc.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const next: PropertyDoc = { ...doc }
    if (kind) next.kind = kind
    else delete next.kind
    if (excluded) next.excluded = true
    else delete next.excluded
    if (note.trim()) next.note = note.trim()
    else delete next.note
    setSaving(true)
    try {
      await saveProperty(detail.id, next)
      onDone()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('properties.edit.deleteConfirm'))) return
    try {
      await deleteProperty(detail.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="property-edit">
      {detail.read_only ? <p className="property-note">{t('properties.edit.readOnly')}</p> : null}
      <p className="muted">{t('properties.edit.lead')}</p>

      <section className="property-section">
        <h3>{t('properties.edit.basics')}</h3>
        <div className="property-form-grid">
          <label>
            {t('properties.field.kind')}
            <select value={kind} onChange={(e) => setKind(e.target.value as PropertyKind | '')}>
              <option value="">–</option>
              {PROPERTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`properties.kind.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="allocation-check">
            <input type="checkbox" checked={excluded} onChange={() => setExcluded(!excluded)} />
            {t('properties.field.excluded')}
          </label>
        </div>
      </section>

      <section className="property-section">
        <h3>{t('properties.field.note')}</h3>
        <textarea className="property-textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving || detail.read_only} onClick={() => void save()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('common.cancel')}
        </button>
        {detail.configured ? (
          <button type="button" className="btn-secondary property-delete" onClick={() => void remove()}>
            {t('properties.edit.delete')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function PropertyEdit({ id, onDone }: { id: number; onDone: () => void }) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<PropertyDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchProperty(id).then(
      (loaded) => {
        if (!cancelled) setDetail(loaded)
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])
  return (
    <div className="ledger property-detail">
      <button type="button" className="back-btn" onClick={onDone}>
        {t('up.property')}
      </button>
      <div className="ledger-head-intro">
        <h2 className="ledger-page-title">{detail ? t('properties.edit.title', { name: detail.name }) : '...'}</h2>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {detail ? <EditForm detail={detail} onDone={onDone} /> : null}
    </div>
  )
}
