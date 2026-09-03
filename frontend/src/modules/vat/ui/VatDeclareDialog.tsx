import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n'
import { lockBodyScroll } from '../../../shared/scrollLock'

export function VatDeclareDialog({
  html,
  saving,
  onCancel,
  onConfirm,
}: {
  html: string
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => lockBodyScroll(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  function printReport() {
    const win = frameRef.current?.contentWindow
    if (win) {
      win.focus()
      win.print()
      return
    }
    const popup = window.open('', '_blank')
    if (!popup) return
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  return createPortal(
    <div
      className="vat-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel()
      }}
    >
      <div
        className="vat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vat-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vat-dialog-head">
          <h2 id="vat-dialog-title">{t('vat.dialogTitle')}</h2>
        </header>
        <div className="vat-dialog-body">
          <iframe
            ref={frameRef}
            className="vat-dialog-frame"
            title={t('vat.dialogTitle')}
            srcDoc={html}
            sandbox="allow-same-origin allow-modals"
          />
        </div>
        <footer className="vat-dialog-actions">
          <button type="button" className="btn-secondary" onClick={printReport} disabled={saving}>
            {t('vat.print')}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            {t('vat.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? t('vat.creating') : t('vat.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
