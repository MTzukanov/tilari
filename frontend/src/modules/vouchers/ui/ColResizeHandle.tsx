import type { PointerEvent as ReactPointerEvent } from 'react'

export function ColResizeHandle({
  id,
  dragging,
  label,
  onPointerDown,
}: {
  id: string
  dragging: string | null
  label: string
  onPointerDown: (id: string, e: ReactPointerEvent) => void
}) {
  return (
    <span
      className={`col-resize${dragging === id ? ' is-resizing' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(e) => onPointerDown(id, e)}
      onClick={(e) => e.stopPropagation()}
    />
  )
}
