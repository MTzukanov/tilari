import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../i18n'
import { markNativePickerAncestors } from '../../../shared/nativePicker'
import { AttachmentGallery } from './AttachmentGallery'
import { filesFromClipboardApi, filesFromClipboardData } from './clipboardFiles'

const FILE_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.xml,application/pdf,image/*,text/csv,text/plain,text/xml,application/xml'

function filesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list)
}

export function AttachmentDropzone({
  files,
  existing,
  onAdd,
  onRemove,
}: {
  files: File[]
  existing?: { id: number; name: string; type: string }[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
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
        <AttachmentGallery pending={files} existing={existing} onRemovePending={onRemove} />
      ) : null}
      <div className="dropzone-toolbar">
        <div className="dropzone-copy">
          <strong>{t('editor.dropTitle')}</strong>
          <span>{t('editor.dropHint')}</span>
          {hint ? <span className="muted">{hint}</span> : null}
        </div>
        <div className="dropzone-actions">
          <label
            className="btn-secondary file-btn-label"
            onPointerDown={(e) => markNativePickerAncestors(e.currentTarget, true)}
            onFocusCapture={(e) => markNativePickerAncestors(e.currentTarget, true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                markNativePickerAncestors(e.currentTarget, false)
              }
            }}
          >
            {t('editor.chooseFile')}
            <input
              type="file"
              accept={FILE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                onAdd(filesFromList(e.target.files))
                e.target.value = ''
                markNativePickerAncestors(e.currentTarget, false)
              }}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={() => void pasteFromClipboard()}>
            {t('editor.pasteClipboard')}
          </button>
        </div>
      </div>
    </section>
  )
}
