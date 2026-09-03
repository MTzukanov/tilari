/** Reference-counted body scroll lock for stacked modals. */
let lockCount = 0
let savedOverflow = ''

export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow
    }
  }
}

/** Clear a stuck lock after navigation (e.g. modal unmounted without cleanup). */
export function resetBodyScrollLock(): void {
  lockCount = 0
  savedOverflow = ''
  document.body.style.removeProperty('overflow')
}
