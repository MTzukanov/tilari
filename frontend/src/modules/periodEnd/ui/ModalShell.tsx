import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { lockBodyScroll } from '../../../shared/scrollLock'

/** Shared modal chrome for the year-end dialogs, styled like the ALV dialog. */
export function ModalShell({
  title,
  busy,
  onClose,
  actions,
  wide,
  children,
}: {
  title: string
  busy?: boolean
  onClose: () => void
  actions: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => lockBodyScroll(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return createPortal(
    <div
      className="vat-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className={`vat-dialog${wide ? ' vat-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vat-dialog-head">
          <h2>{title}</h2>
        </header>
        <div className="vat-dialog-body year-end-body">{children}</div>
        <footer className="vat-dialog-actions">{actions}</footer>
      </div>
    </div>,
    document.body,
  )
}
