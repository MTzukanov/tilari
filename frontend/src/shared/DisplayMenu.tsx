import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import {
  applyDisplayPrefs,
  loadDisplayPrefs,
  setDisplayPrefs,
  stepTextScale,
  textScaleMax,
  textScaleMin,
  textScalePercent,
  type ContentWidth,
  type DisplayPrefs,
} from './displayPrefs'

export function DisplayMenu() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<DisplayPrefs>(() => loadDisplayPrefs())
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    applyDisplayPrefs(prefs)
  }, [prefs])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    <div className="display-menu" ref={rootRef}>
      <button
        type="button"
        className="display-menu-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('display.title')}
        aria-label={t('display.title')}
        onClick={() => {
          setPrefs(loadDisplayPrefs())
          setOpen((v) => !v)
        }}
      >
        <span className="display-menu-glyph" aria-hidden>
          Aa
        </span>
      </button>
      {open ? (
        <div className="display-menu-panel" role="dialog" aria-label={t('display.title')}>
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
          <p className="display-menu-hint muted">{t('display.hint')}</p>
        </div>
      ) : null}
    </div>
  )
}
