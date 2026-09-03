import { LOCALES, localeIsFilled, useI18n } from '../i18n'
import type { Locale } from '../i18n'

function formatPreview(id: Locale): string {
  const bcp47 = LOCALES.find((item) => item.id === id)?.bcp47 ?? 'fi-FI'
  const money = new Intl.NumberFormat(bcp47, { style: 'currency', currency: 'EUR' }).format(1105)
  const date = new Intl.DateTimeFormat(bcp47, { dateStyle: 'short' }).format(new Date(2026, 0, 2))
  return `${money} · ${date}`
}

export function LanguageSelect({
  id = 'locale',
  compact = false,
}: {
  id?: string
  compact?: boolean
}) {
  const { locale, setLocale, t, locales } = useI18n()
  return (
    <label className="period">
      {t('app.language')}
      <select
        id={id}
        aria-label={t('app.language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {locales.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nativeName}
            {item.filled ? '' : ' *'}
          </option>
        ))}
      </select>
      {compact || localeIsFilled() ? null : <span className="muted">{t('app.languageHint')}</span>}
    </label>
  )
}

export function FormatSelect({
  id = 'formats',
  compact = false,
}: {
  id?: string
  compact?: boolean
}) {
  const { formatLocale, setFormatLocale, t, locales } = useI18n()
  return (
    <label className="period">
      {t('app.formats')}
      <select
        id={id}
        aria-label={t('app.formats')}
        value={formatLocale}
        onChange={(e) => setFormatLocale(e.target.value as Locale)}
      >
        {locales.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nativeName} — {formatPreview(item.id)}
          </option>
        ))}
      </select>
      {compact ? null : <span className="muted">{t('app.formatsHint')}</span>}
    </label>
  )
}
