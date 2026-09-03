import { useCallback, useEffect, useState } from 'react'
import { fetchSettings } from '../../../api'
import { isPeriodLockedAtEnds } from '../../../book/modules/periodEnd/domain/fiscalPeriodLock'
import { isTaxBookingComplete } from '../../../book/modules/periodEnd/domain/yearEnd'
import {
  confirmStatement,
  unconfirmStatement,
  fetchClosing,
  fetchStatement,
  fetchStatementPrint,
  lockPeriod,
  unlockPeriod,
  type ClosingPlan,
  type StatementDoc,
} from '../api'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { AccrualDialog } from './AccrualDialog'
import { DepreciationDialog } from './DepreciationDialog'
import { NotesEditor } from './NotesEditor'
import { ModalShell } from './ModalShell'
import { TaxBookingDialog } from './TaxBookingDialog'
import { StatementStartWizard } from './StatementStartWizard'

type Panel = 'depreciation' | 'accrual' | 'tax' | 'notesStart' | 'notesEdit' | null

type Step = {
  key: string
  done: boolean
  action?: { label: string; run: () => void; disabled?: boolean }
  secondaryAction?: { label: string; run: () => void; disabled?: boolean }
}

/**
 * Year-end closing checklist. Step completion is derived from the
 * book itself (posted 9910/9920/9930 vouchers, lock date, `Tilikausi.json`), so
 * there is no separate progress table to keep in sync.
 */
