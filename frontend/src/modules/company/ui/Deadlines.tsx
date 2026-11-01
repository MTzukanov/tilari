import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DueTile, DueTiles } from '../../../shared/DueTile'
import type { DeadlineView } from '../api'
import { deadlineStateText, deadlineTone } from './format'

export function DeadlineTiles({ deadlines }: { deadlines: DeadlineView[] }) {
  const { t } = useI18n()
  return (
    <DueTiles>
      {deadlines.map((d) => (
        <DueTile
          key={d.key}
          label={t(`company.deadline.${d.key}`)}
          due={t('company.deadlines.due', { date: formatDate(d.due) })}
          state={deadlineStateText(d, t)}
          tone={deadlineTone(d)}
        />
      ))}
    </DueTiles>
  )
}
