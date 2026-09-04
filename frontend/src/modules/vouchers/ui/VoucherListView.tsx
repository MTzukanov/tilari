import { useEffect, useMemo, useState } from 'react'
import {
  fetchBrowseEntries,
  fetchSettings,
  fetchVouchers,
  type Period,
} from '../../../api'
import type { BrowseAccountOption, BrowseEntry, VoucherListItem } from '../../../book/types'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { isVatLiableSetting } from '../../../book/settings'
import { browseFilterTypes } from '../catalog'
import { AttachmentClip } from './AttachmentClip'
import { BrowseEntriesTable } from './BrowseEntriesTable'
import { ColResizeHandle } from './ColResizeHandle'
import { SortTh } from './SortTh'
import { StatusAllMark, StatusMark, statusDotKind, statusDotTitleKey } from './browseMarks'
import { VoucherKind } from './VoucherKind'
import { VoucherTypeIcon } from './VoucherTypeIcon'
import { IconSelect, type IconSelectOption } from './IconSelect'
import { usePeriodNav } from '../../../shared/usePeriodNav'
import { useColumnResize } from '../../../shared/useColumnResize'
import { sortRows, useTableSort, voucherSortKey } from '../../../shared/useTableSort'

type BrowseMode = 'vouchers' | 'entries'
type StatusFilter = 'posted' | 'draft' | 'deleted' | 'all'
type StatusSet = `${BrowseMode}:${StatusFilter}`
type TypeFilter = 'all' | number
type AccountFilter = 'all' | number

const BROWSE_COL_WIDTHS = {
  voucher: 120,
  date: 88,
  kind: 128,
  amount: 108,
  partner: 160,
}

const BROWSE_COL_MINS = { voucher: 108, kind: 34 }

const STATUS_LEAVES: { value: StatusFilter; kind: 'posted' | 'draft' | 'deleted' | 'all' }[] = [
  { value: 'posted', kind: 'posted' },
  { value: 'draft', kind: 'draft' },
  { value: 'deleted', kind: 'deleted' },
  { value: 'all', kind: 'all' },
]

function parseStatusSet(value: StatusSet): { mode: BrowseMode; status: StatusFilter } {
  const [mode, status] = value.split(':') as [BrowseMode, StatusFilter]
  return { mode, status }
}

type BrowseData =
  | { kind: 'vouchers'; vouchers: VoucherListItem[] }
  | {
      kind: 'entries'
      entries: BrowseEntry[]
      accounts: BrowseAccountOption[]
      debit_sum_cents: number
      credit_sum_cents: number
    }

