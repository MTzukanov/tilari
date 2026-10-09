import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { voucherSortKey } from '../../../shared/useTableSort'
import { TYPE_ACCRUAL } from '../../../book/vouchers'
import type { MonthLine } from '../api'
import { lineText, monthName } from './format'

/** A correction moved here from a later booking date (it counts on the corrected booking's date). */
function moved(line: MonthLine): boolean {
  return line.counted_date !== line.entry.date
}

/** The month's lines behind the cash-flow bars; rows open their voucher. */
export function MonthLinesPanel({
  month,
  lines,
  locale,
  labels,
  onClose,
  onOpenVoucher,
  onOpenAllocation,
}: {
  month: string
  lines: MonthLine[]
  locale: string
  labels: { income: string; expense: string }
  onClose: () => void
  onOpenVoucher: (voucherId: number, entryId: number) => void
  onOpenAllocation: () => void
}) {
  const { t } = useI18n()
  const income = lines.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount_snt, 0)
  const costs = lines.filter((l) => l.kind !== 'income').reduce((s, l) => s + l.amount_snt, 0)
  const columns: TableColumn<MonthLine>[] = [
    {
      id: 'date',
      label: t('table.date'),
      width: 150,
      sortValue: (l) => l.counted_date,
      cellClass: () => 'num',
      render: (l) => (
        <>
          {formatDate(l.counted_date)}
          {moved(l) ? (
            <span className="property-line-tag" title={t('properties.month.movedHint')}>
              {t('properties.month.moved', { date: formatDate(l.entry.date) })}
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: 'voucher',
      label: t('table.voucher'),
      width: 96,
      sortValue: (l) => voucherSortKey(l.entry.voucher.series, l.entry.voucher.doc_number, l.entry.voucher.date),
      cellClass: () => 'num',
      render: (l) =>
        formatVoucherId(l.entry.voucher.series, l.entry.voucher.doc_number, l.entry.voucher.date, { yearDigits: 2 }),
    },
    {
      id: 'account',
      label: t('table.account'),
      width: 210,
      sortValue: (l) => l.entry.account,
      render: (l) => `${l.entry.account} ${l.entry.account_name}`,
    },
    {
      id: 'text',
      label: t('table.description'),
      width: 340,
      sortValue: (l) => lineText(l),
      render: (l) => (
        <>
          {lineText(l)}
          {l.kind === 'interest' ? <span className="property-line-tag">{t('properties.month.interest')}</span> : null}
          {l.entry.voucher.type === TYPE_ACCRUAL ? (
            <span className="property-line-tag">{t('properties.month.accrual')}</span>
          ) : null}
        </>
      ),
    },
    {
      id: 'amount',
      label: t('table.amount'),
      width: 120,
      align: 'right',
      sortValue: (l) => l.amount_snt,
      cellClass: (l) => (l.amount_snt < 0 ? 'neg' : ''),
      render: (l) => formatCents(l.amount_snt),
    },
  ]

  return (
    <div className="property-month-lines">
      <div className="property-month-head">
        <h4>{t('properties.month.title', { month: monthName(month, locale) })}</h4>
        <span className="browse-count muted">
          <span>
            {labels.income} {formatCents(income)}
          </span>
          <span>
            {labels.expense} {formatCents(costs)}
          </span>
        </span>
        <button type="button" className="btn-link" onClick={onOpenAllocation} title={t('properties.month.openAllocationHint')}>
          {t('properties.month.openAllocation')}
        </button>
        <button type="button" className="btn-link" onClick={onClose}>
          {t('properties.month.close')}
        </button>
      </div>
      {lines.length ? (
        <SortableTable
          storageKey="tilari.properties.monthLines.cols"
          columns={columns}
          rows={lines}
          rowKey={(l) => l.entry.id}
          rowTitle={t('voucher.openVoucher')}
          onRowClick={(l) => onOpenVoucher(l.entry.voucher.id, l.entry.id)}
        />
      ) : (
        <p className="empty">{t('properties.month.empty')}</p>
      )}
    </div>
  )
}
