import { describe, expect, it } from 'vitest'
import { lockBodyScroll, resetBodyScrollLock } from './scrollLock'

describe('scrollLock', () => {
  it('locks and unlocks the body once', () => {
    document.body.style.overflow = ''
    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    release()
    expect(document.body.style.overflow).toBe('')
  })

  it('supports nested locks', () => {
    document.body.style.overflow = ''
    const outer = lockBodyScroll()
    const inner = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    inner()
    expect(document.body.style.overflow).toBe('hidden')
    outer()
    expect(document.body.style.overflow).toBe('')
  })

  it('reset clears a stuck lock', () => {
    document.body.style.overflow = ''
    lockBodyScroll()
    resetBodyScrollLock()
    expect(document.body.style.overflow).toBe('')
  })
})
