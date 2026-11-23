import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPartners, fetchSettings, saveVoucher, uploadAttachment } from '../../../api'
import { restoreLocationHash } from '../../../app/leaveGuard'
import { parseRoute, propertyHash, type PropertyCard, type PropertyTab } from '../../../app/routing'
import { housingVoucherIds, loanDay } from '../../../book/modules/properties/domain/housingLoan'
import { isParkingKind } from '../../../book/modules/properties/domain/kind'
import { leaseVoucherIds } from '../../../book/modules/properties/domain/rent'
import { waterVoucherIds } from '../../../book/modules/properties/domain/water'
import { skipDocument } from '../../../book/modules/properties/domain/reminders'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { localToday } from '../../../shared/downloadFile'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { FilePill, Pill } from '../../../shared/Pill'
import { TabPanel, Tabs, type TabItem } from '../../../shared/Tabs'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { voucherTypeName } from '../../../shared/voucherTypes'
import {
  fetchProperty,
  fetchPropertyDocuments,
  fetchPropertySetup,
  saveProperty,
  type DocCandidate,
  type DocumentSkip,
  type HousingCopySource,
  type LeaseException,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyDocuments,
} from '../api'
import { DocPicker } from './DocPicker'
import { VoucherOpen } from './FormParts'
import { HousingPanel } from './HousingPanel'
import { LoanCardEdit } from './LoanCardEdit'
import { copiedLoanDraft, type LoanDraft } from './loanDrafts'
import { LeaseCardEdit } from './LeaseCardEdit'
import { leaseDrafts, type LeaseDraft } from './leaseDrafts'
import { LeasesPanel } from './LeasesPanel'
import { saveErrorText, statusClass, tabMarks } from './format'
import { loadCashFlowOptions, saveCashFlowOptions, type CashFlowOptions } from './chartOptions'
import { CashFlowPanel, PropertyFinance } from './PropertyFinance'
import { PropertyOverview } from './PropertyOverview'
import { RentDates } from './RentDates'
import type { CardInputs } from './useDocWriter'
import { WaterCardEdit } from './WaterCardEdit'
import { candidateDoc, settlementDrafts, type SettlementDraft } from './waterDrafts'
import { WaterPanel } from './WaterPanel'

const DOCS_PER_GROUP = 8

type ViewTab = 'overview' | PropertyTab

/** Linking documents on the Asiakirjat tab: none when the object cannot be changed. */
type DocLinks = {
  /** The Liitetieto vouchers to link while the picker is open; null when it is closed. */
  picking: DocCandidate[] | null
  objectId: number
  /** Linked by a lease, a water settlement, the Taloyhtiö tab or a sale: unlinked there, not here. */
  held: Set<number>
  onPick: () => void
  onLink: (voucherId: number) => void
  onUnlink: (voucherId: number) => void
}

