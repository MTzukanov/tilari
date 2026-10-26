import type { ReactNode } from 'react'
import { markNativePickerAncestors } from './nativePicker'

/** File types the app takes as attachments (Kitsas shows PDFs and images; text files are kept). */
export const ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.xml,application/pdf,image/*,text/csv,text/plain,text/xml,application/xml'

/** A button that opens the file chooser and hands over the chosen files. */
export function FileButton({
  children,
  onFiles,
  accept = ATTACHMENT_ACCEPT,
  multiple = true,
  disabled = false,
  className = 'btn-secondary',
}: {
  children: ReactNode
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={`${className} file-btn-label`}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => markNativePickerAncestors(e.currentTarget, true)}
      onFocusCapture={(e) => markNativePickerAncestors(e.currentTarget, true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          markNativePickerAncestors(e.currentTarget, false)
        }
      }}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
          markNativePickerAncestors(e.currentTarget, false)
        }}
      />
    </label>
  )
}
