import { useEffect, useState } from 'react'
import { attachmentHref } from '../api'

/**
 * Link to an attachment. By default the URL is resolved on render; `lazy` resolves it on
 * click, for long lists where loading every blob up front would be slow.
 */
export function AttachmentLink({
  id,
  children,
  className,
  lazy = false,
}: {
  id: number
  children: React.ReactNode
  className?: string
  lazy?: boolean
}) {
  const [href, setHref] = useState<string>('#')
  useEffect(() => {
    if (lazy) return
    let cancelled = false
    void attachmentHref(id).then((url) => {
      if (!cancelled) setHref(url)
    })
    return () => {
      cancelled = true
    }
  }, [id, lazy])
  if (lazy) {
    return (
      <a
        className={className}
        href="#"
        onClick={(e) => {
          e.preventDefault()
          // Open synchronously (popup blockers), then point the tab at the resolved URL.
          const win = window.open('', '_blank')
          void attachmentHref(id).then(
            (url) => {
              if (win) win.location.href = url
              else window.open(url, '_blank', 'noopener')
            },
            () => win?.close(),
          )
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
