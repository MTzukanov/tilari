import type { ReactNode } from 'react'
import { Pill } from './Pill'

export type DueTone = 'neutral' | 'ok' | 'warn' | 'crit'

/** A row of tiles; they share the width and wrap. */
export function DueTiles({ children }: { children: ReactNode }) {
  return <div className="due-tiles">{children}</div>
}

/** Something with a due day: what, when and how it stands, as a pill with the same colour on the edge. */
export function DueTile({
  label,
  due,
  state,
  tone = 'neutral',
  action,
  onOpen,
}: {
  label: string
  due: string
  state: string
  tone?: DueTone
  /** A quiet link after the state. Not with `onOpen`: the whole tile is a button then. */
  action?: ReactNode
  onOpen?: () => void
}) {
  const body = (
    <>
      <span className="due-tile-label">{label}</span>
      <span className="due-tile-meta">
        <span className="num-text">{due}</span>
        <Pill tone={tone}>{state}</Pill>
        {action}
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
