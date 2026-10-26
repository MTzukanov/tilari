import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../i18n'
import { FileButton } from '../../../shared/FileButton'
import { AttachmentGallery } from './AttachmentGallery'
import { filesFromClipboardApi, filesFromClipboardData } from './clipboardFiles'

function filesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list)
}

export function AttachmentDropzone({
  files,
  existing,
  onAdd,
  onRemove,
  onDeleteExisting,
}: {
  files: File[]
  existing?: { id: number; name: string; type: string }[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  onDeleteExisting?: (id: number) => void
}) {
  const { t } = useI18n()
  const onAddRef = useRef(onAdd)
  onAddRef.current = onAdd
  const zoneRef = useRef<HTMLElement>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const next = filesFromClipboardData(e.clipboardData)
      if (!next.length) return
      e.preventDefault()
      setHint(null)
      onAddRef.current(next)
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [])

  async function pasteFromClipboard() {
    setHint(null)
    try {
      const next = await filesFromClipboardApi()
      if (next.length) {
        onAdd(next)
        return
      }
    } catch {
      /* Clipboard API is often denied; Ctrl+V still works via the paste listener. */
    }
    zoneRef.current?.focus()
    setHint(t('editor.pasteHint'))
  }

  const hasPreviews = files.length > 0 || Boolean(existing?.length)

  return (
    <section
      ref={zoneRef}
      className="dropzone"
      tabIndex={0}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onAdd(filesFromList(e.dataTransfer.files))
      }}
    >
      {hasPreviews ? (
        <AttachmentGallery
          pending={files}
          existing={existing}
          onRemovePending={onRemove}
          onDeleteExisting={onDeleteExisting}
        />
      ) : null}
      <div className="dropzone-toolbar">
        <div className="dropzone-copy">
          <strong>{t('editor.dropTitle')}</strong>
          <span>{t('editor.dropHint')}</span>
          {hint ? <span className="muted">{hint}</span> : null}
        </div>
        <div className="dropzone-actions">
          <FileButton onFiles={onAdd}>{t('editor.chooseFile')}</FileButton>
          <button type="button" className="btn-secondary" onClick={() => void pasteFromClipboard()}>
            {t('editor.pasteClipboard')}
          </button>
        </div>
      </div>
    </section>
  )
}
