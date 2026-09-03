import { useI18n } from '../../../i18n'

export function ReportsHub({
  onOpenOverview,
  onOpenBalanceSheet,
  onOpenBalanceSheetItems,
  onOpenJournal,
  onOpenAllocations,
}: {
  onOpenOverview: () => void
  onOpenBalanceSheet: () => void
  onOpenBalanceSheetItems: () => void
  onOpenJournal: () => void
  onOpenAllocations: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="reports-hub">
      <h2>{t('reports.hubTitle')}</h2>
      <p className="muted">{t('reports.hubLead')}</p>
      <div className="hub-grid">
        <button type="button" className="hub-card" onClick={onOpenOverview}>
          <strong>{t('reports.hubOverview')}</strong>
          <span>{t('reports.hubOverviewHint')}</span>
        </button>
        <button type="button" className="hub-card" onClick={onOpenBalanceSheet}>
          <strong>{t('reports.hubBalance')}</strong>
          <span>{t('reports.hubBalanceHint')}</span>
        </button>
        <button type="button" className="hub-card" onClick={onOpenBalanceSheetItems}>
          <strong>{t('reports.hubItems')}</strong>
          <span>{t('reports.hubItemsHint')}</span>
        </button>
        <button type="button" className="hub-card" onClick={onOpenJournal}>
          <strong>{t('reports.hubJournal')}</strong>
          <span>{t('reports.hubJournalHint')}</span>
        </button>
        <button type="button" className="hub-card" onClick={onOpenAllocations}>
          <strong>{t('reports.hubCostCentres')}</strong>
          <span>{t('reports.hubCostCentresHint')}</span>
        </button>
      </div>
    </div>
  )
}