export function YearEndWizard({
  ends,
  bookDate,
  onClose,
  onOpenVoucher,
  onBookChanged,
}: {
  ends: string
  /** Book "today" (practice clock when practice mode is on). */
  bookDate: string
  onClose: () => void
  onOpenVoucher: (id: number) => void
  /** Called after lock/unlock so the parent can refresh period status. */
  onBookChanged?: () => void
}) {
  const { t } = useI18n()
  const [plan, setPlan] = useState<ClosingPlan | null>(null)
  const [doc, setDoc] = useState<StatementDoc | null>(null)
  const [lockDate, setLockDate] = useState<string | null>(null)
  const [periodStarts, setPeriodStarts] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [closing, statement, settings] = await Promise.all([
        fetchClosing(ends),
        fetchStatement(ends),
        fetchSettings(),
      ])
      setPlan(closing)
      setDoc(statement)
      setLockDate(settings.lock_date)
      setPeriodStarts(settings.periods.find((p) => p.ends === ends)?.starts ?? null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [ends])

  useEffect(() => {
    void reload()
  }, [reload])

  const locked = isPeriodLockedAtEnds(lockDate, periodStarts)
  const confirmed = Boolean(doc?.confirmed_at)
  const future = ends > bookDate
  const frozen = confirmed
  const taxDone = plan ? isTaxBookingComplete(plan.tax.booked, plan.tax.stored) : false

  function openPanel(next: Panel) {
    if (frozen) return
    setPanel(next)
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function openPrintView() {
    const { html } = await fetchStatementPrint(ends)
    const win = window.open('', '_blank')
    if (!win) {
      setError(t('yearEnd.print.popupBlocked'))
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
  }

  async function downloadHtml() {
    const { html } = await fetchStatementPrint(ends)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `statement-${ends}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  const steps: Step[] = plan
    ? [
        { key: 'entries', done: !future },
        {
          key: 'depreciation',
          done: plan.depreciation.booked,
          action:
            !frozen && !plan.depreciation.booked
              ? {
                  label: t('yearEnd.step.depreciation.action'),
                  run: () => openPanel('depreciation'),
                  disabled: locked || busy,
                }
              : undefined,
        },
        {
          key: 'accrual',
          done: plan.accrual.booked,
          action:
            !frozen && !plan.accrual.booked
              ? {
                  label: t('yearEnd.step.accrual.action'),
                  run: () => openPanel('accrual'),
                  disabled: locked || busy,
                }
              : undefined,
        },
        { key: 'review', done: false },
        { key: 'reports', done: false },
        {
          key: 'tax',
          done: taxDone,
          action: !frozen
            ? {
                label: taxDone ? t('yearEnd.step.tax.review') : t('yearEnd.step.tax.action'),
                run: () => openPanel('tax'),
                disabled: busy || (locked && !taxDone),
              }
            : undefined,
        },
        {
          key: 'lock',
          done: locked,
          action: !locked && !confirmed
            ? {
                label: t('yearEnd.step.lock.action'),
                run: () =>
                  void withBusy(async () => {
                    const res = await lockPeriod(ends)
                    setLockDate(res.lock_date)
                    onBookChanged?.()
                  }),
                disabled: busy,
              }
            : undefined,
          secondaryAction:
            locked && !confirmed
              ? {
                  label: t('yearEnd.step.lock.unlock'),
                  run: () =>
                    void withBusy(async () => {
                      const res = await unlockPeriod(ends)
                      setLockDate(res.lock_date)
                      await reload()
                      onBookChanged?.()
                      const starts =
                        periodStarts ??
                        (await fetchSettings()).periods.find((p) => p.ends === ends)?.starts ??
                        null
                      if (isPeriodLockedAtEnds(res.lock_date, starts)) {
                        setError(t('yearEnd.step.lock.unlockFailed'))
                      }
                    }),
                  disabled: busy,
                }
              : undefined,
        },
        {
          key: 'notes',
          done: Boolean(doc?.drafted_at || doc?.has_pdf),
          action: !frozen
            ? {
                label: doc?.drafted_at
                  ? t('yearEnd.step.notes.edit')
                  : t('yearEnd.step.notes.action'),
                run: () => openPanel(doc?.drafted_at ? 'notesEdit' : 'notesStart'),
                disabled: busy,
              }
            : undefined,
          secondaryAction:
            !frozen && doc?.drafted_at
              ? {
                  label: t('yearEnd.notes.regenerate'),
                  run: () => openPanel('notesStart'),
                  disabled: busy,
                }
              : undefined,
        },
        {
          key: 'print',
          done: Boolean(doc?.drafted_at || doc?.has_pdf),
          action: doc?.drafted_at || doc?.has_pdf
            ? {
                label: t('yearEnd.step.print.action'),
                run: () => void withBusy(openPrintView),
                disabled: busy,
              }
            : undefined,
        },
        {
          key: 'confirm',
          done: confirmed,
          action: !confirmed
            ? {
                label: t('yearEnd.step.confirm.action'),
                run: () =>
                  void withBusy(async () => {
                    await confirmStatement(ends)
                    await reload()
                    onBookChanged?.()
                  }),
                disabled: busy || !locked || !(doc?.drafted_at || doc?.has_pdf),
              }
            : undefined,
          secondaryAction: confirmed
            ? {
                label: t('yearEnd.step.confirm.unconfirm'),
                run: () =>
                  void withBusy(async () => {
                    await unconfirmStatement(ends)
                    await reload()
                    onBookChanged?.()
                  }),
                disabled: busy,
              }
            : undefined,
        },
      ]
    : []

  const sectionAt = (index: number) => {
    if (index === 0) return t('yearEnd.section.prepare')
    if (index === 6) return t('yearEnd.section.compile')
    if (index === 9) return t('yearEnd.section.confirm')
    return null
  }

  return (
    <>
      <ModalShell
        title={t('yearEnd.title', { period: formatDate(ends) })}
        busy={busy}
        onClose={onClose}
        wide
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void withBusy(downloadHtml)}
              disabled={busy || !doc?.drafted_at}
            >
              {t('yearEnd.downloadHtml')}
            </button>
            <button type="button" className="btn-primary" onClick={onClose} disabled={busy}>
              {t('common.close')}
            </button>
          </>
        }
      >
        {error ? <p className="error">{error}</p> : null}
        {future ? <p className="warn-note">{t('yearEnd.futureWarning')}</p> : null}
        {locked ? (
          <p className="warn-note">
            {t('yearEnd.lockedNote')}{' '}
            <a href="#/settings">{t('yearEnd.openSettings')}</a>
          </p>
        ) : null}
        {locked && confirmed ? (
          <p className="warn-note">{t('yearEnd.lockedConfirmedNote')}</p>
        ) : null}
        {confirmed ? (
          <p className="warn-note">
            {t('yearEnd.confirmedAt', { date: formatDate(doc?.confirmed_at || '') })}{' '}
            {t('yearEnd.confirmedFrozen')}
          </p>
        ) : null}

        <ol className="year-end-steps">
          {steps.map((step, index) => {
            const heading = sectionAt(index)
            return (
              <li key={step.key} className={step.done ? 'done' : undefined}>
                {heading ? <h3 className="year-end-section">{heading}</h3> : null}
                <div className="year-end-step">
                  <span className="year-end-mark" aria-hidden="true">
                    {step.done ? '✓' : index + 1}
                  </span>
                  <div className="year-end-text">
                    <strong>{t(`yearEnd.step.${step.key}.title`)}</strong>
                    <p className="muted">{t(`yearEnd.step.${step.key}.help`)}</p>
                  </div>
                  {step.action || step.secondaryAction ? (
                    <div className="year-end-step-actions">
                      {step.action ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={step.action.run}
                          disabled={step.action.disabled}
                        >
                          {step.action.label}
                        </button>
                      ) : null}
                      {step.secondaryAction ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={step.secondaryAction.run}
                          disabled={step.secondaryAction.disabled}
                        >
                          {step.secondaryAction.label}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </ModalShell>

      {panel === 'depreciation' && plan ? (
        <DepreciationDialog
          ends={ends}
          lines={plan.depreciation.lines}
          onClose={() => setPanel(null)}
          onBooked={() => {
            setPanel(null)
            void reload()
          }}
        />
      ) : null}

      {panel === 'accrual' && plan ? (
        <AccrualDialog
          ends={ends}
          lines={plan.accrual.lines}
          taxReceivableCents={plan.accrual.tax_receivable_cents}
          onClose={() => setPanel(null)}
          onBooked={() => {
            setPanel(null)
            void reload()
          }}
        />
      ) : null}

      {panel === 'tax' && plan ? (
        <TaxBookingDialog
          ends={ends}
          tax={plan.tax}
          onClose={() => {
            setPanel(null)
            void reload()
          }}
          onBooked={() => {
            void reload()
          }}
          onOpenVoucher={(id) => {
            onOpenVoucher(id)
          }}
        />
      ) : null}

      {panel === 'notesStart' && doc ? (
        <StatementStartWizard
          ends={ends}
          doc={doc}
          onClose={() => setPanel(null)}
          onReady={(next) => {
            setDoc(next)
            setPanel(next.html ? 'notesEdit' : null)
          }}
        />
      ) : null}

      {panel === 'notesEdit' && doc ? (
        <NotesEditor
          ends={ends}
          doc={doc}
          onClose={() => setPanel(null)}
          onSaved={(next) => {
            setDoc(next)
            setPanel(null)
          }}
          onStartOver={() => setPanel('notesStart')}
        />
      ) : null}
    </>
  )
}
