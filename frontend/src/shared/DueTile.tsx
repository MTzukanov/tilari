import type { ReactNode } from 'react'

export type DueTone = 'neutral' | 'ok' | 'warn' | 'crit'

/** A row of tiles; they share the width and wrap. */
export function DueTiles({ children }: { children: ReactNode }) {
  return <div className="due-tiles">{children}</div>
}

/** Something with a due day: what, when and how it stands, with the colour on its edge. */
export function DueTile({
  label,
  due,
  state,
  tone = 'neutral',
  onOpen,
}: {
  label: string
  due: string
  state: string
  tone?: DueTone
  onOpen?: () => void
}) {
  const body = (
    <>
      <span className="due-tile-label">{label}</span>
      <span className="due-tile-meta">
        <span className="num-text">{due}</span>
        <span className="due-tile-state">{state}</span>
      </span>
    </>
  )
  const className = `due-tile due-tile-${tone}`
  if (!onOpen) return <div className={className}>{body}</div>
  return (
    <button type="button" className={className} onClick={onOpen}>
      {body}
    </button>
  )
}
