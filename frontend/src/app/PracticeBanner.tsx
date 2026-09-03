import { useI18n } from '../i18n'

export function PracticeBanner({
  date,
  disabled,
  onChange,
}: {
  date: string
  disabled?: boolean
  onChange: (iso: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="practice-banner" role="status">
      <p>
        <strong>{t('practice.bannerTitle')}</strong> {t('practice.bannerHint')}
      </p>
      <label>
        {t('practice.date')}
        <input
          type="date"
          value={date}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value)
          }}
        />
      </label>
    </div>
  )
}
