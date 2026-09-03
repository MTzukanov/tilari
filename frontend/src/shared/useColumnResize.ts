import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const MIN_PX = 48

function minFor(id: string, mins?: Record<string, number>) {
  return mins?.[id] ?? MIN_PX
}

function readStored(
  key: string,
  defaults: Record<string, number>,
  mins?: Record<string, number>,
): Record<string, number> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next = { ...defaults }
    for (const id of Object.keys(defaults)) {
      const n = Number(parsed[id])
      const floor = minFor(id, mins)
      if (Number.isFinite(n) && n >= floor) next[id] = n
    }
    return next
  } catch {
    return { ...defaults }
  }
}

function writeStored(key: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(key, JSON.stringify(widths))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Drag-to-resize table columns. Last column is omitted so it keeps leftover space. */
export function useColumnResize(
  storageKey: string,
  defaults: Record<string, number>,
  mins?: Record<string, number>,
) {
  const [widths, setWidths] = useState(() => readStored(storageKey, defaults, mins))
  const [dragging, setDragging] = useState<string | null>(null)
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  const onResizePointerDown = useCallback(
    (id: string, e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const floor = minFor(id, mins)
      const startX = e.clientX
      const startW = widthsRef.current[id] ?? defaults[id] ?? floor
      let current = startW
      setDragging(id)

      function onMove(ev: PointerEvent) {
        current = Math.max(floor, Math.round(startW + ev.clientX - startX))
        setWidths((prev) => ({ ...prev, [id]: current }))
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDragging(null)
        writeStored(storageKey, { ...widthsRef.current, [id]: current })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [defaults, mins, storageKey],
  )

  return { widths, dragging, onResizePointerDown }
}
