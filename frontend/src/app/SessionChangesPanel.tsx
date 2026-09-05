import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SessionChange } from '../api'
import { normalizeSessionChanges, computeSavedFlags, countUnsavedChanges } from '../book/sessionLog'
import { useI18n } from '../i18n'

function sessionChangeHref(change: SessionChange): string | null {
  const p = change.params
  switch (change.kind) {
    case 'voucher_create':
    case 'voucher_update':
    case 'voucher_delete':
      return typeof p.id === 'number' && p.id > 0 ? `#/voucher/${p.id}/edit` : null
    case 'attachment_add':
      return typeof p.voucherId === 'number' ? `#/voucher/${p.voucherId}/edit` : null
    case 'bank_split':
      return typeof p.newId === 'number' ? `#/voucher/${p.newId}/edit` : null
    case 'vat_create':
    case 'depreciation':
    case 'income_tax':
      return typeof p.id === 'number' ? `#/voucher/${p.id}/edit` : null
    case 'fiscal_period':
    case 'accrual':
    case 'tax_save':
    case 'tax_clear':
    case 'period_lock':
    case 'period_unlock':
    case 'statement_start':
    case 'statement_save':
    case 'statement_pdf':
    case 'statement_confirm':
    case 'statement_unconfirm':
    case 'tax_reconcile':
      return typeof p.ends === 'string' ? `#/fiscal-periods/${p.ends}/closing` : null
    case 'settings':
      return '#/settings'
    case 'account':
      return typeof p.number === 'number' ? `#/account/${p.number}` : null
    case 'allocation':
      return typeof p.id === 'number' ? `#/allocation/${p.id}` : null
    default:
      return null
  }
}

function ChangeStatusIcon({ saved, title }: { saved: boolean; title: string }) {
  return (
    <span
      className={`session-changes-icon ${saved ? 'session-changes-icon-saved' : 'session-changes-icon-unsaved'}`}
      title={title}
      aria-label={title}
      aria-hidden={false}
    >
      {saved ? '✓' : '●'}
    </span>
  )
}

function ChangeRow({
  change,
  saved,
  label,
  time,
  href,
  onNavigate,
  onClose,
}: {
  change: SessionChange
  saved: boolean
  label: string
  time: string
  href: string | null
  onNavigate?: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const statusTitle = saved ? t('session.statusSaved') : t('session.statusUnsaved')
  const body = (
    <>
      <ChangeStatusIcon saved={saved} title={statusTitle} />
      <span className="session-changes-body">
        <span className="session-changes-label">{label}</span>
        <time className="session-changes-time" dateTime={change.at}>
          {time}
        </time>
      </span>
    </>
  )

  if (href) {
    return (
      <button
        type="button"
        className="session-changes-item"
        onClick={() => {
          window.location.hash = href
          onClose()
          onNavigate?.()
        }}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className={`session-changes-item session-changes-item-static${change.kind === 'book_saved' ? ' session-changes-item-saved' : ''}`}
    >
      {body}
    </div>
  )
}

export function SessionChangesPanel({
  changes,
  disabled,
  reloadEnabled = false,
  onNavigate,
  onReloadDiscard,
}: {
  changes: SessionChange[]
  disabled?: boolean
  reloadEnabled?: boolean
  onNavigate?: () => void
  onReloadDiscard?: () => void
}) {
  const { t, formatLocale } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const items = normalizeSessionChanges(changes)
  const savedFlags = computeSavedFlags(items)
  const unsavedCount = countUnsavedChanges(items)

  useEffect(() => {
    if (!open) return
    function onDocClick(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const toggle = toggleRef.current
    if (!open || !panel || !toggle) return

    const margin = 16

    function placePanel() {
      const toggleRect = toggle!.getBoundingClientRect()
      const panelWidth = panel!.offsetWidth
      const vw = window.innerWidth
      let left = toggleRect.left
      if (left + panelWidth > vw - margin) left = vw - margin - panelWidth
      if (left < margin) left = margin
      panel!.style.left = `${left}px`
      panel!.style.top = `${toggleRect.bottom + 6}px`
    }

    placePanel()
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
      panel.style.left = ''
      panel.style.top = ''
    }
  }, [open, items.length, reloadEnabled])

  function label(change: SessionChange): string {
    if (change.kind === 'book_saved') {
      const target = change.params.target === 'disk' ? 'disk' : 'locker'
      return t(`session.change.book_saved_${target}`, change.params as Record<string, string | number>)
    }
    return t(`session.change.${change.kind}`, change.params as Record<string, string | number>)
  }

  function formatTime(at: string): string {
    try {
      return new Date(at).toLocaleString(formatLocale)
    } catch {
      return at
    }
  }

  return (
    <div className="session-changes" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="session-changes-toggle"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {t('session.toggle')}
        {unsavedCount > 0 ? (
          <span className="session-changes-count">{unsavedCount}</span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="session-changes-panel"
          role="dialog"
          aria-label={t('session.title')}
        >
          <h2 className="session-changes-heading">{t('session.title')}</h2>
          {onReloadDiscard ? (
            <div className="session-changes-actions">
              <button
                type="button"
                className="session-changes-reload"
                disabled={disabled || !reloadEnabled}
                title={!reloadEnabled ? t('session.reloadDiscardDisabled') : undefined}
                onClick={() => {
                  setOpen(false)
                  onReloadDiscard()
                }}
              >
                {t('file.reloadDiscard')}
              </button>
            </div>
          ) : null}
          {items.length === 0 ? (
            <p className="muted session-changes-empty">{t('session.empty')}</p>
          ) : (
            <ul className="session-changes-list">
              {items.map((change, index) => (
                <li key={change.id}>
                  <ChangeRow
                    change={change}
                    saved={savedFlags[index] ?? false}
                    label={label(change)}
                    time={formatTime(change.at)}
                    href={sessionChangeHref(change)}
                    onNavigate={onNavigate}
                    onClose={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
