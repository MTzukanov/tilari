import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DueTile, DueTiles } from '../../../shared/DueTile'
import type { DeadlineView } from '../api'
import { deadlineStateText, deadlineTone } from './format'

/**
 * `onSetHandled` puts a quiet link on a tile whose slot is not in the list, where "Ei tarvita" would be:
 * the deadline stands even when no document is kept for it.
 */
export function DeadlineTiles({
  deadlines,
  listed,
  onSetHandled,
}: {
  deadlines: DeadlineView[]
  listed?: (kind: string) => boolean
  onSetHandled?: (kind: string, value: boolean) => void
}) {
  const { t } = useI18n()
  const action = (d: DeadlineView) => {
    if (!onSetHandled || listed?.(d.kind) !== false || d.state === 'done') return null
    const handled = d.state === 'not_needed'
    return (
      <button type="button" className="btn-link btn-quiet" onClick={() => onSetHandled(d.kind, !handled)}>
        {t(handled ? 'company.deadlines.unmark' : 'company.deadlines.markHandled')}
      </button>
    )
  }
  return (
    <DueTiles>
      {deadlines.map((d) => (
        <DueTile
          key={d.key}
          label={t(`company.deadline.${d.key}`)}
          due={t('company.deadlines.due', { date: formatDate(d.due) })}
          state={deadlineStateText(d, t)}
          tone={deadlineTone(d)}
          action={action(d)}
        />
      ))}
    </DueTiles>
  )
}
