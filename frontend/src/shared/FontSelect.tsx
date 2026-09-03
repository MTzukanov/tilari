import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import {
  DEFAULT_FONT_ID,
  listAvailableFonts,
  loadFontId,
  setFont,
  type FontOption,
} from './fontPrefs'

export function FontSelect({ id = 'ui-font' }: { id?: string }) {
  const { t } = useI18n()
  const [fontId, setFontId] = useState(() => loadFontId())
  const options = useMemo(() => listAvailableFonts(), [])

  function onChange(next: string) {
    setFont(next)
    setFontId(next)
  }

  const shown: FontOption[] = options.some((o) => o.id === fontId)
    ? options
    : [
        ...options,
        {
          id: fontId,
          label: fontId,
          stack: '',
          detect: null,
        },
      ]

  return (
    <label className="period">
      {t('app.font')}
      <select id={id} aria-label={t('app.font')} value={fontId} onChange={(e) => onChange(e.target.value)}>
        {shown.map((item) => (
          <option key={item.id} value={item.id} style={{ fontFamily: item.stack || undefined }}>
            {item.id === DEFAULT_FONT_ID ? t('app.fontDefault', { name: item.label }) : item.label}
          </option>
        ))}
      </select>
      <span className="muted">{t('app.fontHint')}</span>
    </label>
  )
}
