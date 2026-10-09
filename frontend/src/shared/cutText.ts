import type { MouseEvent } from 'react'

/** Marks a title this module set, so it can be taken away again (an element's own title stays). */
const MARK = 'cutText'

function isCut(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1
}

/**
 * `onMouseOver` for tables whose columns cut text with an ellipsis: while the pointer is over a
 * cell, the element whose text is cut off (the cell or a span inside it) gets its full text as
 * hover text. Elements that carry their own title keep it.
 */
export function showCutText(event: MouseEvent<HTMLElement>): void {
  const target = event.target as Element
  const cell = target.closest('td, th')
  if (!(cell instanceof HTMLElement)) return
  // An icon (SVG) inside a cell: start from the first HTML element around it.
  let start: Element | null = target
  while (start && !(start instanceof HTMLElement)) start = start.parentElement
  let el = start as HTMLElement | null
  while (el) {
    const ours = el.dataset[MARK] != null
    if (el.title && !ours) return
    const text = el.textContent?.trim() ?? ''
    if (text && isCut(el)) {
      el.title = text
      el.dataset[MARK] = ''
      return
    }
    if (ours) {
      el.removeAttribute('title')
      delete el.dataset[MARK]
    }
    if (el === cell) return
    el = el.parentElement
  }
}
