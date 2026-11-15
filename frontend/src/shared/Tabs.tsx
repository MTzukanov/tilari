import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PillTone } from './Pill'

/** A tab: its name, how many things it holds, and the tone of the worst open one there (docs/UI_PATTERNS.md). */
export type TabItem<K extends string> = {
  id: K
  label: string
  count?: number
  mark?: { tone: PillTone; title: string }
}

/**
 * A bar of tabs that switch the content below it, sticky at the top of the page. A count and a
 * coloured mark say what a closed tab holds, so it hides nothing. Arrow keys move between tabs.
 */
export function Tabs<K extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  label,
}: {
  tabs: TabItem<K>[]
  active: K
  onSelect: (id: K) => void
  /** Ties each tab to its `TabPanel`. */
  idPrefix: string
  label: string
}) {
  const bar = useRef<HTMLDivElement>(null)
  /** Tabs cut off at either end of a narrow bar: that end fades, so the bar reads as scrollable. */
  const [cut, setCut] = useState({ left: false, right: false })
  function measure() {
    const el = bar.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setCut((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }
  useEffect(() => {
    const el = bar.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // The active tab in sight: a narrow bar scrolls to it.
  useEffect(() => {
    const el = bar.current
    const tab = el?.querySelector<HTMLElement>(`#${idPrefix}-tab-${active}`)
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return
    el.scrollLeft = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2
    measure()
  }, [active, idPrefix])
  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = tabs.findIndex((tab) => tab.id === active)
    const next = tabs[(i + step + tabs.length) % tabs.length]
    onSelect(next.id)
    bar.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.id}`)?.focus()
  }
  return (
    <div
      ref={bar}
      className={`tabs${cut.left ? ' tabs-cut-left' : ''}${cut.right ? ' tabs-cut-right' : ''}`}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      onScroll={measure}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`${idPrefix}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          className={tab.id === active ? 'is-active' : ''}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {tab.count ? <span className="tabs-count">{tab.count}</span> : null}
          {tab.mark ? <span className={`tabs-mark tabs-mark-${tab.mark.tone}`} title={tab.mark.title} aria-label={tab.mark.title} /> : null}
        </button>
      ))}
    </div>
  )
}

/** A tab's content. Only the active one shows; the others stay mounted when `keep` (a form keeps its fields). */
export function TabPanel({
  id,
  idPrefix,
  active,
  keep,
  children,
}: {
  id: string
  idPrefix: string
  active: boolean
  keep?: boolean
  children: ReactNode
}) {
  if (!active && !keep) return null
  return (
    <div id={`${idPrefix}-panel-${id}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active} className="tab-panel">
      {children}
    </div>
  )
}
