import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Text that shrinks to fit its box (one line), down to `minScale` of the CSS font size.
 * Measured in the browser, so it follows the user's font choice and the UI language.
 */
export function FitText({ children, className, minScale = 0.7 }: { children: ReactNode; className?: string; minScale?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const base = parseFloat(getComputedStyle(el).fontSize)
      const box = el.clientWidth
      if (!base || !box || el.scrollWidth <= box) return
      const scale = Math.max(minScale, box / el.scrollWidth)
      el.style.fontSize = `${(base * scale).toFixed(2)}px`
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(el.parentElement ?? el)
    return () => observer?.disconnect()
  }, [children, minScale])
  return (
    <span ref={ref} className={['fit-text', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
