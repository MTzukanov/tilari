import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  loadDisplayPrefs,
  setDisplayPrefs,
  stepTextScale,
  textScaleMax,
  textScaleMin,
  textScalePercent,
  type ContentWidth,
  type DisplayPrefs,
} from './displayPrefs'

/** Inline display controls for Settings (same prefs as the header Aa menu). */
export function DisplayPrefsFields() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<DisplayPrefs>(() => loadDisplayPrefs())

  function bumpScale(delta: -1 | 1) {
    setPrefs(setDisplayPrefs({ textScale: stepTextScale(prefs.textScale, delta) }))
  }

  function setWidth(contentWidth: ContentWidth) {
    setPrefs(setDisplayPrefs({ contentWidth }))
  }

  const widths: { id: ContentWidth; label: string }[] = [
    { id: 'normal', label: t('display.widthNormal') },
    { id: 'wide', label: t('display.widthWide') },
    { id: 'full', label: t('display.widthFull') },
  ]

  return (
    <div className="display-prefs-settings">
      <p className="display-menu-heading">{t('display.textSize')}</p>
      <div className="display-menu-scale">
        <button
          type="button"
          className="display-menu-step"
          aria-label={t('display.textSmaller')}
          disabled={prefs.textScale <= textScaleMin()}
          onClick={() => bumpScale(-1)}
        >
          A−
        </button>
        <span className="display-menu-scale-value">{textScalePercent(prefs.textScale)}%</span>
        <button
          type="button"
          className="display-menu-step"
          aria-label={t('display.textLarger')}
          disabled={prefs.textScale >= textScaleMax()}
          onClick={() => bumpScale(1)}
        >
          A+
        </button>
      </div>
      <p className="display-menu-heading">{t('display.width')}</p>
      <div className="display-menu-widths" role="radiogroup" aria-label={t('display.width')}>
        {widths.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={prefs.contentWidth === w.id}
            className={`display-menu-width ${prefs.contentWidth === w.id ? 'is-active' : ''}`}
            onClick={() => setWidth(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <p className="muted">{t('display.hint')}</p>
    </div>
  )
}
