import { afterEach, describe, expect, it } from 'vitest'
import { markNativePickerAncestors } from './nativePicker'

describe('markNativePickerAncestors', () => {
  afterEach(() => {
    document.head.querySelector('style[data-test]')?.remove()
    document.body.innerHTML = ''
  })

  it('clears the class on blur although the class made the ancestor unclipped', () => {
    const style = document.createElement('style')
    style.dataset.test = ''
    style.textContent = '.scroll { overflow: auto } .is-native-picker-open { overflow: visible !important }'
    document.head.append(style)
    document.body.innerHTML = '<div class="app-shell"><div class="scroll"><input type="date"></div></div>'
    const input = document.querySelector('input')!
    const scroll = document.querySelector('.scroll')!

    markNativePickerAncestors(input, true)
    expect(scroll.classList.contains('is-native-picker-open')).toBe(true)
    markNativePickerAncestors(input, false)
    expect(scroll.classList.contains('is-native-picker-open')).toBe(false)
  })
})
