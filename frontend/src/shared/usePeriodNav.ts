import { useEffect, useMemo, useState } from 'react'
import type { Period } from '../api'
import {
  allTimeRange,
  monthRange,
  parseISO,
  periodForRange,
  shiftMonth,
  shiftPeriod,
  type NavMode,
} from './periodNav'

export function usePeriodNav(
  periods: Period[],
  initialStartDate: string,
  initialEndDate: string,
  resetKey?: string | number,
) {
  const [mode, setMode] = useState<NavMode>('year')
  const [start_date, setStartDate] = useState(initialStartDate)
  const [end_date, setEndDate] = useState(initialEndDate)

  useEffect(() => {
    setMode('year')
    setStartDate(initialStartDate)
    setEndDate(initialEndDate)
  }, [initialStartDate, initialEndDate, resetKey])

  const canPrev = useMemo(() => {
    if (mode === 'all') return false
    if (mode === 'month') {
      const prev = shiftMonth(start_date, false)
      return periodForRange(periods, prev.starts, prev.ends) != null
    }
    return shiftPeriod(periods, start_date, end_date, false) != null
  }, [mode, start_date, end_date, periods])

  const canNext = useMemo(() => {
    if (mode === 'all') return false
    if (mode === 'month') {
      const next = shiftMonth(start_date, true)
      return periodForRange(periods, next.starts, next.ends) != null
    }
    return shiftPeriod(periods, start_date, end_date, true) != null
  }, [mode, start_date, end_date, periods])

  function applyRange(r: { starts: string; ends: string }) {
    setStartDate(r.starts)
    setEndDate(r.ends)
  }

  function defaultYearRange(): { starts: string; ends: string } | null {
    const period =
      periodForRange(periods, initialStartDate, initialEndDate) ??
      (periods.length
        ? [...periods].sort((a, b) => (a.starts < b.starts ? -1 : 1))[periods.length - 1]
        : null)
    return period ? { starts: period.starts, ends: period.ends } : null
  }

  function selectMode(next: NavMode) {
    if (next === 'all') {
      const range = allTimeRange(periods)
      if (!range) return
      applyRange(range)
      setMode('all')
      return
    }

    if (next === 'month') {
      const anchor = mode === 'all' ? initialEndDate : end_date
      applyRange(monthRange(parseISO(anchor)))
      setMode('month')
      return
    }

    const periodRange = defaultYearRange()
    if (!periodRange) return
    applyRange(periodRange)
    setMode('year')
  }

  function goPrev() {
    if (mode === 'all') return
    if (mode === 'month') {
      applyRange(shiftMonth(start_date, false))
      return
    }
    const r = shiftPeriod(periods, start_date, end_date, false)
    if (r) applyRange(r)
  }

  function goNext() {
    if (mode === 'all') return
    if (mode === 'month') {
      applyRange(shiftMonth(start_date, true))
      return
    }
    const r = shiftPeriod(periods, start_date, end_date, true)
    if (r) applyRange(r)
  }

  function selectRange(starts: string, ends: string) {
    applyRange({ starts, ends })
  }

  return {
    mode,
    start_date,
    end_date,
    canPrev,
    canNext,
    selectMode,
    selectRange,
    goPrev,
    goNext,
  }
}
