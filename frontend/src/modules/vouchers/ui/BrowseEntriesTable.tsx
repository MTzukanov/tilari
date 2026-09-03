import { useMemo } from 'react'
import type { BrowseEntry } from '../../../book/types'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import { useColumnResize } from '../../../shared/useColumnResize'
import { sortRows, useTableSort, voucherSortKey } from '../../../shared/useTableSort'
import { VatIcon } from '../../vat/ui/VatIcon'
import { ColResizeHandle } from './ColResizeHandle'
import { SortTh } from './SortTh'
import { AttachmentClip } from './AttachmentClip'
import { StatusMark, statusDotKind, statusDotTitleKey } from './browseMarks'
import { VoucherTypeIcon } from './VoucherTypeIcon'

const ENTRY_COL_WIDTHS = {
  voucher: 120,
  date: 108,
  account: 176,
  debit: 96,
  credit: 96,
  allocation: 120,
  partner: 140,
  vat: 72,
}

const ENTRY_COL_MINS = { voucher: 108 }

function formatVatPercent(n: number | null) {
  if (n == null || n === 0) return ''
  return `${String(n).replace('.', ',')} %`
}

function BrowseKohdennus({ row }: { row: BrowseEntry }) {
  const { t } = useI18n()
  const era = row.era
  const allocation = row.allocation ? row.allocation_name : ''
  const eraLabel =
    era && !era.is_open
      ? formatVoucherId(era.series, era.doc_number, era.date, { yearDigits: 2 })
      : ''
  if (!era && !allocation) return null
  const title = era
    ? [era.name, `${t('browse.eraBalanceNow')} ${formatCents(era.balance_cents)}`].filter(Boolean).join(' · ')
    : undefined
  return (
    <span className="browse-kohdennus" title={title}>
      {era?.paid ? (
        <span className="browse-era-paid" aria-hidden>
          ✓
        </span>
      ) : null}
      {eraLabel}
      {allocation}
    </span>
  )
}

