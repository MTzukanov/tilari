import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowLeave, setLeaveGuard, withoutLeaveGuard } from './leaveGuard'

describe('leaveGuard', () => {
  afterEach(() => {
    setLeaveGuard(null)
  })

  it('allows navigation when no guard is registered', () => {
    expect(allowLeave()).toBe(true)
  })

  it('asks the guard and can block', () => {
    const guard = vi.fn(() => false)
    setLeaveGuard(guard)
    expect(allowLeave()).toBe(false)
    expect(guard).toHaveBeenCalledOnce()
  })

  it('skips the guard inside withoutLeaveGuard', () => {
    const guard = vi.fn(() => false)
    setLeaveGuard(guard)
    expect(withoutLeaveGuard(() => allowLeave())).toBe(true)
    expect(guard).not.toHaveBeenCalled()
    expect(allowLeave()).toBe(false)
  })
})
