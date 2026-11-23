import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { lockBodyScroll } from './scrollLock'

/**
 * Tilari's own `window.prompt` (`usePrompt` opens it): the prompt text labels one field, filled
 * with the suggestion and selected. OK or Enter answers the field's text, Peru, Esc or a press
 * outside answers null. A native prompt blocks the whole tab, and browser automation cannot type
 * into it.
 */
export function PromptDialog({
  label,
  value,
  inputMode,
  onDone,
}: {
  label: string
  value: string
  /** `numeric` gives a phone its number keys (a voucher number). */
  inputMode?: 'text' | 'numeric'
  onDone: (answer: string | null) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(value)
  const id = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => lockBodyScroll(), [])

  // Layout effect: focus goes back (to the menu's button, the field) before the dialog leaves the page.
  useLayoutEffect(() => {
    const back = document.activeElement
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent) {
    // While it is open the page's own keys (the voucher editor's Esc, Ctrl+S, Ctrl+G) do nothing.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onDone(null)
    } else if (e.key === 'Tab') {
      // Tab goes round the field and the two buttons.
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? [])]
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : -1) : at === items.length - 1 ? 0 : -1
      if (next >= 0) {
        e.preventDefault()
        items[next].focus()
      }
    }
  }

  return createPortal(
    <div
      className="vat-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault()
          onDone(null)
        }
      }}
      // Events still bubble through the React tree to the page that opened it (the editor's form).
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        className="vat-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-label`}
        onKeyDown={onKeyDown}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDone(text)
          }}
        >
          <div className="prompt-dialog-body">
            <label id={`${id}-label`} htmlFor={`${id}-input`}>
              {label}
            </label>
            <input
              ref={inputRef}
              id={`${id}-input`}
              type="text"
              inputMode={inputMode}
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <footer className="vat-dialog-actions">
            <button type="button" className="btn-secondary" onClick={() => onDone(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t('common.ok')}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
