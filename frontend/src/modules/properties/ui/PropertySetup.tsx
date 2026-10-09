import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
import { clearSetupDraft, loadSetupDraft, saveSetupDraft, scrollContainer, type SetupDraft } from './setupDraft'
import { buildSetupInput, initialDoc, initialEra, type CentreDraft } from './setupInput'

function CentreSelect({
  value,
  centres,
  candidates,
  needed = false,
  onChange,
}: {
  value: number | null
  centres: SetupResponse['cost_centres']
  candidates: number[]
  /** Tilari could not decide between candidates: the owner has to choose. */
  needed?: boolean
  onChange: (id: number | null) => void
}) {
  const { t } = useI18n()
  const first = centres.filter((c) => candidates.includes(c.id))
  const rest = centres.filter((c) => !candidates.includes(c.id))
  return (
    <select
      className={needed ? 'property-select-needed' : undefined}
      aria-invalid={needed || undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
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

type Choices = {
  centres: Map<number, CentreDraft>
  eras: Map<number, number | null>
  docs: Map<number, number | null>
}

/** What setup shows before the owner changes anything. */
function defaultChoices(setup: SetupResponse): Choices {
  return {
    // A stored choice wins; otherwise the kind guessed from the name (apartment by default).
    centres: new Map(setup.cost_centres.map((c) => [c.id, { included: !c.excluded, kind: c.kind ?? c.suggested_kind }])),
    eras: new Map(setup.eras.map((e) => [e.eraid, initialEra(e)])),
    docs: new Map(setup.docs.map((d) => [d.voucher_id, initialDoc(d)])),
  }
}

/** Defaults with the draft's choices on top, for rows that still exist. */
function restoreChoices(setup: SetupResponse, draft: SetupDraft | null): Choices {
  const choices = defaultChoices(setup)
  if (!draft) return choices
  for (const [id, value] of draft.centres) if (choices.centres.has(id)) choices.centres.set(id, value)
  for (const [id, value] of draft.eras) if (choices.eras.has(id)) choices.eras.set(id, value)
  for (const [id, value] of draft.docs) if (choices.docs.has(id)) choices.docs.set(id, value)
  return choices
}

function sameChoices(a: Choices, b: Choices): boolean {
  const key = (c: Choices) => JSON.stringify([[...c.centres], [...c.eras], [...c.docs]])
  return key(a) === key(b)
}

/** Enter/space on a focused row opens it; keys inside its select do not. */
function rowKey(open: () => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }
}

function SetupForm({
  setup,
  bookKey,
  onDone,
  onOpenVoucher,
}: {
  setup: SetupResponse
  bookKey: string
  onDone: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [draft] = useState(() => loadSetupDraft(bookKey))
  const [initial] = useState(() => restoreChoices(setup, draft))
  const [centres, setCentres] = useState(initial.centres)
  const [eraChoice, setEraChoice] = useState(initial.eras)
  const [docChoice, setDocChoice] = useState(initial.docs)
  const [showAllEras, setShowAllEras] = useState(draft?.showAllEras ?? false)
  const [showAllDocs, setShowAllDocs] = useState(draft?.showAllDocs ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const defaults = useMemo(() => defaultChoices(setup), [setup])
  const dirty = !sameChoices({ centres, eras: eraChoice, docs: docChoice }, defaults)
  const [restored] = useState(() => Boolean(draft) && !sameChoices(initial, defaultChoices(setup)))

  // Keep the unsaved choices and the scroll position while a voucher is open (this tab only).
  const scrollTop = useRef(draft?.scrollTop ?? 0)
  const openingVoucher = useRef(false)
  const state = useRef({ centres, eraChoice, docChoice, showAllEras, showAllDocs, dirty })
  state.current = { centres, eraChoice, docChoice, showAllEras, showAllDocs, dirty }
  const done = useRef(false)

  const persist = () => {
    const s = state.current
    saveSetupDraft({
      book: bookKey,
      centres: [...s.centres],
      eras: [...s.eraChoice],
      docs: [...s.docChoice],
      showAllEras: s.showAllEras,
      showAllDocs: s.showAllDocs,
      scrollTop: scrollTop.current,
    })
  }

  useEffect(() => {
    if (dirty) persist()
    // persist reads the latest state from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centres, eraChoice, docChoice, showAllEras, showAllDocs, dirty])

  useLayoutEffect(() => {
    const box = scrollContainer()
    if (!box) return
    if (draft?.scrollTop) {
      box.scrollTop = draft.scrollTop
      // Once more after layout settles (fonts, wide tables).
      requestAnimationFrame(() => {
        box.scrollTop = draft.scrollTop
      })
    }
    const onScroll = () => {
      scrollTop.current = box.scrollTop
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('scroll', onScroll)
      if (done.current) return
      if (openingVoucher.current || state.current.dirty) persist()
      else clearSetupDraft()
    }
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openVoucher = (voucherId: number) => {
    openingVoucher.current = true
    onOpenVoucher(voucherId)
  }

  const discard = () => {
    const fresh = defaultChoices(setup)
    setCentres(fresh.centres)
    setEraChoice(fresh.eras)
    setDocChoice(fresh.docs)
    clearSetupDraft()
  }

  const cancel = () => {
    done.current = true
    clearSetupDraft()
    onDone()
  }

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
      done.current = true
      clearSetupDraft()
      onDone()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  // Tilari found several candidates and nothing is chosen yet: these rows need the owner.
  const eraNeeds = (e: EraCandidate) =>
    e.linked_to == null && e.suggestion != null && e.suggestion.cost_centre_id == null && eraChoice.get(e.eraid) == null
  const docNeeds = (d: DocCandidate) =>
    d.linked_to.length === 0 && d.suggestion != null && d.suggestion.cost_centre_id == null && docChoice.get(d.voucher_id) == null
  const eraNeedCount = setup.eras.filter(eraNeeds).length
  const docNeedCount = setup.docs.filter(docNeeds).length

  const eraRows = (list: EraCandidate[]) =>
    list.map((e) => (
      <tr
        key={e.eraid}
        className={eraNeeds(e) ? 'clickable property-needs-choice' : 'clickable'}
        tabIndex={0}
        title={t('properties.setup.openVoucher')}
        onClick={() => openVoucher(e.voucher_id)}
        onKeyDown={rowKey(() => openVoucher(e.voucher_id))}
      >
        <td>
          {e.description || '–'}
          <span className="muted property-sub">
            {e.account} {e.account_name}
          </span>
        </td>
        <td className="num">{formatDate(e.date)}</td>
        <td className="amount">{formatCents(e.balance_snt)}</td>
        <td onClick={(ev) => ev.stopPropagation()}>
          <div className="property-choice">
            <CentreSelect
              value={eraChoice.get(e.eraid) ?? null}
              centres={included}
              candidates={e.suggestion?.candidates ?? []}
              needed={eraNeeds(e)}
              onChange={(id) => setEraChoice(new Map(eraChoice).set(e.eraid, id))}
            />
            {eraNeeds(e) ? (
              <Evidence source="ambiguous" />
            ) : e.linked_to == null && e.suggestion?.cost_centre_id != null ? (
              <Evidence source={e.suggestion.source} />
            ) : null}
          </div>
        </td>
      </tr>
    ))

  return (
    <>
      {restored ? (
        <div className="property-banner">
          <span>{t('properties.setup.draftRestored')}</span>
          <button type="button" className="btn-secondary" onClick={discard}>
            {t('properties.setup.discard')}
          </button>
        </div>
      ) : null}
      <p className="muted">{t('properties.setup.rowsOpen')}</p>
      <section className="property-section">
        <h3>{t('properties.setup.centres')}</h3>
        <p className="muted">{t('properties.setup.centresLead')}</p>
        <p className="property-legend">
          {t('properties.setup.kindLegend')}{' '}
          <button
            type="button"
            className="btn-small"
            onClick={() =>
              setCentres(
                new Map(setup.cost_centres.map((c) => [c.id, { ...centres.get(c.id)!, kind: c.suggested_kind }])),
              )
            }
          >
            {t('properties.setup.kindsFromNames')}
          </button>
        </p>
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
                      className="property-kind-select"
                      value={draft.kind}
                      onChange={(e) => setCentres(new Map(centres).set(c.id, { ...draft, kind: e.target.value as PropertyKind | '' }))}
                    >
                      <option value="">–</option>
                      {PROPERTY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k === c.suggested_kind ? '★ ' : ''}
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
        <h3>
          {t('properties.setup.eras')}
          {eraNeedCount ? <span className="property-needed-count">{t('properties.setup.needChoice', { n: eraNeedCount })}</span> : null}
        </h3>
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
        <h3>
          {t('properties.setup.docs')}
          {docNeedCount ? <span className="property-needed-count">{t('properties.setup.needChoice', { n: docNeedCount })}</span> : null}
        </h3>
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
              <tr
                key={d.voucher_id}
                className={docNeeds(d) ? 'clickable property-needs-choice' : 'clickable'}
                tabIndex={0}
                title={t('properties.setup.openVoucher')}
                onClick={() => openVoucher(d.voucher_id)}
                onKeyDown={rowKey(() => openVoucher(d.voucher_id))}
              >
                <td className="num">{formatDate(d.date)}</td>
                <td>{d.title || '–'}</td>
                <td className="amount">{d.attachments}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <div className="property-choice">
                    <CentreSelect
                      value={docChoice.get(d.voucher_id) ?? null}
                      centres={included}
                      candidates={d.suggestion?.candidates ?? []}
                      needed={docNeeds(d)}
                      onChange={(id) => setDocChoice(new Map(docChoice).set(d.voucher_id, id))}
                    />
                    {docNeeds(d) ? <Evidence source="ambiguous" /> : null}
                    {d.linked_to.length > 1 ? <span className="muted">+{d.linked_to.length - 1}</span> : null}
                  </div>
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
        <button type="button" className="btn-secondary" onClick={cancel}>
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

export function PropertySetup({
  bookKey,
  onDone,
  onOpenVoucher,
}: {
  bookKey: string
  onDone: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
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
      {setup ? <SetupForm setup={setup} bookKey={bookKey} onDone={onDone} onOpenVoucher={onOpenVoucher} /> : null}
    </div>
  )
}
