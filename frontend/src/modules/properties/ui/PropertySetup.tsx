import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import {
  applyPropertySetup,
  fetchPropertySetup,
  PROPERTY_KINDS,
  type DocCandidate,
  type EraCandidate,
  type PropertyKind,
  type SetupResponse,
} from '../api'
import { saveErrorText } from './format'
import { buildSetupInput, initialDoc, initialEra, type CentreDraft } from './setupInput'

function CentreSelect({
  value,
  centres,
  candidates,
  onChange,
}: {
  value: number | null
  centres: SetupResponse['cost_centres']
  candidates: number[]
  onChange: (id: number | null) => void
}) {
  const { t } = useI18n()
  const first = centres.filter((c) => candidates.includes(c.id))
  const rest = centres.filter((c) => !candidates.includes(c.id))
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{t('properties.setup.none')}</option>
      {first.map((c) => (
        <option key={c.id} value={c.id}>
          ★ {c.name}
        </option>
      ))}
      {rest.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function Evidence({ source }: { source: string | undefined }) {
  const { t } = useI18n()
  if (!source) return null
  return <span className={`property-evidence property-evidence-${source}`}>{t(`properties.evidence.${source}`)}</span>
}

function SetupForm({ setup, onDone }: { setup: SetupResponse; onDone: () => void }) {
  const { t } = useI18n()
  const [centres, setCentres] = useState(
    () =>
      new Map<number, CentreDraft>(
        // New cost centres default to apartments; a stored choice wins.
        setup.cost_centres.map((c) => [c.id, { included: !c.excluded, kind: c.kind ?? (c.configured ? '' : 'apartment') }]),
      ),
  )
  const [eraChoice, setEraChoice] = useState(() => new Map(setup.eras.map((e) => [e.eraid, initialEra(e)])))
  const [docChoice, setDocChoice] = useState(() => new Map(setup.docs.map((d) => [d.voucher_id, initialDoc(d)])))
  const [showAllEras, setShowAllEras] = useState(false)
  const [showAllDocs, setShowAllDocs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const included = setup.cost_centres.filter((c) => centres.get(c.id)?.included)
  const relevantEra = (e: EraCandidate) => e.balance_snt !== 0 || e.linked_to != null || e.suggestion != null
  const eras = showAllEras ? setup.eras : setup.eras.filter(relevantEra)
  const relevantDoc = (d: DocCandidate) => d.linked_to.length > 0 || d.suggestion != null
  const docs = showAllDocs ? setup.docs : setup.docs.filter(relevantDoc)
  const hiddenEras = setup.eras.length - setup.eras.filter(relevantEra).length
  const hiddenDocs = setup.docs.length - setup.docs.filter(relevantDoc).length

  const openEras = useMemo(() => eras.filter((e) => e.balance_snt !== 0), [eras])
  const closedEras = useMemo(() => eras.filter((e) => e.balance_snt === 0), [eras])

  async function apply() {
    setSaving(true)
    try {
      await applyPropertySetup(buildSetupInput(setup, centres, eraChoice, docChoice))
      onDone()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  const eraRows = (list: EraCandidate[]) =>
    list.map((e) => (
      <tr key={e.eraid}>
        <td>
          {e.description || '–'}
          <span className="muted property-sub">
            {e.account} {e.account_name}
          </span>
        </td>
        <td className="num">{formatDate(e.date)}</td>
        <td className="amount">{formatCents(e.balance_snt)}</td>
        <td>
          <CentreSelect
            value={eraChoice.get(e.eraid) ?? null}
            centres={included}
            candidates={e.suggestion?.candidates ?? []}
            onChange={(id) => setEraChoice(new Map(eraChoice).set(e.eraid, id))}
          />{' '}
          {e.linked_to == null ? <Evidence source={e.suggestion?.cost_centre_id != null ? e.suggestion.source : e.suggestion ? 'ambiguous' : undefined} /> : null}
        </td>
      </tr>
    ))

  return (
    <>
      <section className="property-section">
        <h3>{t('properties.setup.centres')}</h3>
        <p className="muted">{t('properties.setup.centresLead')}</p>
        <table className="ledger-table compact">
          <thead>
            <tr>
              <th>{t('properties.col.object')}</th>
              <th>{t('properties.setup.isObject')}</th>
              <th>{t('properties.field.kind')}</th>
            </tr>
          </thead>
          <tbody>
            {setup.cost_centres.map((c) => {
              const draft = centres.get(c.id)!
              return (
                <tr key={c.id} className={draft.included ? '' : 'is-ended'}>
                  <td>
                    {c.name}
                    {c.ends ? <span className="muted property-sub">{t('properties.setup.ends', { date: formatDate(c.ends) })}</span> : null}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={draft.included}
                      onChange={() => setCentres(new Map(centres).set(c.id, { ...draft, included: !draft.included }))}
                    />
                  </td>
                  <td>
                    <select
                      value={draft.kind}
                      onChange={(e) => setCentres(new Map(centres).set(c.id, { ...draft, kind: e.target.value as PropertyKind | '' }))}
                    >
                      <option value="">–</option>
                      {PROPERTY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`properties.kind.${k}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="property-section">
        <h3>{t('properties.setup.eras')}</h3>
        <p className="muted">{t('properties.setup.erasLead')}</p>
        <p className="property-legend">{t('properties.setup.starLegend')}</p>
        <table className="ledger-table compact property-setup-table">
          <thead>
            <tr>
              <th>{t('properties.eras.item')}</th>
              <th>{t('table.date')}</th>
              <th className="amount">{t('table.balance')}</th>
              <th>{t('properties.setup.belongsTo')}</th>
            </tr>
          </thead>
          <tbody>
            {eraRows(openEras)}
            {closedEras.length ? (
              <tr className="property-subhead">
                <td colSpan={4}>{t('properties.setup.closedEras')}</td>
              </tr>
            ) : null}
            {eraRows(closedEras)}
          </tbody>
        </table>
        {hiddenEras > 0 || showAllEras ? (
          <label className="allocation-check">
            <input type="checkbox" checked={showAllEras} onChange={() => setShowAllEras(!showAllEras)} />
            {t('properties.setup.showAllEras', { n: hiddenEras })}
          </label>
        ) : null}
      </section>

      <section className="property-section">
        <h3>{t('properties.setup.docs')}</h3>
        <p className="muted">{t('properties.setup.docsLead')}</p>
        <p className="property-legend">{t('properties.setup.starLegend')}</p>
        <table className="ledger-table compact property-setup-table">
          <thead>
            <tr>
              <th>{t('table.date')}</th>
              <th>{t('properties.setup.docTitle')}</th>
              <th className="amount">{t('properties.setup.files')}</th>
              <th>{t('properties.setup.belongsTo')}</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.voucher_id}>
                <td className="num">{formatDate(d.date)}</td>
                <td>{d.title || '–'}</td>
                <td className="amount">{d.attachments}</td>
                <td>
                  <CentreSelect
                    value={docChoice.get(d.voucher_id) ?? null}
                    centres={included}
                    candidates={d.suggestion?.candidates ?? []}
                    onChange={(id) => setDocChoice(new Map(docChoice).set(d.voucher_id, id))}
                  />
                  {d.linked_to.length > 1 ? <span className="muted"> +{d.linked_to.length - 1}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hiddenDocs > 0 || showAllDocs ? (
          <label className="allocation-check">
            <input type="checkbox" checked={showAllDocs} onChange={() => setShowAllDocs(!showAllDocs)} />
            {t('properties.setup.showAllDocs', { n: hiddenDocs })}
          </label>
        ) : null}
      </section>

      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void apply()}>
          {saving ? t('common.saving') : t('properties.setup.apply')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

export function PropertySetup({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchPropertySetup().then(
      (s) => {
        if (!cancelled) setSetup(s)
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <div className="ledger property-setup">
      <button type="button" className="back-btn" onClick={onDone}>
        {t('up.properties')}
      </button>
      <div className="ledger-head-intro">
        <h2 className="ledger-page-title">{t('properties.setup.title')}</h2>
        <p className="lede">{t('properties.setup.lead')}</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!setup && !error ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {setup ? <SetupForm setup={setup} onDone={onDone} /> : null}
    </div>
  )
}
