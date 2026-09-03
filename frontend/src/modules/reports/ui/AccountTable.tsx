import { useState } from 'react'
import type { BalanceLine } from '../../../api'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { SectionToggle } from '../../../shared/SectionToggle'
import { TypeTag } from '../../../shared/TypeTag'

export function AccountTable({
  title,
  lines,
  emptyLabel,
  showTotal = true,
  collapsible = false,
  onSelect,
}: {
  title: string
  lines: BalanceLine[]
  emptyLabel: string
  showTotal?: boolean
  collapsible?: boolean
  onSelect: (line: BalanceLine) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const total = lines.reduce((sum, line) => sum + line.balance_cents, 0)
  const showBody = !collapsible || open

  return (
    <section className="report">
      {collapsible ? (
        <SectionToggle title={title} open={open} onToggle={() => setOpen((v) => !v)} />
      ) : (
        <h2>{title}</h2>
      )}
      {showBody ? (
        lines.length === 0 ? (
          <p className="empty">{emptyLabel}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="num">{t('table.account')}</th>
                <th>{t('table.name')}</th>
                <th className="amount">{t('table.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.number}
                  className="clickable"
                  tabIndex={0}
                  onClick={() => onSelect(line)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(line)
                    }
                  }}
                >
                  <td className="num">{line.number}</td>
                  <td>
                    {line.name || <span className="muted">-</span>}
                    <TypeTag type={line.type} />
                  </td>
                  <td className={`amount ${line.balance_cents < 0 ? 'neg' : ''}`}>
                    {formatCents(line.balance_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            {showTotal ? (
              <tfoot>
                <tr>
                  <td colSpan={2}>{t('table.total')}</td>
                  <td className={`amount ${total < 0 ? 'neg' : ''}`}>{formatCents(total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        )
      ) : null}
    </section>
  )
}
