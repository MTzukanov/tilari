import type { FocusEventHandler } from 'react'

const PICKER_OPEN = 'is-native-picker-open'

/** Walk overflow ancestors and mark them so native date/file UI is not clipped. */
export function markNativePickerAncestors(from: HTMLElement, on: boolean) {
  let el: HTMLElement | null = from.parentElement
  while (el && !el.classList.contains('app-shell')) {
    const style = window.getComputedStyle(el)
    const clip =
      /auto|hidden|scroll|clip/.test(style.overflow) ||
      /auto|hidden|scroll|clip/.test(style.overflowY) ||
      /auto|hidden|scroll|clip/.test(style.overflowX)
    if (clip) {
      if (on) el.classList.add(PICKER_OPEN)
      else el.classList.remove(PICKER_OPEN)
    }
    el = el.parentElement
  }
}

export function nativePickerFocusProps(lang?: string): {
  lang?: string
  onFocus: FocusEventHandler<HTMLInputElement>
  onBlur: FocusEventHandler<HTMLInputElement>
} {
  return {
    ...(lang ? { lang } : {}),
    onFocus: (e) => markNativePickerAncestors(e.currentTarget, true),
    onBlur: (e) => markNativePickerAncestors(e.currentTarget, false),
  }
}
