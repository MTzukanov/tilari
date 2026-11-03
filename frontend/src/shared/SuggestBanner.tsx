import type { ReactNode } from 'react'

/**
 * The blue banner of suggestions from the book: a title and a line on where they come from, one
 * action for all of them at the far side (add them all, or review them), and the suggestions below.
 */
export function SuggestBanner({
  title,
  lead,
  action,
  heading: Heading = 'h3',
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  /** `h4` inside a panel that has its own `h3`. */
  heading?: 'h3' | 'h4'
  children?: ReactNode
}) {
  return (
    <section className="suggest-banner">
      <div className="suggest-banner-head">
        <div>
          <Heading className="suggest-banner-title">{title}</Heading>
          {lead ? <p className="suggest-banner-lead">{lead}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
