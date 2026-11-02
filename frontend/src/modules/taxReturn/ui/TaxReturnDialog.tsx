import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n'
import { lockBodyScroll } from '../../../shared/scrollLock'
import { fetchTaxReturn, saveTaxReturnInputs, saveTaxReturnMapping, saveTaxReturnTerms, type DebtTerm, type Target, type TaxReturnInputs, type TaxReturnView } from '../api'
import { Checks } from './Checks'
import { FactsTab } from './FactsTab'
import { FiguresTab } from './FiguresTab'
import { FileTab } from './FileTab'
import { FormsTab } from './FormsTab'
import { formatDay } from './format'
import { anchorId, type Jump, type Tab } from './jump'

/** What the company page knows about this period's documents. */
export type PeriodDocuments = { statements: boolean; audit_report: boolean; minutes: boolean }

/** Keeps the calculation with the period's tax return documents, dated `today`. */
export type CalculationStore = { today: string; store: (file: File, title: string) => Promise<void> }

const TABS: Tab[] = ['figures', 'facts', 'forms', 'file']

export function TaxReturnDialog({
  ends,
  documents,
  calculation,
  onClose,
}: {
  ends: string
  documents: PeriodDocuments
  calculation?: CalculationStore
  onClose: () => void
}) {
  const { t } = useI18n()
  const [view, setView] = useState<TaxReturnView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('figures')
  const [jump, setJump] = useState<(Jump & { n: number }) | null>(null)

  const go = useCallback((target: Jump) => {
    setTab(target.tab)
    setJump((old) => ({ ...target, n: (old?.n ?? 0) + 1 }))
  }, [])

  // Runs after the tab has rendered, so the place exists; rows it names open themselves.
  useEffect(() => {
    if (!jump) return
    const place = document.getElementById(anchorId(jump.to))
    if (!place) return
    place.scrollIntoView({ block: 'start', behavior: 'smooth' })
    place.focus({ preventScroll: true })
  }, [jump])

  useEffect(() => lockBodyScroll(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let live = true
    fetchTaxReturn(ends)
      .then((next) => {
        if (live) setView(next)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      live = false
    }
  }, [ends])

  const run = useCallback(async (task: Promise<TaxReturnView>) => {
    setError(null)
    try {
      setView(await task)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const saveInputs = useCallback((inputs: TaxReturnInputs) => run(saveTaxReturnInputs(ends, inputs)), [ends, run])
  const placeAccount = useCallback((account: number, target: Target | null) => run(saveTaxReturnMapping(ends, { [account]: target })), [ends, run])
  const setTerm = useCallback((account: number, term: DebtTerm) => run(saveTaxReturnTerms(ends, { [account]: term })), [ends, run])

  return createPortal(
    <div
      className="vat-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="vat-dialog vat-dialog-wide tax-return-dialog" role="dialog" aria-modal="true" aria-labelledby="tax-return-title">
        <header className="vat-dialog-head">
          <h2 id="tax-return-title">{t('taxReturn.title', { date: formatDay(ends) })}</h2>
          <div className="tax-return-tabs" role="tablist">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`tax-return-tab${tab === key ? ' tax-return-tab-active' : ''}`}
                onClick={() => setTab(key)}
              >
                {t(`taxReturn.tab.${key}`)}
              </button>
            ))}
          </div>
        </header>
        <div key={tab} className="vat-dialog-body tax-return-body">
          {error ? <p className="error">{error}</p> : null}
          {!view && !error ? <p className="muted">{t('taxReturn.loading')}</p> : null}
          {view && (tab === 'figures' || tab === 'file') ? <Checks view={view} onJump={go} /> : null}
          {view && tab === 'figures' ? (
            <FiguresTab view={view} documents={documents} calculation={calculation} opened={jump} onJump={go} onSaveInputs={saveInputs} onPlaceAccount={placeAccount} onTerm={setTerm} />
          ) : null}
          {view && tab === 'facts' ? <FactsTab view={view} onSave={saveInputs} /> : null}
          {view && tab === 'forms' ? <FormsTab view={view} onSave={saveInputs} onJump={go} /> : null}
          {view && tab === 'file' ? <FileTab view={view} onJump={go} /> : null}
        </div>
        <footer className="vat-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