export function BrowseEntriesTable({
  rows,
  showVat,
  onOpen,
}: {
  rows: BrowseEntry[]
  showVat: boolean
  onOpen: (voucherId: number, entryId: number) => void
}) {
  const { t } = useI18n()
  const cols = useColumnResize('tilari.browse.entryCols', ENTRY_COL_WIDTHS, ENTRY_COL_MINS)
  const tableSort = useTableSort()
  const resizeLabel = t('browse.resizeColumn')
  const sorted = useMemo(
    () =>
      sortRows(rows, tableSort.sort, (key, row) => {
        if (key === 'voucher') {
          return voucherSortKey(row.voucher.series, row.voucher.doc_number, row.voucher.date || row.date)
        }
        if (key === 'date') return row.date
        if (key === 'account') return row.account
        if (key === 'debit') return row.debit_cents ?? 0
        if (key === 'credit') return row.credit_cents ?? 0
        if (key === 'allocation') {
          if (row.era && !row.era.is_open) {
            return voucherSortKey(row.era.series, row.era.doc_number, row.era.date)
          }
          return row.allocation ? row.allocation_name : ''
        }
        if (key === 'partner') return row.partner?.name || ''
        if (key === 'vat') return row.vat_percent ?? 0
        return row.description || ''
      }),
    [rows, tableSort.sort],
  )
  const groupedZebra = !tableSort.sort

  let alt = false
  let lastVoucher: number | null = null

  function resize(id: string) {
    return (
      <ColResizeHandle
        id={id}
        dragging={cols.dragging}
        label={resizeLabel}
        onPointerDown={cols.onResizePointerDown}
      />
    )
  }

  return (
    <table
      className={`ledger-table ${groupedZebra ? 'zebra-voucher' : 'zebra'} dense resizable${cols.dragging ? ' is-resizing' : ''}`}
    >
      <colgroup>
        <col style={{ width: cols.widths.voucher }} />
        <col style={{ width: cols.widths.date }} />
        <col style={{ width: cols.widths.account }} />
        <col style={{ width: cols.widths.debit }} />
        <col style={{ width: cols.widths.credit }} />
        <col style={{ width: cols.widths.allocation }} />
        <col style={{ width: cols.widths.partner }} />
        {showVat ? <col style={{ width: cols.widths.vat }} /> : null}
        <col />
      </colgroup>
      <thead>
        <tr>
          <SortTh id="voucher" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('voucher')}>
            {t('table.voucher')}
          </SortTh>
          <SortTh id="date" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('date')}>
            {t('table.date')}
          </SortTh>
          <SortTh id="account" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('account')}>
            {t('table.account')}
          </SortTh>
          <SortTh
            id="debit"
            sort={tableSort.sort}
            onToggle={tableSort.toggle}
            className="amount"
            resize={resize('debit')}
          >
            {t('table.debit')}
          </SortTh>
          <SortTh
            id="credit"
            sort={tableSort.sort}
            onToggle={tableSort.toggle}
            className="amount"
            resize={resize('credit')}
          >
            {t('table.credit')}
          </SortTh>
          <SortTh
            id="allocation"
            sort={tableSort.sort}
            onToggle={tableSort.toggle}
            resize={resize('allocation')}
          >
            {t('table.allocation')}
          </SortTh>
          <SortTh id="partner" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('partner')}>
            {t('table.partner')}
          </SortTh>
          {showVat ? (
            <SortTh id="vat" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('vat')}>
              {t('table.vat')}
            </SortTh>
          ) : null}
          <SortTh id="description" sort={tableSort.sort} onToggle={tableSort.toggle}>
            {t('table.description')}
          </SortTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          if (lastVoucher != null && row.voucher.id !== lastVoucher) alt = !alt
          lastVoucher = row.voucher.id
          const kind = statusDotKind(row.voucher.status)
          const partnerName = row.partner?.name || ''
          const narration = row.description === partnerName ? '' : row.description
          const vatPct = formatVatPercent(row.vat_percent)
          const vatCode = row.vat_code ?? 0
          return (
            <tr
              key={row.id}
              className={`clickable${alt ? ' is-alt' : ''}${row.account === 0 ? ' is-unposted' : ''}`}
              tabIndex={0}
              onClick={() => onOpen(row.voucher.id, row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(row.voucher.id, row.id)
                }
              }}
            >
              <td className="num">
                <span className="voucher-id-cell">
                  <span title={t(statusDotTitleKey(kind))}>
                    <StatusMark kind={kind} />
                  </span>
                  <span className="voucher-id-num">
                    {formatVoucherId(row.voucher.series, row.voucher.doc_number, row.voucher.date || row.date, {
                      yearDigits: 2,
                    })}
                  </span>
                  <span
                    className={`browse-clip${row.attachment_count ? '' : ' is-empty'}`}
                    title={row.attachment_count ? t('browse.attachment') : undefined}
                  >
                        <AttachmentClip />
                  </span>
                </span>
              </td>
              <td className="num">
                <span className="browse-date-cell">
                  <VoucherTypeIcon type={row.voucher.type} />
                  {formatDate(row.date)}
                </span>
              </td>
              <td>
                {row.account} {row.account_name}
              </td>
              <td className="amount">{formatCents(row.debit_cents, { emptyZero: true })}</td>
              <td className="amount">{formatCents(row.credit_cents, { emptyZero: true })}</td>
              <td>
                <BrowseKohdennus row={row} />
              </td>
              <td>{partnerName}</td>
              {showVat ? (
                <td>
                  {vatCode || vatPct ? (
                    <span className="browse-vat-cell">
                      {vatCode ? <VatIcon code={vatCode} /> : null}
                      {vatPct}
                    </span>
                  ) : null}
                </td>
              ) : null}
              <td>{narration}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
