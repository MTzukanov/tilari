import { useEffect, useRef } from 'react'

type LeaveGuard = () => boolean

let guard: LeaveGuard | null = null
let bypassDepth = 0

export function setLeaveGuard(next: LeaveGuard | null) {
  guard = next
}

/** Skip the leave prompt for an already-confirmed in-editor navigation (save, cancel, neighbor). */
export function withoutLeaveGuard<T>(fn: () => T): T {
  bypassDepth++
  try {
    return fn()
  } finally {
    bypassDepth--
  }
}

export function allowLeave(): boolean {
  if (bypassDepth > 0 || !guard) return true
  return guard()
}

export function locationHash(): string {
  return window.location.hash || '#/'
}

export function restoreLocationHash(hash: string) {
  const url = new URL(window.location.href)
  url.hash = hash
  history.replaceState(history.state, '', url.href)
}

/** Prompt before hash navigation while `blocked` is true (unsaved voucher edits). */
export function useLeaveGuard(blocked: boolean, message: string) {
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked
  const messageRef = useRef(message)
  messageRef.current = message

  useEffect(() => {
    setLeaveGuard(() => {
      if (!blockedRef.current) return true
      return window.confirm(messageRef.current)
    })
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!blockedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      setLeaveGuard(null)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])
}
