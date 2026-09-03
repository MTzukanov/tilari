import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { EngineKind } from '../book/service'

export function EngineOpenDialog({
  open,
  fileName,
  defaultEngine,
  forcedEngine,
  allowHttpEngine = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  fileName: string
  defaultEngine: EngineKind
  forcedEngine?: EngineKind
  allowHttpEngine?: boolean
  onConfirm: (kind: EngineKind) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const locked = forcedEngine ?? (!allowHttpEngine ? 'wasm' : undefined)
  const [kind, setKind] = useState<EngineKind>(locked ?? defaultEngine)

  useEffect(() => {
    if (open) setKind(locked ?? defaultEngine)
  }, [open, defaultEngine, locked])

  if (!open) return null

  const chosen = locked ?? kind
  const showPicker = !locked

  return (
    <div className="engine-dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="engine-dialog file-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="engine-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="engine-dialog-title">{t('file.engineDialogTitle')}</h2>
        <p className="muted engine-dialog-name">{fileName}</p>
        {!showPicker ? (
          <p className="engine-dialog-forced">
            {chosen === 'http' ? t('file.engineServerHint') : t('file.engineBrowserHint')}
            {!allowHttpEngine ? ` ${t('file.lockerWasmOnly')}` : ''}
          </p>
        ) : (
          <fieldset className="engine-pick engine-dialog-pick">
            <legend>{t('file.engineLabel')}</legend>
            <label>
              <input
                type="radio"
                name="tilari-engine-open"
                checked={kind === 'wasm'}
                onChange={() => setKind('wasm')}
              />
              {t('file.engineBrowser')}
            </label>
            {allowHttpEngine ? (
              <label>
                <input
                  type="radio"
                  name="tilari-engine-open"
                  checked={kind === 'http'}
                  onChange={() => setKind('http')}
                />
                {t('file.engineServer')}
              </label>
            ) : null}
            <p className="muted engine-hint">
              {kind === 'http' ? t('file.engineServerHint') : t('file.engineBrowserHint')}
            </p>
          </fieldset>
        )}
        <div className="engine-dialog-actions">
          <button type="button" className="file-btn-secondary" onClick={onCancel}>
            {t('file.engineDialogCancel')}
          </button>
          <button type="button" className="file-btn" onClick={() => onConfirm(chosen)}>
            {t('file.engineDialogOpen')}
          </button>
        </div>
      </section>
    </div>
  )
}
