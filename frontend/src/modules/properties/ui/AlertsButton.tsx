import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n'
import type { TopbarCtx } from '../../ui'
import { fetchPropertyAlerts, type PortfolioAlerts } from '../api'

/** How long the header waits after a change before counting: a run of saves counts once. */
const ALERTS_DELAY_MS = 800

/**
 * ⚠ and the count in the header while rental objects have warnings to act on (ADR-030); opens
 * their list on the portfolio page. Hidden without any, and when the count cannot be read.
 */
export function AlertsButton({ meta, refreshKey, goTo }: TopbarCtx) {
  const { t } = useI18n()
  const [alerts, setAlerts] = useState<PortfolioAlerts | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      fetchPropertyAlerts().then(
        (a) => {
          if (!cancelled) setAlerts(a)
        },
        () => {
          if (!cancelled) setAlerts(null)
        },
      )
    }, ALERTS_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [meta, refreshKey])

  if (!alerts?.warnings) return null
  const label = t('properties.alerts.header', { count: alerts.warnings, objects: alerts.objects })
  return (
    <button type="button" className="topbar-alerts" title={label} aria-label={label} onClick={() => goTo('#/properties/alerts')}>
      ⚠ {alerts.warnings}
    </button>
  )
}
