import { useEffect, useState } from 'react'
import { attachmentHref } from '../api'

export function AttachmentLink({
  id,
  children,
  className,
}: {
  id: number
  children: React.ReactNode
  className?: string
}) {
  const [href, setHref] = useState<string>('#')
  useEffect(() => {
    let cancelled = false
    void attachmentHref(id).then((url) => {
      if (!cancelled) setHref(url)
    })
    return () => {
      cancelled = true
    }
  }, [id])
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
