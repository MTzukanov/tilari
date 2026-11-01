import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A card that opens in place: name, a short line, and badges that say how it stands while closed.
 * The owner keeps which one is open, in the address where a voucher has to come back to it.
 */
export function Binder({
  label,
  sub,
  badges,
  open,
  scrollKey = null,
  onToggle,
  children,
}: {
  label: ReactNode
  sub?: ReactNode
  badges?: ReactNode
  open: boolean
  /**
   * Not null: brings the card to the top when it opens, as closing the one above would move it away,
   * and whenever this changes while it is open.
   */
  scrollKey?: number | null
  onToggle: () => void
  children?: ReactNode
}) {
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    if (open && scrollKey != null) card.current?.scrollIntoView({ block: 'start' })
  }, [open, scrollKey])
  return (
    <section ref={card} className={`binder${open ? ' is-open' : ''}`}>
      <button type="button" className="binder-head" aria-expanded={open} onClick={onToggle}>
        <span className="binder-label">{label}</span>
        <span className="binder-sub">{sub}</span>
        <svg className="binder-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        {badges ? <span className="binder-badges">{badges}</span> : null}
      </button>
      {open ? <div className="binder-body">{children}</div> : null}
    </section>
  )
}
