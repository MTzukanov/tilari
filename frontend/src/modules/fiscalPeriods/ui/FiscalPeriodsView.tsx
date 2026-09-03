import { useCallback, useEffect, useState } from 'react'
import { fetchFiscalPeriods, saveFiscalPeriod, type FiscalPeriodSummary } from '../api'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { ClosingWizard } from '../../periodEnd'

type EditState = {
  replaceStarts: string | null
  starts: string
  ends: string
  headcount: string
}

/** Next calendar year starting the day after the latest period ends. */
function suggestNextPeriod(
  periods: FiscalPeriodSummary[],
  today: string,
): { starts: string; ends: string } {
  const last = periods.at(-1)
  if (!last) {
    const year = Number(today.slice(0, 4)) || new Date().getFullYear()
    return { starts: `${year}-01-01`, ends: `${year}-12-31` }
  }
  const start = new Date(`${last.ends}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() + 1)
  const end = new Date(start)
  end.setUTCFullYear(end.getUTCFullYear() + 1)
  end.setUTCDate(end.getUTCDate() - 1)
  return { starts: start.toISOString().slice(0, 10), ends: end.toISOString().slice(0, 10) }
}

export function FiscalPeriodsView({
  initialWizardEnds = null,
  bookDate,
  onOpenVoucher,
}: {
  initialWizardEnds?: string | null
  bookDate: string
  onOpenVoucher: (id: number, periodEnds: string) => void
}) {
  const { t } = useI18n()
  const [periods, setPeriods] = useState<FiscalPeriodSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [wizardFor, setWizardFor] = useState<string | null>(initialWizardEnds)
  const [error, setError] = useState<string | null>(null)

  function openWizard(ends: string) {
    window.location.hash = `#/fiscal-periods/${ends}/closing`
    setWizardFor(ends)
    setSelected(ends)
  }

  function closeWizard() {
    window.location.hash = '#/fiscal-periods'
    setWizardFor(null)
  }

  useEffect(() => {
    setWizardFor(initialWizardEnds ?? null)
    if (initialWizardEnds) setSelected(initialWizardEnds)
  }, [initialWizardEnds])

  const reload = useCallback(async () => {
    try {
      const res = await fetchFiscalPeriods()
      setPeriods(res.periods)
      setSelected((prev) => prev ?? res.periods.at(-1)?.ends ?? null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const current = periods.find((p) => p.ends === selected) ?? null

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    try {
      await saveFiscalPeriod(edit.starts, edit.ends, {
        replace_starts: edit.replaceStarts,
        headcount: edit.headcount === '' ? null : Number(edit.headcount),
      })
      setEdit(null)
      setSelected(edit.ends)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function statusLabel(p: FiscalPeriodSummary): string {
    if (p.status === 'confirmed') {
      return t('fiscal.status.confirmed', { date: formatDate(p.confirmed_at || '') })
    }
    if (p.status === 'inProgress') return t('fiscal.status.inProgress')
    if (p.status === 'opening') return t('fiscal.status.opening')
    if (p.status === 'due') return t('fiscal.status.due')
    return '—'
  }

  return (
    <div className="ledger">
      <header className="ledger-head">
        <div className="ledger-head-main">
          <h2>{t('fiscal.title')}</h2>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}

      <table className="ledger-table zebra fiscal-table">
        <thead>
          <tr>
            <th>{t('fiscal.period')}</th>
            <th className="amount">{t('fiscal.balance')}</th>
            <th className="amount">{t('fiscal.turnover')}</th>
            <th className="amount">{t('fiscal.profit')}</th>
            <th>{t('fiscal.closing')}</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr
              key={p.starts}
              className={`clickable${p.ends === selected ? ' selected' : ''}`}
              tabIndex={0}
              aria-selected={p.ends === selected}
              onClick={() => setSelected(p.ends)}
              onDoubleClick={() => openWizard(p.ends)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelected(p.ends)
                }
              }}
            >
              <td className="num">
                {p.locked ? <span title={t('fiscal.locked')}>🔒 </span> : null}
                {formatDate(p.starts)} – {formatDate(p.ends)}
                {p.mismatch ? (
                  <span className="fiscal-warn" title={t('fiscal.mismatchHelp')}>
                    {' '}
                    ⚠ {t('fiscal.mismatch')}
                  </span>
                ) : null}
              </td>
              <td className="amount">{formatCents(p.balance_cents)}</td>
              <td className="amount">{formatCents(p.turnover_cents)}</td>
              <td className="amount">{formatCents(p.profit_cents)}</td>
              <td>{statusLabel(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!periods.length ? <p className="muted">{t('fiscal.empty')}</p> : null}

      <div className="fiscal-toolbar">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const next = suggestNextPeriod(periods, bookDate)
            setEdit({ replaceStarts: null, ...next, headcount: '' })
          }}
        >
          {t('fiscal.new')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!current}
          onClick={() =>
            current &&
            setEdit({
              replaceStarts: current.starts,
              starts: current.starts,
              ends: current.ends,
              headcount: current.headcount == null ? '' : String(current.headcount),
            })
          }
        >
          {t('fiscal.edit')}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!current}
          onClick={() => current && openWizard(current.ends)}
        >
          {t('fiscal.closingAction')}
        </button>
      </div>

      {edit ? (
        <form className="editor editor-card fiscal-edit" onSubmit={submitEdit}>
          <h3>{edit.replaceStarts ? t('fiscal.editTitle') : t('fiscal.newTitle')}</h3>
          <div className="form-grid">
            <label>
              {t('fiscal.starts')}
              <input
                type="date"
                required
                value={edit.starts}
                onChange={(e) => setEdit({ ...edit, starts: e.target.value })}
              />
            </label>
            <label>
              {t('fiscal.ends')}
              <input
                type="date"
                required
                value={edit.ends}
                onChange={(e) => setEdit({ ...edit, ends: e.target.value })}
              />
            </label>
            <label>
              {t('fiscal.headcount')}
              <input
                type="number"
                min={0}
                value={edit.headcount}
                onChange={(e) => setEdit({ ...edit, headcount: e.target.value })}
              />
            </label>
          </div>
          <div className="fiscal-edit-actions">
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      ) : null}

      {wizardFor ? (
        <ClosingWizard
          ends={wizardFor}
          bookDate={bookDate}
          onClose={() => {
            closeWizard()
            void reload()
          }}
          onOpenVoucher={(id) => onOpenVoucher(id, wizardFor)}
          onBookChanged={() => void reload()}
        />
      ) : null}
    </div>
  )
}
