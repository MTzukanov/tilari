import { deadlineAlerts } from '../../../book/modules/company/domain/deadlines'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { DeadlineView } from '../api'
import { deadlineStateText } from './format'

function stateClass(d: DeadlineView): string {
  return d.state === 'overdue' && !deadlineAlerts(d) ? 'company-deadline-old' : `company-deadline-${d.state}`
}

export function DeadlineTiles({ deadlines }: { deadlines: DeadlineView[] }) {
  const { t } = useI18n()
  return (
    <div className="company-deadlines">
      {deadlines.map((d) => (
        <div key={d.key} className={`company-deadline ${stateClass(d)}`}>
          <span className="company-deadline-label">{t(`company.deadline.${d.key}`)}</span>
          <strong>{formatDate(d.due)}</strong>
          <span className="company-deadline-state">{deadlineStateText(d, t)}</span>
        </div>
      ))}
    </div>
  )
}
