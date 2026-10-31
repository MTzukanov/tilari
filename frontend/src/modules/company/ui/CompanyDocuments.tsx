import { useMemo, useState } from 'react'
import { useI18n } from '../../../i18n'
import { AttachmentLink } from '../../../shared/AttachmentLink'
import { formatDate } from '../../../shared/dates'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { COMPANY_KINDS, PERIOD_KINDS, type CompanyOverview, type DocCandidate, type DocumentView } from '../api'
import { periodShort, useCompany, type T } from './format'
import { AttachSelect, UnlinkedRow, type SlotActions } from './Slot'

const ALL = ''
const COMPANY_LEVEL = 'company'

function periodName(doc: DocumentView, overview: CompanyOverview, t: T): string {
  if (doc.period_ends == null) return t('company.documents.companyLevel')
  const period = overview.periods.find((p) => p.ends === doc.period_ends)
  return period ? periodShort(period) : doc.period_ends
}

function columns(overview: CompanyOverview, t: T): TableColumn<DocumentView>[] {
  return [
    { id: 'date', label: t('company.documents.col.date'), width: 100, sortValue: (d) => d.date ?? '', render: (d) => formatDate(d.date) },
    { id: 'period', label: t('company.documents.col.period'), width: 90, sortValue: (d) => d.period_ends ?? '', render: (d) => periodName(d, overview, t) },
    { id: 'kind', label: t('company.documents.col.kind'), width: 230, sortValue: (d) => t(`company.kind.${d.kind}`), render: (d) => t(`company.kind.${d.kind}`) },
    {
      id: 'title',
      label: t('company.documents.col.title'),
      width: 300,
      sortValue: (d) => d.title,
      render: (d) => d.title || (d.state === 'missing' ? t('company.link.gone', { id: d.voucher_id }) : ''),
    },
    {
      id: 'files',
      label: t('company.documents.col.files'),
      width: 260,
      render: (d) => (
        // A file opens itself; the rest of the row opens the voucher.
        <span onClick={(e) => e.stopPropagation()}>
          {d.files.map((f) => (
            <AttachmentLink key={f.id} id={f.id} lazy className="property-attachment company-file">
              {f.name}
            </AttachmentLink>
          ))}
        </span>
      ),
    },
    {
      id: 'state',
      label: t('company.documents.col.state'),
      width: 130,
      sortValue: (d) => d.state,
      render: (d) => (d.state === 'ok' ? '' : t(`company.link.state.${d.state}`)),
    },
  ]
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

/** Picks the owner of an unlinked document first: a period or the company; then its kind links it. */
function UnlinkedAttach({
  candidate,
  overview,
  actions,
  onError,
}: {
  candidate: DocCandidate
  overview: CompanyOverview
  actions: SlotActions
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const lastEnded = overview.periods.find((p) => p.ends < candidate.date)
  const [owner, setOwner] = useState(lastEnded?.ends ?? COMPANY_LEVEL)
  const periodEnds = owner === COMPANY_LEVEL ? null : owner
  return (
    <>
      <select aria-label={t('company.unlinked.pickOwner')} value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value={COMPANY_LEVEL}>{t('company.documents.companyLevel')}</option>
        {overview.periods.map((p) => (
          <option key={p.ends} value={p.ends}>
            {periodShort(p)}
          </option>
        ))}
      </select>
      <AttachSelect
        candidate={candidate}
        kinds={periodEnds == null ? COMPANY_KINDS : PERIOD_KINDS}
        periodEnds={periodEnds}
        kindLabel={(kind) => t(`company.kind.${kind}`)}
        actions={actions}
        onError={onError}
      />
    </>
  )
}

/** `#/company/documents`: every linked document, searchable, and the documents linked nowhere. */
export function CompanyDocuments({
  today,
  onBack,
  onOpenVoucher,
}: {
  today: string | undefined
  onBack: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const { data, error, loading, apply, refresh } = useCompany(today)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState(ALL)
  const [period, setPeriod] = useState(ALL)
  const [rowError, setRowError] = useState<string | null>(null)
  const actions: SlotActions = { apply, refresh, onOpenVoucher }

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.documents.filter((d) => {
      if (kind !== ALL && d.kind !== kind) return false
      if (period === COMPANY_LEVEL ? d.period_ends != null : period !== ALL && d.period_ends !== period) return false
      if (!q) return true
      const text = [d.title, t(`company.kind.${d.kind}`), periodName(d, data, t), formatDate(d.date), ...d.files.map((f) => f.name)].join(' ')
      return matches(text, q)
    })
  }, [data, query, kind, period, t])

  const kindOptions = [...new Set<string>([...PERIOD_KINDS, ...COMPANY_KINDS])]

  return (
    <section className="company-page">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.company')}
      </button>
      <h2>{t('company.documents.title')}</h2>
      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {data ? (
        <>
          <div className="company-filters">
            <input
              type="search"
              aria-label={t('company.documents.search')}
              placeholder={t('company.documents.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label={t('company.documents.col.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value={ALL}>{t('company.documents.allKinds')}</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {t(`company.kind.${k}`)}
                </option>
              ))}
            </select>
            <select aria-label={t('company.documents.col.period')} value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value={ALL}>{t('company.documents.allPeriods')}</option>
              <option value={COMPANY_LEVEL}>{t('company.documents.companyLevel')}</option>
              {data.periods.map((p) => (
                <option key={p.ends} value={p.ends}>
                  {periodShort(p)}
                </option>
              ))}
            </select>
          </div>
          {rows.length ? (
            <SortableTable
              storageKey="tilari.company.documents.cols"
              columns={columns(data, t)}
              rows={rows}
              rowKey={(d) => d.key}
              onRowClick={(d) => {
                if (d.state !== 'missing') onOpenVoucher(d.voucher_id)
              }}
            />
          ) : (
            <p className="muted">{t('company.documents.empty')}</p>
          )}

          {data.unlinked.length ? (
            <details className="overview-panel company-unlinked">
              <summary>
                {t('company.unlinked.title')} ({data.unlinked.length})
              </summary>
              <p className="muted">{t('company.unlinked.lead')}</p>
              {rowError ? <p className="error">{rowError}</p> : null}
              <ul className="property-doc-list">
                {data.unlinked.map((c) => (
                  <UnlinkedRow key={c.voucher_id} candidate={c} actions={actions}>
                    {data.read_only ? null : <UnlinkedAttach candidate={c} overview={data} actions={actions} onError={setRowError} />}
                  </UnlinkedRow>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