function Documents({
  data,
  bank,
  onBank,
  links,
  onOpenVoucher,
}: {
  data: PropertyDocuments
  /** Bank statements shown too. */
  bank: boolean
  onBank: (bank: boolean) => void
  links?: DocLinks
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const linked = new Set(data.groups.find((g) => g.kind === 'linked')?.vouchers.map((v) => v.voucher_id) ?? [])
  /** A linked row's way out: "Poista linkki", unless a lease, settlement or sale holds it. */
  const unlink = (kind: string, voucherId: number) =>
    links && kind === 'linked' && !links.held.has(voucherId) ? (
      <button type="button" className="btn-link btn-quiet" onClick={() => links.onUnlink(voucherId)}>
        {t('properties.docs.unlink')}
      </button>
    ) : null
  return (
    <section className="overview-panel property-docs">
      <div className="property-panel-head">
        <h3>{t('properties.docs.title')}</h3>
        {links && !links.picking ? (
          <button type="button" className="btn-small" onClick={links.onPick}>
            {t('properties.overview.addDoc')}
          </button>
        ) : null}
      </div>
      {links?.picking ? (
        <div className="property-doc-pick">
          <DocPicker
            docs={links.picking.filter((c) => !linked.has(c.voucher_id))}
            value=""
            placeholder={t('properties.edit.addDoc')}
            starred={(c) => c.suggestion?.candidates.includes(links.objectId) ?? false}
            onChange={(v) => v && links.onLink(Number(v))}
          />
        </div>
      ) : null}
      {data.groups.length === 0 ? <p className="muted">{t('properties.docs.empty')}</p> : null}
      {data.groups.map((group) => (
        <div key={group.kind} className="property-doc-group">
          <h4 className="section-label">{t(`properties.docs.group.${group.kind}`)}</h4>
          <DocLines>
            {(expanded.has(group.kind) ? group.vouchers : group.vouchers.slice(0, DOCS_PER_GROUP)).map((v) => {
              // A linked voucher deleted in Kitsas: no pill to open, as on the company page.
              if (v.missing) {
                return (
                  <DocLine
                    key={v.voucher_id}
                    title={<span className="muted">{t('properties.docs.missing', { id: v.voucher_id })}</span>}
                    mark={<Pill tone="crit">{t('properties.docs.deleted')}</Pill>}
                    end={unlink(group.kind, v.voucher_id)}
                  />
                )
              }
              const title = v.title || voucherTypeName(v.type)
              return (
                <DocLine
                  key={v.voucher_id}
                  voucher={<VoucherOpen voucher={{ ...v, title }} onOpen={onOpenVoucher} />}
                  title={title}
                  end={unlink(group.kind, v.voucher_id)}
                >
                  {v.attachments.map((a) => (
                    <FilePill key={a.id} id={a.id} name={a.name} />
                  ))}
                </DocLine>
              )
            })}
          </DocLines>
          {group.vouchers.length > DOCS_PER_GROUP && !expanded.has(group.kind) ? (
            <button type="button" className="btn-link btn-quiet" onClick={() => setExpanded(new Set(expanded).add(group.kind))}>
              {t('properties.docs.showAll', { n: group.vouchers.length })}
            </button>
          ) : null}
        </div>
      ))}
      {data.bank_hidden > 0 || bank ? (
        <label className="allocation-check">
          <input type="checkbox" checked={bank} onChange={() => onBank(!bank)} />
          {t('properties.docs.showBank', { n: data.bank_hidden })}
        </label>
      ) : null}
    </section>
  )
}

type CardKind = 'lease' | 'water' | 'loan'
type CardRef = { kind: CardKind; key: string | null }
/** The card in edit and how it opens: prefilled from a suggestion or a copy, or from the form kept for it. */
type OpenCard = CardRef & { leases?: LeaseDraft[]; water?: SettlementDraft[]; loan?: LoanDraft; restore?: boolean; n: number }
/** The tab a card is on. */
const CARD_TAB = { lease: 'leases', water: 'water', loan: 'housing' } as const
/** The card as the address names it. */
const cardOf = (c: CardRef): PropertyCard =>
  c.key == null ? { add: true } : c.kind === 'lease' ? { lease: c.key } : c.kind === 'water' ? { settlement: c.key } : { loan: c.key }

/** The tab an address opens: a month's lines are under the chart, on the overview. */
const tabOf = (route: { month?: string; tab?: PropertyTab }): ViewTab => (route.month ? 'overview' : (route.tab ?? 'overview'))

export function PropertyView({
  id,
  month,
  tab: routeTab,
  card: routeCard,
  bookKey = '',
  today,
  onBack,
  onEdit,
  onOpenAllocation,
  onOpenVoucher,
}: {
  id: number
  /** YYYY-MM whose lines are open under the chart (from the URL). */
  month?: string
  /** The open tab (from the URL); none is the overview. */
  tab?: PropertyTab
  /** A lease or water card to open in edit (from the URL: back from a voucher, its unsaved form kept). */
  card?: PropertyCard
  /** The open book's session: a card's unsaved form is kept for it. */
  bookKey?: string
  /** The book's date (a practice book's simulated day), for documents a card writes. */
  today?: string
  onBack: () => void
  /** Opens the object's general settings (kind, excluded, note); the rest is edited on the tabs. */
  onEdit: () => void
  /** `month`: open the cost-centre page on that month. */
  onOpenAllocation: (month?: string) => void
  /** `at`: the open tab and month panel, kept for the way back. */
  onOpenVoucher: (voucherId: number, entryId: number | null, at: { month?: string; tab?: PropertyTab; card?: PropertyCard }) => void
}) {
  const { t } = useI18n()
  const [targetBp, setTargetBp] = useState<number | null>(null)
  /** What the figures are computed with: the target return asked for. */
  const query = targetBp != null ? { targetBp } : {}
  const [chartOptions, setChartOptions] = useState<CashFlowOptions>(loadCashFlowOptions)
  const [tab, setTab] = useState<ViewTab>(tabOf({ month, tab: routeTab }))
  const [selected, setSelected] = useState<string | null>(month ?? null)
  /** The month the address asked for (a new object each time, so the same month shows again). */
  const [asked, setAsked] = useState<{ month: string } | null>(month ? { month } : null)
  const [bank, setBank] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data: d, error, loading, setData } = usePeriodQuery(
    () => fetchProperty(id, query),
    [id, targetBp],
  )
  const docs = usePeriodQuery<PropertyDocuments>(() => fetchPropertyDocuments(id, bank), [id, bank])
  const loaded = Boolean(d)
  /**
   * The card in edit, one at a time: a lease or a water settlement (`key` null is a new one), counted
   * so a reopen starts afresh.
   */
  const [card, setCard] = useState<OpenCard | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  /** The Asiakirjat tab's picker: the vouchers to link while it is open. */
  const [docPicker, setDocPicker] = useState<DocCandidate[] | null>(null)
  /** The Taloyhtiö tab's picker, the same way. */
  const [housingPicker, setHousingPicker] = useState<DocCandidate[] | null>(null)
  /** Counts the overview's "+ Hinta-arvio": each opens Talous's price estimates with a new row. */
  const [addValuation, setAddValuation] = useState(0)
  /** What a card form needs besides the object: loaded each time a card opens (a card may have written documents). */
  const [inputs, setInputs] = useState<CardInputs | null>(null)
  const dirty = useRef(false)
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value
  }, [])

  /** Saves the object as a card changed it and shows it as saved, with the documents it linked. */
  async function saveDoc(next: PropertyDoc) {
    setData(await saveProperty(id, next, query))
    // The saved object stands even when the list does not come: it then shows at the next visit.
    fetchPropertyDocuments(id, bank).then(docs.setData, () => undefined)
  }

  /** Saves the owner's word that a missing document has none (ADR-030) and shows the object as saved. */
  async function skipDoc(detail: PropertyDetail, skip: DocumentSkip) {
    setData(await saveProperty(id, skipDocument(detail.doc, skip), query))
  }

  /**
   * Saves an agreed exception to a stored lease, new or in place of `replaces` (found by its first
   * day: a lease's exceptions never overlap; null removes it), and shows the object as saved
   * (ADR-027). The save puts them in order.
   */
  async function saveException(detail: PropertyDetail, leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) {
    const saved = (list: LeaseException[]) => [...list.filter((e) => e.from !== replaces?.from), ...(exception ? [exception] : [])]
    const leases = (detail.doc.leases ?? []).map((l) => (l.key === leaseKey ? { ...l, exceptions: saved(l.exceptions ?? []) } : l))
    setData(await saveProperty(id, { ...detail.doc, leases }, query))
  }

  // A tab or month typed or linked in the address while this page is open. Read the address itself:
  // a tab or bar click changes it without a route change, so the props can be stale.
  useEffect(() => {
    const onHash = () => {
      const route = parseRoute()
      if (route.view !== 'property' || route.id !== id) return
      setTab(tabOf(route))
      setSelected(route.month ?? null)
      setAsked(route.month ? { month: route.month } : null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [id])

  // Opened on a month (back from one of its vouchers, or the address): show its bar and bring the lines into view.
  useEffect(() => {
    if (!loaded || !asked) return
    if (d && !d.months.slice(-24).some((m) => m.key === asked.month)) setChartOptions((o) => ({ ...o, allMonths: true }))
    panelRef.current?.scrollIntoView({ block: 'nearest' })
    // When the data first arrives or the address asks for a month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, asked])

  /** The address of `next`, with the open month on the overview and the open card on its tab. */
  const hashOf = (next: ViewTab, open: string | null, c: CardRef | null = card) =>
    propertyHash(id, next === 'overview' ? { month: open ?? undefined } : { tab: next, card: c && CARD_TAB[c.kind] === next ? cardOf(c) : undefined })

  /** Open another tab; the URL follows without a new history entry. */
  function selectTab(next: ViewTab) {
    setTab(next)
    restoreLocationHash(hashOf(next, selected))
  }

  /** Open or close a month's lines; the URL follows without a new history entry. */
  function selectMonth(key: string | null) {
    setSelected(key)
    restoreLocationHash(hashOf('overview', key))
  }
  const openVoucher = (voucherId: number, entryId: number | null = null) =>
    onOpenVoucher(voucherId, entryId, tab === 'overview' ? { month: selected ?? undefined } : { tab, card: card && CARD_TAB[card.kind] === tab ? cardOf(card) : undefined })
  /**
   * Opens a card in edit on its tab: a lease on Vuokrasuhteet, a settlement on Vesimaksut, a loan on
   * Taloyhtiö; stored `key`, or a new one (filled from the book's suggestion `suggestion`, or a loan
   * copied from another object's `copy`). An open card with changes is given up only after asking.
   */
  async function openCard(kind: CardKind, key: string | null, suggestion?: number, restore = false, copy?: HousingCopySource) {
    if (card && dirty.current && !window.confirm(t('properties.edit.confirmLeaveCard'))) return
    setCardError(null)
    setTab(CARD_TAB[kind])
    restoreLocationHash(hashOf(CARD_TAB[kind], selected, { kind, key }))
    let ready: CardInputs
    try {
      const [setup, { partners }, settings] = await Promise.all([fetchPropertySetup(), fetchPartners(), fetchSettings()])
      ready = {
        docs: setup.docs,
        partners: partners.map((p) => ({ id: p.id, name: p.name })),
        company: settings.company,
        today: today || localToday(),
      }
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err))
      return
    }
    setInputs(ready)
    const lease = kind === 'lease' && suggestion != null ? d?.lease_suggestions[suggestion] : undefined
    const water = kind === 'water' && suggestion != null ? d?.water.suggestions[suggestion] : undefined
    dirty.current = false
    setCard((prev) => ({
      kind,
      key,
      leases: lease ? leaseDrafts([lease.lease], ready.partners) : undefined,
      water: water ? settlementDrafts([water.settlement]) : undefined,
      loan: kind === 'loan' && copy ? copiedLoanDraft(copy) : undefined,
      restore,
      n: (prev?.n ?? 0) + 1,
    }))
  }

  /** Opens the Asiakirjat tab's picker of Liitetieto vouchers to link. */
  async function openDocPicker() {
    setCardError(null)
    selectTab('docs')
    try {
      setDocPicker((await fetchPropertySetup()).docs)
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Saves the object's own documents (`doc_voucher_ids`) as `ids`; the picker closes. */
  async function linkDocs(doc: PropertyDoc, ids: number[]) {
    setCardError(null)
    try {
      await saveDoc({ ...doc, doc_voucher_ids: [...new Set(ids)] })
      setDocPicker(null)
    } catch (err) {
      setCardError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    }
  }

  /** Opens the Taloyhtiö tab's picker: the Liitetieto documents and the object's own vouchers with files. */
  async function openHousingPicker() {
    setCardError(null)
    selectTab('housing')
    try {
      const notes = (await fetchPropertySetup()).docs
      const listed = new Set(notes.map((n) => n.voucher_id))
      setHousingPicker([...notes, ...(d?.water.statement_candidates ?? []).map(candidateDoc).filter((c) => !listed.has(c.voucher_id))])
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Saves the Taloyhtiö tab's own documents as `ids` (and drops a removed one from the object's); the picker closes. */
  async function linkHousingDocs(doc: PropertyDoc, ids: number[]) {
    setCardError(null)
    const removed = (doc.housing_doc_voucher_ids ?? []).filter((id) => !ids.includes(id))
    const next: PropertyDoc = { ...doc, doc_voucher_ids: (doc.doc_voucher_ids ?? []).filter((id) => !removed.includes(id)) }
    if (ids.length) next.housing_doc_voucher_ids = [...new Set(ids)]
    else delete next.housing_doc_voucher_ids
    try {
      await saveDoc(next)
      setHousingPicker(null)
    } catch (err) {
      setCardError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    }
  }

  /** Uploads files as a new Liitetieto voucher on the Taloyhtiö tab, linked there and deletable as the object's own. */
  async function uploadHousingDoc(doc: PropertyDoc, name: string, files: File[]) {
    setCardError(null)
    const date = today || localToday()
    try {
      const saved = await saveVoucher({
        date,
        type: 800,
        status: 100,
        title: t('properties.housing.docTitle', { object: name, date: formatDate(date) }),
        partner: null,
        entries: [],
      })
      for (const file of files) await uploadAttachment(saved.id, file)
      await saveDoc({
        ...doc,
        housing_doc_voucher_ids: [...new Set([...(doc.housing_doc_voucher_ids ?? []), saved.id])],
        created_voucher_ids: [...new Set([...(doc.created_voucher_ids ?? []), saved.id])],
      })
    } catch (err) {
      setCardError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    }
  }

  function addPriceEstimate() {
    selectTab('finance')
    setAddValuation((n) => n + 1)
  }

  function closeCard() {
    setCard(null)
    restoreLocationHash(hashOf(tab, selected, null))
  }

  // Opened on a card (back from a voucher, or the address): open it once the object is here, if it
  // can still be edited (a sold object's loans can: their history is entered afterwards).
  useEffect(() => {
    if (!d || !routeCard) return
    const kind: CardKind =
      'lease' in routeCard || ('add' in routeCard && routeTab === 'leases')
        ? 'lease'
        : 'loan' in routeCard || ('add' in routeCard && routeTab === 'housing')
          ? 'loan'
          : 'water'
    const key = 'lease' in routeCard ? routeCard.lease : 'settlement' in routeCard ? routeCard.settlement : 'loan' in routeCard ? routeCard.loan : null
    const stored = kind === 'lease' ? (d.doc.leases ?? []) : kind === 'loan' ? (d.doc.housing_loans ?? []) : (d.doc.water_settlements ?? [])
    const editable = (d.status !== 'sold' || kind === 'loan') && !d.read_only && (key == null || stored.some((x) => x.key === key))
    if (editable) void openCard(kind, key, undefined, true)
    else restoreLocationHash(hashOf(CARD_TAB[kind], selected, null))
    // When the data first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const edit = () => onEdit()

  const s = d?.summary
  const held = d?.status !== 'sold'
  const showLeases = d ? held || d.leases.length > 0 || d.lease_suggestions.length > 0 : false
  // A parking space or garage has no water to settle: the tab shows only what is stored there.
  const showWater = d ? (held && !isParkingKind(d.kind)) || d.water.settlements.length > 0 || d.water.suggestions.length > 0 : false
  // The housing company's loans and documents on every object: a sold one's loans are its history.
  const shown = (key: ViewTab) => (key === 'leases' ? showLeases : key === 'water' ? showWater : true)
  const active: ViewTab = shown(tab) ? tab : 'overview'

  const tabs: TabItem<ViewTab>[] = []
  if (d) {
    const marks = tabMarks(t, d.warnings, d.as_of)
    const mark = (key: PropertyTab) => {
      const m = marks.get(key)
      return m ? { tone: m.tone, title: t('properties.tab.mark', { count: m.count }) } : undefined
    }
    const docIds = new Set(docs.data?.groups.flatMap((g) => g.vouchers.map((v) => v.voucher_id)) ?? [])
    const deleted = new Set(docs.data?.groups.flatMap((g) => g.vouchers.filter((v) => v.missing).map((v) => v.voucher_id)) ?? [])
    tabs.push({ id: 'overview', label: t('properties.tab.overview') })
    if (showLeases) tabs.push({ id: 'leases', label: t('properties.tab.leases'), count: d.leases.filter((l) => !l.suggested).length, mark: mark('leases') })
    if (showWater) tabs.push({ id: 'water', label: t('properties.tab.water'), count: d.water.settlements.length, mark: mark('water') })
    tabs.push({ id: 'housing', label: t('properties.tab.housing'), count: d.doc.housing_loans?.length ?? 0, mark: mark('housing') })
    tabs.push({
      id: 'docs',
      label: t('properties.tab.docs'),
      count: docIds.size,
      mark: deleted.size ? { tone: 'crit', title: t('properties.tab.mark', { count: deleted.size }) } : undefined,
    })
    tabs.push({ id: 'finance', label: t('properties.tab.finance'), mark: mark('finance') })
  }

  return (
    <div className="ledger property-detail">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.properties')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {loading && !d ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {d && s ? (
        <>
          <div className="ledger-head-intro">
            <h2 className="ledger-page-title">{d.name}</h2>
            <p className="lede voucher-meta">
              <span className={statusClass(d.status)}>{t(`properties.status.${d.status}`)}</span>
              {d.kind ? ` · ${t(`properties.kind.${d.kind}`)}` : ''}
              {s.acquired_on ? ` · ${t('properties.acquired', { date: formatDate(s.acquired_on) })}` : ''}
              {s.sold_on ? ` · ${t('properties.soldOn', { date: formatDate(s.sold_on) })}` : ''}
            </p>
            <p className="muted property-asof">
              {t('properties.asOf', { date: formatDate(d.as_of) })}
              {' · '}
              <button type="button" className="btn-link" onClick={() => edit()}>
                {t('properties.editLink')}
              </button>
              {' · '}
              <button type="button" className="btn-link" onClick={() => onOpenAllocation()}>
                {t('properties.openAllocation')}
              </button>
            </p>
          </div>

          <Tabs tabs={tabs} active={active} onSelect={selectTab} idPrefix="property" label={d.name} />

          <TabPanel id="overview" idPrefix="property" active={active === 'overview'}>
            <PropertyOverview
              d={d}
              showWater={showWater}
              onTab={selectTab}
              onAdd={(on) =>
                on === 'leases'
                  ? void openCard('lease', null)
                  : on === 'water'
                    ? void openCard('water', null)
                    : on === 'housing'
                      ? void openCard('loan', null)
                      : on === 'docs'
                        ? void openDocPicker()
                        : addPriceEstimate()
              }
              onOpenDue={(w) => (w.lease_key ? void openCard('lease', w.lease_key) : selectTab('leases'))}
              onSkip={d.read_only ? undefined : (skip) => skipDoc(d, skip)}
              onOpenVoucher={(v) => openVoucher(v)}
              cashFlow={
                <CashFlowPanel
                  d={d}
                  options={chartOptions}
                  onOptions={(o) => {
                    setChartOptions(o)
                    saveCashFlowOptions(o)
                  }}
                  selected={selected}
                  onSelectMonth={selectMonth}
                  panelRef={panelRef}
                  onOpenAllocation={onOpenAllocation}
                  onOpenVoucher={openVoucher}
                />
              }
            />
          </TabPanel>

          <TabPanel id="leases" idPrefix="property" active={active === 'leases'}>
            {cardError ? <p className="error">{cardError}</p> : null}
            <LeasesPanel
              leases={d.leases}
              current={d.lease}
              suggestions={d.lease_suggestions.map((s) => s.view)}
              accounts={d.rent_account?.leases}
              unassigned={d.rent_account?.unassigned}
              period={{ start: d.rent_start, end: d.rent_end }}
              asOf={d.as_of}
              held={held}
              rentDates={<RentDates detail={d} onSave={d.read_only ? undefined : saveDoc} />}
              editing={card?.kind === 'lease' && inputs ? (card.key ?? 'new') : null}
              form={
                card?.kind === 'lease' && inputs ? (
                  <LeaseCardEdit
                    key={`${card.key ?? 'new'}-${card.n}`}
                    detail={d}
                    inputs={inputs}
                    bookKey={bookKey}
                    restore={card.restore}
                    leaseKey={card.key}
                    prefill={card.leases}
                    onSave={saveDoc}
                    onClose={closeCard}
                    onDirty={setDirty}
                    onOpenVoucher={(v) => openVoucher(v)}
                  />
                ) : null
              }
              onEditLease={held && !d.read_only ? (key) => void openCard('lease', key) : undefined}
              onAddSuggestion={held && !d.read_only ? (i) => void openCard('lease', null, i) : undefined}
              onAdd={held && !d.read_only ? () => void openCard('lease', null) : undefined}
              onOpenVoucher={(v) => openVoucher(v)}
              onSaveException={d.read_only ? undefined : (leaseKey, exception, replaces) => saveException(d, leaseKey, exception, replaces)}
              parkingObject={isParkingKind(d.kind)}
            />
          </TabPanel>

          <TabPanel id="water" idPrefix="property" active={active === 'water'}>
            {cardError ? <p className="error">{cardError}</p> : null}
            <WaterPanel
              water={d.water}
              held={held}
              editing={card?.kind === 'water' && inputs ? (card.key ?? 'new') : null}
              form={
                card?.kind === 'water' && inputs ? (
                  <WaterCardEdit
                    key={`${card.key ?? 'new'}-${card.n}`}
                    detail={d}
                    inputs={inputs}
                    bookKey={bookKey}
                    restore={card.restore}
                    settlementKey={card.key}
                    prefill={card.water}
                    onSave={saveDoc}
                    onClose={closeCard}
                    onDirty={setDirty}
                    onOpenVoucher={(v) => openVoucher(v)}
                  />
                ) : null
              }
              onEditSettlement={held && !d.read_only ? (key) => void openCard('water', key) : undefined}
              onAddSuggestion={held && !d.read_only ? (i) => void openCard('water', null, i) : undefined}
              onAdd={held && !d.read_only ? () => void openCard('water', null) : undefined}
              onOpenVoucher={(v) => openVoucher(v)}
            />
          </TabPanel>

          <TabPanel id="housing" idPrefix="property" active={active === 'housing'}>
            {cardError ? <p className="error">{cardError}</p> : null}
            <HousingPanel
              d={d}
              on={held || !s?.sold_on ? loanDay(d.as_of, today || localToday()) : s.sold_on}
              held={held}
              editing={card?.kind === 'loan' && inputs ? (card.key ?? 'new') : null}
              form={
                card?.kind === 'loan' && inputs ? (
                  <LoanCardEdit
                    key={`${card.key ?? 'new'}-${card.n}`}
                    detail={d}
                    inputs={inputs}
                    bookKey={bookKey}
                    restore={card.restore}
                    loanKey={card.key}
                    prefill={card.loan}
                    onSave={saveDoc}
                    onClose={closeCard}
                    onDirty={setDirty}
                  />
                ) : null
              }
              links={
                d.read_only
                  ? undefined
                  : {
                      picking: housingPicker,
                      onPick: () => void openHousingPicker(),
                      onLink: (v) => void linkHousingDocs(d.doc, [...(d.doc.housing_doc_voucher_ids ?? []), v]),
                      onUnlink: (v) => void linkHousingDocs(d.doc, (d.doc.housing_doc_voucher_ids ?? []).filter((x) => x !== v)),
                      onUpload: (files) => uploadHousingDoc(d.doc, d.name, files),
                    }
              }
              onEditLoan={!d.read_only ? (key) => void openCard('loan', key) : undefined}
              onAdd={!d.read_only ? () => void openCard('loan', null) : undefined}
              onCopy={!d.read_only ? (source) => void openCard('loan', null, undefined, false, source) : undefined}
              onOpenVoucher={(v) => openVoucher(v)}
            />
          </TabPanel>

          <TabPanel id="docs" idPrefix="property" active={active === 'docs'}>
            {cardError ? <p className="error">{cardError}</p> : null}
            {docs.error ? <p className="error">{docs.error}</p> : null}
            {docs.data ? (
              <Documents
                data={docs.data}
                bank={bank}
                onBank={setBank}
                links={
                  d.read_only
                    ? undefined
                    : {
                        picking: docPicker,
                        objectId: d.id,
                        held: new Set([
                          ...leaseVoucherIds(d.doc.leases ?? []),
                          ...waterVoucherIds(d.doc.water_settlements ?? []),
                          ...housingVoucherIds(d.doc.housing_loans ?? []),
                          ...(d.doc.housing_doc_voucher_ids ?? []),
                          ...(d.doc.sale_voucher_ids ?? []),
                        ]),
                        onPick: () => void openDocPicker(),
                        onLink: (v) => void linkDocs(d.doc, [...(d.doc.doc_voucher_ids ?? []), v]),
                        onUnlink: (v) => void linkDocs(d.doc, (d.doc.doc_voucher_ids ?? []).filter((x) => x !== v)),
                      }
                }
                onOpenVoucher={(v) => openVoucher(v)}
              />
            ) : null}
          </TabPanel>

          <TabPanel id="finance" idPrefix="property" active={active === 'finance'}>
            <PropertyFinance
              d={d}
              onTarget={setTargetBp}
              onSave={d.read_only ? undefined : saveDoc}
              addValuation={addValuation}
              onOpenVoucher={openVoucher}
            />
          </TabPanel>
        </>
      ) : null}
    </div>
  )
}
