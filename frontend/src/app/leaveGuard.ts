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

const HISTORY_INDEX_KEY = 'tilariHistoryIndex'

/** Position tag of the current history entry (null for an entry the app has not seen yet). */
export function historyIndex(): number | null {
  const state = history.state as Record<string, unknown> | null
  const value = state?.[HISTORY_INDEX_KEY]
  return typeof value === 'number' ? value : null
}

/** Tag the current entry with its position; the URL is unchanged. */
export function tagHistoryIndex(index: number): void {
  const state = (history.state as Record<string, unknown> | null) ?? {}
  history.replaceState({ ...state, [HISTORY_INDEX_KEY]: index }, '')
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
