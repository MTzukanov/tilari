import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPartners, fetchSettings } from '../../../api'
import { restoreLocationHash } from '../../../app/leaveGuard'
import { parseRoute, propertyHash, type PropertyCard, type PropertyEditIntent, type PropertyTab } from '../../../app/routing'
import { isParkingKind } from '../../../book/modules/properties/domain/kind'
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
  type DocumentSkip,
  type LeaseException,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyDocuments,
} from '../api'
import { VoucherOpen } from './FormParts'
import { LeaseCardEdit } from './LeaseCardEdit'
import { leaseDrafts, type LeaseDraft } from './leaseDrafts'
import { LeasesPanel } from './LeasesPanel'
import { statusClass, tabMarks } from './format'
import { CashFlowPanel, PropertyFinance } from './PropertyFinance'
import { PropertyOverview } from './PropertyOverview'
import { RentDates } from './RentDates'
import type { CardInputs } from './useDocWriter'
import { WaterPanel } from './WaterPanel'

const DOCS_PER_GROUP = 8

type ViewTab = 'overview' | PropertyTab

function Documents({
  data,
  bank,
  onBank,
  onAdd,
  onOpenVoucher,
}: {
  data: PropertyDocuments
  /** Bank statements shown too. */
  bank: boolean
  onBank: (bank: boolean) => void
  /** Opens the edit page to link a document; none when the object cannot be changed. */
  onAdd?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  return (
    <section className="overview-panel property-docs">
      <div className="property-panel-head">
        <h3>{t('properties.docs.title')}</h3>
        {onAdd ? (
          <button type="button" className="btn-small" onClick={onAdd}>
            {t('properties.overview.addDoc')}
          </button>
        ) : null}
      </div>
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
                  />
                )
              }
              const title = v.title || voucherTypeName(v.type)
              return (
                <DocLine key={v.voucher_id} voucher={<VoucherOpen voucher={{ ...v, title }} onOpen={onOpenVoucher} />} title={title}>
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
  /** A lease card to open in edit (from the URL: back from a voucher, its unsaved form kept). */
  card?: PropertyCard
  /** The open book's session: a card's unsaved form is kept for it. */
  bookKey?: string
  /** The book's date (a practice book's simulated day), for documents a card writes. */
  today?: string
  onBack: () => void
  /** Opens the edit page on `tab` (none: the basics), to do `intent` there. */
  onEdit: (tab?: PropertyTab, intent?: PropertyEditIntent) => void
  /** `month`: open the cost-centre page on that month. */
  onOpenAllocation: (month?: string) => void
  /** `at`: the open tab and month panel, kept for the way back. */
  onOpenVoucher: (voucherId: number, entryId: number | null, at: { month?: string; tab?: PropertyTab; card?: PropertyCard }) => void
}) {
  const { t } = useI18n()
  const [targetBp, setTargetBp] = useState<number | null>(null)
  const [allMonths, setAllMonths] = useState(false)
  const [tab, setTab] = useState<ViewTab>(tabOf({ month, tab: routeTab }))
  const [selected, setSelected] = useState<string | null>(month ?? null)
  /** The month the address asked for (a new object each time, so the same month shows again). */
  const [asked, setAsked] = useState<{ month: string } | null>(month ? { month } : null)
  const [bank, setBank] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data: d, error, loading, setData } = usePeriodQuery(
    () => fetchProperty(id, targetBp != null ? { targetBp } : {}),
    [id, targetBp],
  )
  const docs = usePeriodQuery<PropertyDocuments>(() => fetchPropertyDocuments(id, bank), [id, bank])
  const loaded = Boolean(d)
  /** The lease card in edit (one at a time; `key` null is a new lease), counted so a reopen starts afresh. */
  const [card, setCard] = useState<{ key: string | null; prefill?: LeaseDraft[]; restore?: boolean; n: number } | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  /** What a card form needs besides the object: loaded when the first card opens. */
  const [inputs, setInputs] = useState<CardInputs | null>(null)
  const dirty = useRef(false)
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value
  }, [])

  /** Saves the object as a card changed it and shows it as saved. */
  async function saveDoc(next: PropertyDoc) {
    setData(await saveProperty(id, next, targetBp != null ? { targetBp } : {}))
  }

  /** Saves the owner's word that a missing document has none (ADR-030) and shows the object as saved. */
  async function skipDoc(detail: PropertyDetail, skip: DocumentSkip) {
    setData(await saveProperty(id, skipDocument(detail.doc, skip), targetBp != null ? { targetBp } : {}))
  }

  /**
   * Saves an agreed exception to a stored lease, new or in place of `replaces` (found by its first
   * day: a lease's exceptions never overlap; null removes it), and shows the object as saved
   * (ADR-027). The save puts them in order.
   */
  async function saveException(detail: PropertyDetail, leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) {
    const saved = (list: LeaseException[]) => [...list.filter((e) => e.from !== replaces?.from), ...(exception ? [exception] : [])]
    const leases = (detail.doc.leases ?? []).map((l) => (l.key === leaseKey ? { ...l, exceptions: saved(l.exceptions ?? []) } : l))
    setData(await saveProperty(id, { ...detail.doc, leases }, targetBp != null ? { targetBp } : {}))
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
    if (d && !d.months.slice(-24).some((m) => m.key === asked.month)) setAllMonths(true)
    panelRef.current?.scrollIntoView({ block: 'nearest' })
    // When the data first arrives or the address asks for a month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, asked])

  /** The open card as the address names it. */
  const cardOf = (c: { key: string | null } | null): PropertyCard | undefined => (c ? (c.key ? { lease: c.key } : { add: true }) : undefined)
  /** The address of `next`, with the open month on the overview and the open card on its tab. */
  const hashOf = (next: ViewTab, open: string | null, c: { key: string | null } | null = card) =>
    propertyHash(id, next === 'overview' ? { month: open ?? undefined } : { tab: next, card: cardOf(c) })

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
    onOpenVoucher(voucherId, entryId, tab === 'overview' ? { month: selected ?? undefined } : { tab, card: cardOf(card) })
  /**
   * Opens a lease card in edit on the Vuokrasuhteet tab: stored lease `key`, or a new one (filled
   * from suggestion `suggestion`). An open card with changes is given up only after asking.
   */
  async function openLeaseCard(key: string | null, suggestion?: number, restore = false) {
    if (card && dirty.current && !window.confirm(t('properties.edit.confirmLeaveCard'))) return
    setCardError(null)
    setTab('leases')
    restoreLocationHash(hashOf('leases', selected, { key }))
    let ready = inputs
    if (!ready) {
      try {
        const [setup, { partners }, settings] = await Promise.all([fetchPropertySetup(), fetchPartners(), fetchSettings()])
        ready = {
          docs: setup.docs,
          partners: partners.map((p) => ({ id: p.id, name: p.name })),
          company: settings.company,
          today: today || localToday(),
        }
        setInputs(ready)
      } catch (err) {
        setCardError(err instanceof Error ? err.message : String(err))
        return
      }
    }
    const s = suggestion != null ? d?.lease_suggestions[suggestion] : undefined
    dirty.current = false
    setCard((prev) => ({ key, prefill: s ? leaseDrafts([s.lease], ready.partners) : undefined, restore, n: (prev?.n ?? 0) + 1 }))
  }

  function closeCard() {
    setCard(null)
    restoreLocationHash(hashOf('leases', selected, null))
  }

  // Opened on a card (back from a voucher, or the address): open it once the object is here, if it
  // can still be edited.
  useEffect(() => {
    if (!d || !routeCard) return
    const key = 'lease' in routeCard ? routeCard.lease : null
    const editable = d.status !== 'sold' && !d.read_only && (key == null || (d.doc.leases ?? []).some((l) => l.key === key))
    if (editable) void openLeaseCard(key, undefined, true)
    else restoreLocationHash(hashOf('leases', selected, null))
    // When the data first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  /** The edit page on this tab: the overview's fields are the basics. */
  const edit = (on: ViewTab = tab, intent?: PropertyEditIntent) => onEdit(on === 'overview' ? undefined : on, intent)

  const s = d?.summary
  const held = d?.status !== 'sold'
  const showLeases = d ? held || d.leases.length > 0 || d.lease_suggestions.length > 0 : false
  // A parking space or garage has no water to settle: the tab shows only what is stored there.
  const showWater = d ? (held && !isParkingKind(d.kind)) || d.water.settlements.length > 0 || d.water.suggestions.length > 0 : false
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
              onAdd={(on) => (on === 'leases' ? void openLeaseCard(null) : edit(on, { add: true }))}
              onOpenDue={(w) => (w.lease_key ? void openLeaseCard(w.lease_key) : selectTab('leases'))}
              onSkip={d.read_only ? undefined : (skip) => skipDoc(d, skip)}
              onOpenVoucher={(v) => openVoucher(v)}
              cashFlow={
                <CashFlowPanel
                  d={d}
                  allMonths={allMonths}
                  onAllMonths={setAllMonths}
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
              editing={card && inputs ? (card.key ?? 'new') : null}
              form={
                card && inputs ? (
                  <LeaseCardEdit
                    key={`${card.key ?? 'new'}-${card.n}`}
                    detail={d}
                    inputs={inputs}
                    bookKey={bookKey}
                    restore={card.restore}
                    leaseKey={card.key}
                    prefill={card.prefill}
                    onSave={saveDoc}
                    onClose={closeCard}
                    onDirty={setDirty}
                    onOpenVoucher={(v) => openVoucher(v)}
                  />
                ) : null
              }
              onEditLease={held && !d.read_only ? (key) => void openLeaseCard(key) : undefined}
              onAddSuggestion={held && !d.read_only ? (i) => void openLeaseCard(null, i) : undefined}
              onAdd={held && !d.read_only ? () => void openLeaseCard(null) : undefined}
              onOpenVoucher={(v) => openVoucher(v)}
              onSaveException={d.read_only ? undefined : (leaseKey, exception, replaces) => saveException(d, leaseKey, exception, replaces)}
              parkingObject={isParkingKind(d.kind)}
            />
          </TabPanel>

          <TabPanel id="water" idPrefix="property" active={active === 'water'}>
            <WaterPanel
              water={d.water}
              held={held}
              onEdit={() => edit('water')}
              onAdd={held && !d.read_only ? () => edit('water', { add: true }) : undefined}
              onOpenVoucher={(v) => openVoucher(v)}
            />
          </TabPanel>

          <TabPanel id="docs" idPrefix="property" active={active === 'docs'}>
            {docs.error ? <p className="error">{docs.error}</p> : null}
            {docs.data ? (
              <Documents
                data={docs.data}
                bank={bank}
                onBank={setBank}
                onAdd={d.read_only ? undefined : () => edit('docs', { add: true })}
                onOpenVoucher={(v) => openVoucher(v)}
              />
            ) : null}
          </TabPanel>

          <TabPanel id="finance" idPrefix="property" active={active === 'finance'}>
            <PropertyFinance
              d={d}
              onTarget={setTargetBp}
              onAdd={d.read_only ? undefined : () => edit('finance', { add: true })}
              onEdit={() => edit('finance')}
              onOpenVoucher={openVoucher}
            />
          </TabPanel>
        </>
      ) : null}
    </div>
  )
}