export function VoucherListView({
  periods,
  onOpen,
}: {
  periods: Period[]
  onOpen: (id: number, entryId?: number) => void
}) {
  const { t } = useI18n()
  const last = periods.at(-1)
  const nav = usePeriodNav(periods, last?.starts ?? '', last?.ends ?? '')
  const [type, setType] = useState<TypeFilter>('all')
  const [mode, setMode] = useState<BrowseMode>('vouchers')
  const [voucherStatus, setVoucherStatus] = useState<StatusFilter>('posted')
  const [entryStatus, setEntryStatus] = useState<StatusFilter>('posted')
  const [huomio, setHuomio] = useState(false)
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [account, setAccount] = useState<AccountFilter>('all')
  const [vatLiable, setVatLiable] = useState(true)
  const cols = useColumnResize('tilari.browse.cols', BROWSE_COL_WIDTHS, BROWSE_COL_MINS)
  const voucherSort = useTableSort()

  const status = mode === 'entries' ? entryStatus : voucherStatus
  const statusValue: StatusSet = `${mode}:${status}`
  const isEntries = mode === 'entries'

  useEffect(() => {
    const id = window.setTimeout(() => setQDebounced(q.trim()), 250)
    return () => window.clearTimeout(id)
  }, [q])

  useEffect(() => {
    void fetchSettings().then((s) => {
      setVatLiable(isVatLiableSetting(s.company.AlvVelvollinen))
    })
  }, [])

  const { data, error, loading } = usePeriodQuery<BrowseData>(
    () =>
      isEntries
        ? fetchBrowseEntries({
            start_date: nav.start_date,
            end_date: nav.end_date,
            status,
            q: qDebounced || undefined,
            huomio: huomio || undefined,
            account: account === 'all' ? undefined : account,
          }).then((res) => ({
            kind: 'entries' as const,
            entries: res.entries,
            accounts: res.accounts,
            debit_sum_cents: res.debit_sum_cents,
            credit_sum_cents: res.credit_sum_cents,
          }))
        : fetchVouchers({
            start_date: nav.start_date,
            end_date: nav.end_date,
            type: type === 'all' ? undefined : type,
            status,
            q: qDebounced || undefined,
            huomio: huomio || undefined,
          }).then((res) => ({ kind: 'vouchers' as const, vouchers: res.vouchers })),
    [nav.start_date, nav.end_date, type, status, qDebounced, huomio, isEntries, account],
  )

  const voucherRows = data?.kind === 'vouchers' ? data.vouchers : []
  const sortedVoucherRows = useMemo(
    () =>
      sortRows(voucherRows, voucherSort.sort, (key, row) => {
        if (key === 'voucher') return voucherSortKey(row.series, row.doc_number, row.date)
        if (key === 'date') return row.date
        if (key === 'kind') return row.type
        if (key === 'amount') return Math.max(row.debit_cents, row.credit_cents)
        if (key === 'partner') return row.partner?.name || ''
        return row.title || ''
      }),
    [voucherRows, voucherSort.sort],
  )
  const entryRows = data?.kind === 'entries' ? data.entries : []
  const entryAccounts = data?.kind === 'entries' ? data.accounts : []
  const debitSum = data?.kind === 'entries' ? data.debit_sum_cents : 0
  const creditSum = data?.kind === 'entries' ? data.credit_sum_cents : 0

  useEffect(() => {
    if (account === 'all' || data?.kind !== 'entries') return
    if (!data.accounts.some((a) => a.number === account)) setAccount('all')
  }, [account, data])

  const voucherGroup = t('browse.groupVouchers')
  const entriesGroup = t('browse.groupEntries')

  const statusOptions = useMemo<IconSelectOption<StatusSet>[]>(() => {
    const leafLabel = (value: StatusFilter) => {
      if (value === 'posted') return t('browse.posted')
      if (value === 'draft') return t('browse.drafts')
      if (value === 'deleted') return t('browse.deleted')
      return t('browse.allStatuses')
    }
    const leafIcon = (kind: (typeof STATUS_LEAVES)[number]['kind']) =>
      kind === 'all' ? <StatusAllMark /> : <StatusMark kind={kind} />
    return [
      ...STATUS_LEAVES.map((leaf) => ({
        value: `vouchers:${leaf.value}` as StatusSet,
        label: leafLabel(leaf.value),
        group: voucherGroup,
        icon: leafIcon(leaf.kind),
      })),
      ...STATUS_LEAVES.map((leaf) => ({
        value: `entries:${leaf.value}` as StatusSet,
        label: leafLabel(leaf.value),
        closedLabel: `${entriesGroup} · ${leafLabel(leaf.value)}`,
        group: entriesGroup,
        icon: leafIcon(leaf.kind),
      })),
    ]
  }, [t, voucherGroup, entriesGroup])

  const typeOptions = useMemo<IconSelectOption<TypeFilter>[]>(
    () => [
      { value: 'all', label: t('browse.allKinds') },
      ...browseFilterTypes().map((def) => ({
        value: def.type as TypeFilter,
        label: t(`voucherType.${def.type}`),
        icon: <VoucherTypeIcon type={def.type} />,
      })),
    ],
    [t],
  )

  const accountOptions = useMemo<IconSelectOption<AccountFilter>[]>(
    () => [
      { value: 'all', label: t('browse.allAccounts') },
      ...entryAccounts.map((a) => ({
        value: a.number as AccountFilter,
        label: a.number === 0 ? t('browse.unpostedAccount') : `${a.number} ${a.name}`.trim(),
      })),
    ],
    [t, entryAccounts],
  )

  const rowCount = isEntries ? entryRows.length : voucherRows.length
  const resizeLabel = t('browse.resizeColumn')

  return (
    <div className="ledger">
      <div className="browse-toolbar">
        <IconSelect
          className="browse-status-select"
          value={statusValue}
          options={statusOptions}
          onChange={(value) => {
            const next = parseStatusSet(value)
            setMode(next.mode)
            if (next.mode === 'entries') setEntryStatus(next.status)
            else setVoucherStatus(next.status)
          }}
          aria-label={t('table.status')}
        />
        <button
          type="button"
          className={`browse-huomio${huomio ? ' is-on' : ''}`}
          aria-pressed={huomio}
          aria-label={t('browse.attention')}
          title={t('browse.attention')}
          onClick={() => setHuomio((v) => !v)}
        >
          !
        </button>
        <PeriodNav
          radioName="browse-nav-mode"
          mode={nav.mode}
          start_date={nav.start_date}
          end_date={nav.end_date}
          canPrev={nav.canPrev}
          canNext={nav.canNext}
          periods={periods}
          onSelectMode={nav.selectMode}
          onSelectRange={nav.selectRange}
          onPrev={nav.goPrev}
          onNext={nav.goNext}
        />
        {isEntries ? (
          <IconSelect
            className="browse-type-select"
            value={account}
            options={accountOptions}
            onChange={setAccount}
            aria-label={t('table.account')}
          />
        ) : (
          <IconSelect
            className="browse-type-select"
            value={type}
            options={typeOptions}
            onChange={setType}
            aria-label={t('table.kind')}
          />
        )}
        <div className="browse-search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('browse.search')}
            aria-label={t('browse.search')}
          />
        </div>
        {loading ? null : isEntries ? (
          <span className="browse-count muted">
            <span>
              {t('table.debit')} {formatCents(debitSum)}
            </span>
            <span>
              {t('table.credit')} {formatCents(creditSum)}
            </span>
            <span>{t('table.count', { n: rowCount })}</span>
          </span>
        ) : (
          <span className="browse-count muted">{t('table.count', { n: rowCount })}</span>
        )}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t('app.loading')}</p> : null}

      {isEntries ? (
        <BrowseEntriesTable
          rows={entryRows}
          showVat={vatLiable}
          onOpen={(voucherId, entryId) => onOpen(voucherId, entryId)}
        />
      ) : (
        <table className={`ledger-table zebra dense resizable${cols.dragging ? ' is-resizing' : ''}`}>
          <colgroup>
            <col style={{ width: cols.widths.voucher }} />
            <col style={{ width: cols.widths.date }} />
            <col style={{ width: cols.widths.kind }} />
            <col style={{ width: cols.widths.amount }} />
            <col style={{ width: cols.widths.partner }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortTh
                id="voucher"
                sort={voucherSort.sort}
                onToggle={voucherSort.toggle}
                resize={
                  <ColResizeHandle
                    id="voucher"
                    dragging={cols.dragging}
                    label={resizeLabel}
                    onPointerDown={cols.onResizePointerDown}
                  />
                }
              >
                {t('table.voucher')}
              </SortTh>
              <SortTh
                id="date"
                sort={voucherSort.sort}
                onToggle={voucherSort.toggle}
                resize={
                  <ColResizeHandle
                    id="date"
                    dragging={cols.dragging}
                    label={resizeLabel}
                    onPointerDown={cols.onResizePointerDown}
                  />
                }
              >
                {t('table.date')}
              </SortTh>
              <SortTh
                id="kind"
                sort={voucherSort.sort}
                onToggle={voucherSort.toggle}
                resize={
                  <ColResizeHandle
                    id="kind"
                    dragging={cols.dragging}
                    label={resizeLabel}
                    onPointerDown={cols.onResizePointerDown}
                  />
                }
              >
                {t('table.kind')}
              </SortTh>
              <SortTh
                id="amount"
                sort={voucherSort.sort}
                onToggle={voucherSort.toggle}
                className="amount"
                resize={
                  <ColResizeHandle
                    id="amount"
                    dragging={cols.dragging}
                    label={resizeLabel}
                    onPointerDown={cols.onResizePointerDown}
                  />
                }
              >
                {t('table.amount')}
              </SortTh>
              <SortTh
                id="partner"
                sort={voucherSort.sort}
                onToggle={voucherSort.toggle}
                resize={
                  <ColResizeHandle
                    id="partner"
                    dragging={cols.dragging}
                    label={resizeLabel}
                    onPointerDown={cols.onResizePointerDown}
                  />
                }
              >
                {t('table.partner')}
              </SortTh>
              <SortTh id="title" sort={voucherSort.sort} onToggle={voucherSort.toggle}>
                {t('table.title')}
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {sortedVoucherRows.map((row) => {
              const summa = Math.max(row.debit_cents, row.credit_cents)
              return (
                <tr
                  key={row.id}
                  className="clickable"
                  tabIndex={0}
                  onClick={() => onOpen(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(row.id)
                    }
                  }}
                >
                  <td className="num">
                    <span className="voucher-id-cell">
                      <span title={t(statusDotTitleKey(statusDotKind(row.status)))}>
                        <StatusMark kind={statusDotKind(row.status)} />
                      </span>
                      {row.huomio ? (
                        <span className="voucher-status-bang" title={t('browse.attention')}>
                          !
                        </span>
                      ) : (
                        <span className="voucher-status-bang" aria-hidden />
                      )}
                      <span className="voucher-id-num">
                        {formatVoucherId(row.series, row.doc_number, row.date, { yearDigits: 2 })}
                      </span>
                      <span
                        className={`browse-clip${row.attachment_count ? '' : ' is-empty'}`}
                        title={row.attachment_count ? t('browse.attachment') : undefined}
                      >
                        <AttachmentClip />
                      </span>
                    </span>
                  </td>
                  <td className="num">{formatDate(row.date)}</td>
                  <td>
                    <VoucherKind type={row.type} />
                  </td>
                  <td className="amount">
                    {formatCents(summa, { emptyZero: true })}
                  </td>
                  <td>{row.partner?.name || ''}</td>
                  <td>{row.title || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
