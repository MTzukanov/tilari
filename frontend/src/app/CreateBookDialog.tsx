import { useMemo, useState, type FormEvent } from 'react'
import { ModalShell } from '../modules/periodEnd/ui/ModalShell'
import {
  PRACTICE_BUSINESS_ID,
  isValidFinnishBusinessId,
  isValidFiscalYear,
  suggestFiscalYear,
  type NewBookInput,
  type VatPeriodMonths,
} from '../book/newBook/createBook'
import { wallToday } from '../book/clock'
import { useI18n } from '../i18n'

export function CreateBookDialog({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean
  onCancel: () => void
  onCreate: (input: NewBookInput) => void
}) {
  const { t } = useI18n()
  const defaults = useMemo(() => suggestFiscalYear(wallToday()), [])
  const [name, setName] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [yearStart, setYearStart] = useState(defaults.starts)
  const [yearEnd, setYearEnd] = useState(defaults.ends)
  const [vatLiable, setVatLiable] = useState(true)
  const [vatPeriod, setVatPeriod] = useState<VatPeriodMonths>(1)
  const [practice, setPractice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('file.createNameRequired'))
      return
    }
    if (businessId.trim() && !practice && !isValidFinnishBusinessId(businessId)) {
      setError(t('file.createYtunnusInvalid'))
      return
    }
    if (!isValidFiscalYear(yearStart, yearEnd)) {
      setError(t('file.createYearInvalid'))
      return
    }
    setError(null)
    onCreate({
      name: trimmed,
      businessId: businessId.trim() || undefined,
      yearStart,
      yearEnd,
      vatLiable,
      vatPeriod,
      practice,
    })
  }

  return (
    <ModalShell
      title={t('file.createTitle')}
      busy={busy}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
            {t('file.cancel')}
          </button>
          <button type="submit" form="create-book-form" className="btn-primary" disabled={busy}>
            {busy ? t('file.creating') : t('file.createSubmit')}
          </button>
        </>
      }
    >
      <form id="create-book-form" className="editor" onSubmit={submit}>
        {error ? <p className="error">{error}</p> : null}
        <div className="form-grid">
          <label className="span2">
            {t('settings.fields.Nimi')}
            <input
              type="text"
              autoComplete="organization"
              value={name}
              disabled={busy}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="span2">
            {t('file.createForm')}
            <select value="oy" disabled aria-describedby="create-form-hint">
              <option value="oy">{t('file.createFormOy')}</option>
            </select>
            <span id="create-form-hint" className="muted field-hint">
              {t('file.createFormHint')}
            </span>
          </label>
          <label>
            {t('settings.fields.Ytunnus')}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={PRACTICE_BUSINESS_ID}
              value={businessId}
              disabled={busy}
              onChange={(e) => setBusinessId(e.target.value)}
            />
            {practice ? (
              <span className="muted field-hint">
                {t('file.createYtunnusPracticeHint', { id: PRACTICE_BUSINESS_ID })}
              </span>
            ) : null}
          </label>
          <label>
            {t('file.createYearStart')}
            <input
              type="date"
              value={yearStart}
              disabled={busy}
              required
              onChange={(e) => setYearStart(e.target.value)}
            />
          </label>
          <label>
            {t('file.createYearEnd')}
            <input
              type="date"
              value={yearEnd}
              disabled={busy}
              required
              onChange={(e) => setYearEnd(e.target.value)}
            />
          </label>
          <label>
            {t('settings.fields.AlvKausi')}
            <select
              value={String(vatPeriod)}
              disabled={busy || !vatLiable}
              onChange={(e) => setVatPeriod(Number(e.target.value) as VatPeriodMonths)}
            >
              <option value="1">{t('settings.vatPeriod.month')}</option>
              <option value="3">{t('settings.vatPeriod.quarter')}</option>
              <option value="12">{t('settings.vatPeriod.year')}</option>
            </select>
          </label>
          <label className="span2 settings-practice">
            <span>{t('file.createVat')}</span>
            <span className="settings-practice-row">
              <input
                type="checkbox"
                aria-label={t('file.createVat')}
                checked={vatLiable}
                disabled={busy}
                onChange={(e) => setVatLiable(e.target.checked)}
              />
            </span>
          </label>
          <label className="span2 settings-practice">
            <span>{t('settings.fields.Harjoitus')}</span>
            <span className="settings-practice-row">
              <input
                type="checkbox"
                aria-label={t('settings.fields.Harjoitus')}
                checked={practice}
                disabled={busy}
                onChange={(e) => {
                  const on = e.target.checked
                  setPractice(on)
                  if (on && !businessId.trim()) setBusinessId(PRACTICE_BUSINESS_ID)
                }}
              />
              <span className="muted field-hint">{t('settings.fields.HarjoitusHelp')}</span>
            </span>
          </label>
        </div>
      </form>
    </ModalShell>
  )
}
