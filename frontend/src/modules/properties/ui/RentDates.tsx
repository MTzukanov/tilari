import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { PropertyDetail, PropertyDoc } from '../api'
import { saveErrorText } from './format'

/**
 * The owner's rent days on the object ("Vuokra omistajalle alkaen / päättyen") under the Vuokrasuhteet
 * title, with a small "Muokkaa" that edits them in place. The boxes show the default days; only another
 * day is stored as the owner's own (`rent_from`, `rent_until`).
 */
export function RentDates({ detail, onSave }: { detail: PropertyDetail; onSave?: (doc: PropertyDoc) => Promise<void> }) {
  const { t } = useI18n()
  const fromDefault = detail.rent_start_default.from
  const untilDefault = detail.rent_end_default?.until ?? ''
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function edit() {
    setFrom(detail.doc.rent_from || fromDefault)
    setUntil(detail.doc.rent_until || untilDefault)
    setError(null)
    setOpen(true)
  }

  async function save() {
    if (from && until && until < from) {
      setError(t('properties.error.rentDates'))
      return
    }
    const next: PropertyDoc = { ...detail.doc }
    if (from && from !== fromDefault) next.rent_from = from
    else delete next.rent_from
    if (until && until !== untilDefault) next.rent_until = until
    else delete next.rent_until
    setSaving(true)
    try {
      await onSave?.(next)
      setOpen(false)
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <p className="muted property-rent-dates">
        {t('properties.field.rentFrom')} {formatDate(detail.rent_start.from)}
        {detail.rent_end ? ` · ${t('properties.field.rentUntil')} ${formatDate(detail.rent_end.until)}` : ''}
        {onSave ? (
          <>
            {' '}
            <button type="button" className="btn-link" onClick={edit}>
              {t('properties.lease.edit')}
            </button>
          </>
        ) : null}
      </p>
    )
  }
  return (
    <div className="property-rent-dates-edit">
      <div className="property-form-grid">
        <label>
          {t('properties.field.rentFrom')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('properties.field.rentUntil')}
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
