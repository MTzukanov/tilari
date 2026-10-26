import type { ReactNode } from 'react'

/** File types the app takes as attachments (Kitsas shows PDFs and images; text files are kept). */
export const ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.xml,application/pdf,image/*,text/csv,text/plain,text/xml,application/xml'

/**
 * A button that opens the file chooser and hands over the chosen files. The chooser is the
 * system's own window, so unlike a date picker nothing on the page needs unclipping: marking
 * ancestors (`markNativePickerAncestors`) here would turn the page's scroll box visible, jump it to
 * the top and leave it unscrollable after a cancelled dialog.
 */
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
    <label className={`${className} file-btn-label`} aria-disabled={disabled || undefined}>
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
        }}
      />
    </label>
  )
}
