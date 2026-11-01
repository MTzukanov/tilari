import { useState, type DragEvent, type ReactNode } from 'react'

/**
 * A row or section that takes dropped files. Smaller than `AttachmentDropzone`, which belongs to
 * the voucher editor: it lists files and adds a page-wide paste listener while mounted.
 */
export function FileDropArea({
  children,
  onFiles,
  disabled = false,
  className = '',
}: {
  children: ReactNode
  onFiles: (files: File[]) => void
  disabled?: boolean
  className?: string
}) {
  const [over, setOver] = useState(false)
  const hasFiles = (e: DragEvent) => !disabled && Array.from(e.dataTransfer.types).includes('Files')
  return (
    <div
      className={`${className}${over ? ' is-file-over' : ''}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        // Moving over a child leaves this element too; only really leaving counts.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        if (!hasFiles(e)) return
        e.preventDefault()
        onFiles(Array.from(e.dataTransfer.files))
      }}
    >
      {children}
    </div>
  )
}
