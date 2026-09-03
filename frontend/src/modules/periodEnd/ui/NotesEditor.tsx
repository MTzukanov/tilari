import { useEffect, useRef, useState } from 'react'
import { saveStatement, type StatementDoc } from '../api'
import { useI18n } from '../../../i18n'
import { ModalShell } from './ModalShell'

type Command = {
  cmd: string
  value?: string
  symbol: string
  labelKey: string
  className?: string
}

const COMMANDS: Command[] = [
  { cmd: 'bold', symbol: 'B', labelKey: 'yearEnd.notes.bold', className: 'notes-icon-bold' },
  { cmd: 'italic', symbol: 'I', labelKey: 'yearEnd.notes.italic', className: 'notes-icon-italic' },
  { cmd: 'formatBlock', value: 'h2', symbol: 'H', labelKey: 'yearEnd.notes.heading' },
  { cmd: 'formatBlock', value: 'p', symbol: '¶', labelKey: 'yearEnd.notes.paragraph' },
  { cmd: 'insertUnorderedList', symbol: '•', labelKey: 'yearEnd.notes.bullets' },
  { cmd: 'insertOrderedList', symbol: '1.', labelKey: 'yearEnd.notes.numbers' },
]

/**
 * Notes-to-the-accounts editor. Uses a `contenteditable` region plus the browser's own
 * formatting commands, so the HTML round-trips without pulling in a rich-text
 * library. A raw-HTML mode covers anything the toolbar cannot do.
 */
export function NotesEditor({
  ends,
  doc,
  onClose,
  onSaved,
  onStartOver,
}: {
  ends: string
  doc: StatementDoc
  onClose: () => void
  onSaved: (doc: StatementDoc) => void
  /** Re-open the generation wizard (replaces current text after confirm). */
  onStartOver: () => void
}) {
  const { t } = useI18n()
  const editorRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState(doc.html)
  const [rawMode, setRawMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!rawMode && editorRef.current && editorRef.current.innerHTML !== source) {
      editorRef.current.innerHTML = source
    }
  }, [rawMode, source])

  function currentHtml(): string {
    if (rawMode) return source
    return editorRef.current?.innerHTML ?? source
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveStatement(ends, currentHtml()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function apply(command: Command) {
    editorRef.current?.focus()
    document.execCommand(command.cmd, false, command.value)
  }

  function startOver() {
    const dirty = currentHtml() !== doc.html
    if (dirty && !window.confirm(t('yearEnd.notes.discardEdits'))) return
    onStartOver()
  }

  return (
    <ModalShell
      title={t('yearEnd.notes.editorTitle')}
      busy={busy}
      onClose={onClose}
      wide
      actions={
        <>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={startOver}
          >
            {t('yearEnd.notes.regenerate')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setSource(currentHtml())
              setRawMode(!rawMode)
            }}
          >
            {rawMode ? t('yearEnd.notes.visualMode') : t('yearEnd.notes.htmlMode')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">{t('yearEnd.notes.editElsewhereHelp')}</p>
      {rawMode ? (
        <textarea
          className="tp-source"
          value={source}
          spellCheck={false}
          onChange={(e) => setSource(e.target.value)}
          disabled={busy}
        />
      ) : (
        <>
          <div className="tp-toolbar">
            {COMMANDS.map((command) => (
              <button
                key={`${command.cmd}-${command.value ?? ''}`}
                type="button"
                className={`btn-secondary notes-icon-btn ${command.className ?? ''}`}
                title={t(command.labelKey)}
                aria-label={t(command.labelKey)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(command)}
                disabled={busy}
              >
                {command.symbol}
              </button>
            ))}
          </div>
          <div
            ref={editorRef}
            className="tp-editor"
            contentEditable={!busy}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={t('yearEnd.notes.editorTitle')}
          />
        </>
      )}
    </ModalShell>
  )
}
