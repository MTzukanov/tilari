import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type Opts = {
  minWidthPx?: number
  maxHeightPx?: number
  /** Menu element (e.g. when portaled outside the anchor). */
  menuRef?: RefObject<HTMLElement | null>
  /** Called when a scroll happens outside the menu (so the caller can close). */
  onScrollAway?: () => void
}

/** Position a dropdown with `position: fixed` so overflow parents cannot clip it. */
export function useFixedMenuStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  opts?: Opts,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>()
  const minWidthPx = opts?.minWidthPx ?? 0
  const maxHeightPx = opts?.maxHeightPx ?? 320
  const menuRef = opts?.menuRef
  const onScrollAway = opts?.onScrollAway

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(undefined)
      return
    }

    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const minWidth = Math.max(r.width, minWidthPx)
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      const openUp = spaceBelow < Math.min(maxHeightPx, 160) && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(maxHeightPx, openUp ? spaceAbove : spaceBelow))
      // Prefer content width (CSS max-content); only enforce a floor + viewport cap.
      let left = r.left
      const maxWidth = Math.min(window.innerWidth - 16, 640)
      if (left + minWidth > window.innerWidth - 8) left = window.innerWidth - minWidth - 8
      left = Math.max(8, left)
      setStyle({
        position: 'fixed',
        left,
        minWidth,
        width: 'max-content',
        maxWidth,
        maxHeight,
        zIndex: 4000,
        ...(openUp
          ? { bottom: window.innerHeight - r.top + 2, top: 'auto' }
          : { top: r.bottom + 2, bottom: 'auto' }),
      })
    }

    place()

    function onScroll(ev: Event) {
      const menu =
        menuRef?.current ||
        anchorRef.current?.querySelector('.is-fixed-menu') ||
        null
      const target = ev.target
      if (menu && target instanceof Node && menu.contains(target)) return
      onScrollAway?.()
    }

    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, menuRef, minWidthPx, maxHeightPx, onScrollAway])

  return style
}
