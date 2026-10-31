import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n'
import type { TopbarCtx } from '../../ui'
import { fetchCompanyAlerts } from '../api'

/** How long the header waits after a change before counting: a run of saves counts once. */
const ALERTS_DELAY_MS = 800

/**
 * ⚑ and the count in the header while company deadlines are near or missed (ADR-031); opens the
 * company page. Hidden without any, and when the count cannot be read.
 */
export function DeadlinesButton({ meta, refreshKey, goTo }: TopbarCtx) {
  const { t } = useI18n()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      fetchCompanyAlerts().then(
        (a) => {
          if (!cancelled) setCount(a.deadlines)
        },
        () => {
          if (!cancelled) setCount(0)
        },
      )
    }, ALERTS_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [meta, refreshKey])

  if (!count) return null
  const label = t('company.alerts.header', { count })
  return (
    <button type="button" className="topbar-deadlines" title={label} aria-label={label} onClick={() => goTo('#/company')}>
      ⚑ {count}
    </button>
  )
}
