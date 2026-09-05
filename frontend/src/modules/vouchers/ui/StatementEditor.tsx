import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchBankStatementOverlay } from '../../../api'
import {
  clearOwnRowRaw,
  emptyOwnRow,
  matchAndHideDuplicates,
  mergeStatementDisplayRows,
  statementBalances,
  type StatementOtherRow,
  type StatementOwnRow,
  type StatementRow,
} from '../../../book/bankStatement'
import { formatEurInput, parseEurInput } from '../../../shared/money'
import { formatDate } from '../../../shared/dates'
import { getBcp47 } from '../../../i18n'
import { nativePickerFocusProps } from '../../../shared/nativePicker'
import { SearchSelect, type SearchItem } from '../../../shared/SearchSelect'
import { EuroInput } from '../../../shared/EuroInput'
import { useColumnResize } from '../../../shared/useColumnResize'
import { sortRows, useTableSort } from '../../../shared/useTableSort'
import { useI18n } from '../../../i18n'
import { vatFromKey, vatKey, vatPercentLabel } from '../../vat/ui/vatCodes'
import { VatIcon } from '../../vat/ui/VatIcon'
import { ColResizeHandle } from './ColResizeHandle'
import { SortTh } from './SortTh'
import { VatSelect } from './VatSelect'

type Props = {
  startDate: string
  endDate: string
  bankAccount: string
  voucherId: number | null
  ownRows: StatementOwnRow[]
  onOwnRowsChange: (rows: StatementOwnRow[]) => void
  onStartDate: (v: string) => void
  onEndDate: (v: string) => void
  onBankAccount: (v: string) => void
  bankItems: SearchItem[]
  accountItems: SearchItem[]
  allocationItems: SearchItem[]
  vatLiable: boolean
  disabled?: boolean
  onOpenVoucher: (id: number) => void
  onSplitRow: (row: StatementOwnRow) => void
}

const STATEMENT_COL_WIDTHS = {
  date: 118,
  payee: 150,
  description: 180,
  account: 176,
  vat: 88,
  allocation: 130,
  sign: 40,
  amount: 110,
}

const STATEMENT_COL_MINS = {
  date: 96,
  payee: 90,
  description: 100,
  account: 120,
  vat: 64,
  allocation: 80,
  sign: 32,
  amount: 72,
}

function patchOwn(
  row: StatementOwnRow,
  patch: Partial<StatementOwnRow>,
): StatementOwnRow {
  return clearOwnRowRaw({ ...row, ...patch, hidden: false })
}

function sortValue(key: string, row: StatementRow): string | number {
  switch (key) {
    case 'date':
      return row.date
    case 'payee':
      return row.payee
    case 'description':
      return row.description
    case 'account':
      return row.counterAccount ?? 0
    case 'vat':
      return row.vat_percent ?? row.vat_code ?? 0
    case 'allocation':
      return row.kind === 'other' ? row.voucherRef : row.allocation
    case 'amount':
    case 'sign':
      return row.amountCents
    default:
      return ''
  }
}

function FlowIcon({ cents }: { cents: number }) {
  if (!cents) return <span className="statement-flow-icon is-empty" aria-hidden />
  const income = cents > 0
  return (
    <span
      className={`voucher-type-icon statement-flow-icon ${income ? 'kind-income' : 'kind-expense'}`}
      title={income ? '+' : '−'}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="voucher-type-glyph">
        <path
          fill="currentColor"
          d={
            income
              ? 'M10.25 4.5h3.5v5.75h5.75v3.5h-5.75v5.75h-3.5v-5.75H4.5v-3.5h5.75V4.5z'
              : 'M4.5 10.25h15v3.5H4.5z'
          }
        />
      </svg>
    </span>
  )
}

export function StatementEditor({
  startDate,
  endDate,
  bankAccount,
  voucherId,
  ownRows,
  onOwnRowsChange,
  onStartDate,
  onEndDate,
  onBankAccount,
  bankItems,
  accountItems,
  allocationItems,
  vatLiable,
  disabled,
  onOpenVoucher,
  onSplitRow,
}: Props) {
  const { t } = useI18n()
  const dateLang = getBcp47()
  const datePicker = nativePickerFocusProps(dateLang)
  const [other, setOther] = useState<StatementOtherRow[]>([])
  const [openingCents, setOpeningCents] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [overlayError, setOverlayError] = useState<string | null>(null)
  const cols = useColumnResize('tilari.statement.cols', STATEMENT_COL_WIDTHS, STATEMENT_COL_MINS)
  const tableSort = useTableSort()
  const resizeLabel = t('browse.resizeColumn')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const account = Number(bankAccount)
    if (!account || !startDate || !endDate) {
      setOther([])
      setOpeningCents(0)
      return
    }
    let cancelled = false
    fetchBankStatementOverlay({
      account,
      startDate,
      endDate,
      excludeVoucherId: voucherId,
    })
      .then((res) => {
        if (cancelled) return
        setOther(res.other)
        setOpeningCents(res.opening_cents)
        setOverlayError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setOther([])
        setOpeningCents(0)
        setOverlayError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [bankAccount, startDate, endDate, voucherId])

  const matchedOwn = useMemo(
    () => matchAndHideDuplicates(ownRows, other),
    [ownRows, other],
  )

  const displayRows = useMemo(() => {
    const merged = mergeStatementDisplayRows(matchedOwn, other)
    return sortRows(merged, tableSort.sort, sortValue)
  }, [matchedOwn, other, tableSort.sort])

  const balances = useMemo(
    () => statementBalances(openingCents, matchedOwn, other),
    [openingCents, matchedOwn, other],
  )

  const selected = displayRows.find((r) => r.key === selectedKey) ?? null

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

  function updateOwn(key: string, patch: Partial<StatementOwnRow>) {
    onOwnRowsChange(ownRows.map((r) => (r.key === key ? patchOwn(r, patch) : r)))
  }

  function addRow() {
    const row = emptyOwnRow(endDate || startDate || new Date().toISOString().slice(0, 10))
    onOwnRowsChange([...ownRows, row])
    setSelectedKey(row.key)
  }

  function removeSelected() {
    if (!selected || selected.kind !== 'own') return
    if (ownRows.length <= 0) return
    onOwnRowsChange(ownRows.filter((r) => r.key !== selected.key))
    setSelectedKey(null)
  }

  function focusCell(rowKey: string, col: string) {
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(rowKey)}"][data-col="${CSS.escape(col)}"]`,
    )
    if (!el) return
    el.focus()
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function focusRow(rowKey: string) {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `tr[data-row-key="${CSS.escape(rowKey)}"]`,
    )
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function navigateRow(
    fromKey: string,
    col: string,
    dir: 1 | -1,
    opts?: { rowOnly?: boolean },
  ) {
    const idx = displayRows.findIndex((r) => r.key === fromKey)
    if (idx < 0) return
    const next = displayRows[idx + dir]
    if (!next) return
    setSelectedKey(next.key)
    requestAnimationFrame(() => {
      if (opts?.rowOnly || next.kind === 'other') {
        focusRow(next.key)
        return
      }
      focusCell(next.key, col)
    })
  }

  function onRowArrow(rowKey: string, col: string) {
    return (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      navigateRow(rowKey, col, e.key === 'ArrowDown' ? 1 : -1)
    }
  }

  function verticalNav(rowKey: string, col: string) {
    return (dir: 1 | -1) => navigateRow(rowKey, col, dir)
  }

  function selectRow(key: string, e?: { currentTarget: EventTarget; target: EventTarget }) {
    setSelectedKey(key)
    if (!e) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, button, a, .search-select, .icon-select, .vat-select')) {
      return
    }
    ;(e.currentTarget as HTMLElement).focus({ preventScroll: true })
  }

  function onTableKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (!selectedKey) return
    const target = e.target as HTMLElement
    if (
      target.closest(
        'input:not([readonly]), textarea, select, button.icon-select-btn, .search-select input',
      )
    ) {
      return
    }
    e.preventDefault()
    navigateRow(selectedKey, 'payee', e.key === 'ArrowDown' ? 1 : -1, { rowOnly: true })
  }

  function renderOwn(row: StatementOwnRow) {
    const amountStr = formatEurInput(row.amountCents, { emptyZero: true })
    return (
      <tr
        key={row.key}
        data-row-key={row.key}
        tabIndex={0}
        className={selectedKey === row.key ? 'is-selected' : undefined}
        onClick={(e) => selectRow(row.key, e)}
        onFocusCapture={() => setSelectedKey(row.key)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          if ((e.target as HTMLElement).closest('input, textarea, select, button, .search-select')) {
            return
          }
          e.preventDefault()
          navigateRow(row.key, 'payee', e.key === 'ArrowDown' ? 1 : -1, { rowOnly: true })
        }}
      >
        <td>
          <input
            type="date"
            data-row-key={row.key}
            data-col="date"
            value={row.date}
            disabled={disabled}
            {...datePicker}
            onChange={(e) => updateOwn(row.key, { date: e.target.value })}
            onKeyDown={onRowArrow(row.key, 'date')}
          />
        </td>
        <td>
          <input
            data-row-key={row.key}
            data-col="payee"
            value={row.payee}
            disabled={disabled}
            onChange={(e) => updateOwn(row.key, { payee: e.target.value })}
            onKeyDown={onRowArrow(row.key, 'payee')}
          />
        </td>
        <td>
          <input
            data-row-key={row.key}
            data-col="description"
            value={row.description}
            disabled={disabled}
            onChange={(e) => updateOwn(row.key, { description: e.target.value })}
            onKeyDown={onRowArrow(row.key, 'description')}
          />
        </td>
        <td>
          <SearchSelect
            items={accountItems}
            value={row.counterAccount != null ? String(row.counterAccount) : ''}
            disabled={disabled}
            fixedMenu
            menuMinWidthPx={280}
            data-row-key={row.key}
            data-col="account"
            onVerticalNav={verticalNav(row.key, 'account')}
            onChange={(v) =>
              updateOwn(row.key, { counterAccount: v ? Number(v) : null })
            }
            placeholder={t('editor.searchAccount')}
          />
        </td>
        {vatLiable ? (
          <td>
            <VatSelect
              value={vatKey(row.vat_code || 0, Number(row.vat_percent || 0))}
              voucherType={400}
              disabled={disabled}
              fixedMenu
              data-row-key={row.key}
              data-col="vat"
              onVerticalNav={verticalNav(row.key, 'vat')}
              aria-label={t('table.vat')}
              onChange={(key) => {
                const c = vatFromKey(key)
                updateOwn(row.key, {
                  vat_code: c.code,
                  vat_percent: c.percent || null,
                })
              }}
            />
          </td>
        ) : null}
        <td>
          <SearchSelect
            items={allocationItems}
            value={String(row.allocation || 0)}
            disabled={disabled}
            fixedMenu
            menuMinWidthPx={420}
            data-row-key={row.key}
            data-col="allocation"
            onVerticalNav={verticalNav(row.key, 'allocation')}
            onChange={(v) => updateOwn(row.key, { allocation: Number(v || 0) })}
          />
        </td>
        <td className="statement-status">
          <FlowIcon cents={row.amountCents} />
        </td>
        <td className="num">
          <EuroInput
            data-row-key={row.key}
            data-col="amount"
            value={amountStr}
            disabled={disabled}
            onChange={(v) => updateOwn(row.key, { amountCents: parseEurInput(v) })}
            onKeyDown={onRowArrow(row.key, 'amount')}
          />
        </td>
      </tr>
    )
  }

  function renderOther(row: StatementOtherRow) {
    const accountLabel =
      row.counterAccounts.length > 1
        ? row.counterAccounts.join(', ')
        : row.counterAccount != null
          ? accountItems.find((a) => a.value === String(row.counterAccount))?.label ||
            String(row.counterAccount)
          : '—'
    const amountStr = formatEurInput(row.amountCents, { emptyZero: true })
    return (
      <tr
        key={row.key}
        data-row-key={row.key}
        tabIndex={0}
        className={[
          'statement-other-row',
          selectedKey === row.key ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => selectRow(row.key, e)}
        onFocusCapture={() => setSelectedKey(row.key)}
        onDoubleClick={() => onOpenVoucher(row.voucherId)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
            e.preventDefault()
            navigateRow(row.key, 'payee', e.key === 'ArrowDown' ? 1 : -1, { rowOnly: true })
          } else if (e.key === 'Enter') {
            e.preventDefault()
            onOpenVoucher(row.voucherId)
          }
        }}
      >
        <td>
          <span className="statement-cell-text">{formatDate(row.date)}</span>
        </td>
        <td>
          <span className="statement-cell-text" data-row-key={row.key} data-col="payee">
            {row.payee || '—'}
          </span>
        </td>
        <td>
          <span className="statement-cell-text">{row.description || '—'}</span>
        </td>
        <td>
          <span className="statement-cell-text">{accountLabel}</span>
        </td>
        {vatLiable ? (
          <td>
            {row.vat_code || row.vat_percent ? (
              <span className="browse-vat-cell statement-vat-cell">
                {row.vat_code ? <VatIcon code={row.vat_code} /> : null}
                {row.vat_percent != null ? vatPercentLabel(row.vat_percent) : null}
              </span>
            ) : (
              <span className="statement-cell-text">—</span>
            )}
          </td>
        ) : null}
        <td>
          <button
            type="button"
            className="btn-link statement-cell-text"
            data-row-key={row.key}
            data-col="allocation"
            onClick={(e) => {
              e.stopPropagation()
              onOpenVoucher(row.voucherId)
            }}
          >
            {row.voucherRef}
          </button>
        </td>
        <td className="statement-status">
          <FlowIcon cents={row.amountCents} />
        </td>
        <td className="num">
          <span className="statement-cell-text amount-plain">{amountStr}</span>
        </td>
      </tr>
    )
  }

  function renderRow(row: StatementRow) {
    return row.kind === 'own' ? renderOwn(row) : renderOther(row)
  }

  const colSpan = vatLiable ? 8 : 7

  return (
    <section className="statement-editor">
      <div className="statement-editor-meta voucher-meta-row">
        <label>
          {t('editor.statementStart')}
          <input
            type="date"
            value={startDate}
            disabled={disabled}
            {...datePicker}
            onChange={(e) => onStartDate(e.target.value)}
          />
        </label>
        <label>
          {t('editor.statementEnd')}
          <input
            type="date"
            value={endDate}
            disabled={disabled}
            {...datePicker}
            onChange={(e) => onEndDate(e.target.value)}
          />
        </label>
        <label className="grow">
          {t('editor.bankAccount')}
          <SearchSelect
            items={bankItems.length ? bankItems : accountItems}
            value={bankAccount}
            disabled={disabled}
            fixedMenu
            menuMinWidthPx={280}
            onChange={onBankAccount}
            placeholder={t('editor.searchAccount')}
          />
        </label>
      </div>

      {overlayError ? <p className="error statement-editor-error">{overlayError}</p> : null}

      <div
        className="statement-table-scroll entries-edit"
        ref={scrollRef}
        tabIndex={-1}
        onKeyDown={onTableKeyDown}
      >
        <table
          className={`ledger-table dense resizable statement-table${cols.dragging ? ' is-resizing' : ''}`}
        >
          <colgroup>
            <col style={{ width: cols.widths.date }} />
            <col style={{ width: cols.widths.payee }} />
            <col style={{ width: cols.widths.description }} />
            <col style={{ width: cols.widths.account }} />
            {vatLiable ? <col style={{ width: cols.widths.vat }} /> : null}
            <col style={{ width: cols.widths.allocation }} />
            <col style={{ width: cols.widths.sign }} />
            <col style={{ width: cols.widths.amount }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh id="date" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('date')}>
                {t('table.date')}
              </SortTh>
              <SortTh id="payee" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('payee')}>
                {t('editor.payee')}
              </SortTh>
              <SortTh
                id="description"
                sort={tableSort.sort}
                onToggle={tableSort.toggle}
                resize={resize('description')}
              >
                {t('table.description')}
              </SortTh>
              <SortTh
                id="account"
                sort={tableSort.sort}
                onToggle={tableSort.toggle}
                resize={resize('account')}
              >
                {t('table.account')}
              </SortTh>
              {vatLiable ? (
                <SortTh id="vat" sort={tableSort.sort} onToggle={tableSort.toggle} resize={resize('vat')}>
                  {t('table.vat')}
                </SortTh>
              ) : null}
              <SortTh
                id="allocation"
                sort={tableSort.sort}
                onToggle={tableSort.toggle}
                resize={resize('allocation')}
              >
                {t('table.allocation')}
              </SortTh>
              <th className="statement-status-th" aria-label={t('editor.statementSign')}>
                <span className="sort-th-label" />
                {resize('sign')}
              </th>
              <SortTh
                id="amount"
                sort={tableSort.sort}
                onToggle={tableSort.toggle}
                className="num"
                resize={resize('amount')}
              >
                {t('table.amount')}
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {displayRows.length ? (
              displayRows.map(renderRow)
            ) : (
              <tr>
                <td colSpan={colSpan} className="muted">
                  {t('editor.statementEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="statement-editor-bar">
        <div className="statement-balance-strip" aria-live="polite">
          <span>
            {t('editor.openingBalance')}: <strong>{formatEurInput(balances.opening_cents)}</strong>
          </span>
          <span>
            {t('editor.deposits')}: <strong>{formatEurInput(balances.deposits_cents)}</strong>
          </span>
          <span>
            {t('editor.withdrawals')}: <strong>{formatEurInput(balances.withdrawals_cents)}</strong>
          </span>
          <span>
            {t('editor.closingBalance')}: <strong>{formatEurInput(balances.closing_cents)}</strong>
          </span>
        </div>
        <div className="statement-editor-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || !selected}
            title={
              !selected
                ? t('editor.statementSelectRow')
                : selected.kind === 'other'
                  ? t('editor.statementOpenLinked')
                  : t('editor.statementSplitHint')
            }
            onClick={() => {
              if (!selected) return
              if (selected.kind === 'other') onOpenVoucher(selected.voucherId)
              else onSplitRow(selected)
            }}
          >
            {t('editor.openVoucher')}
          </button>
          <button type="button" className="btn-secondary" disabled={disabled} onClick={addRow}>
            {t('editor.addEmptyRow')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || !selected || selected.kind !== 'own'}
            onClick={removeSelected}
          >
            {t('editor.removeRow')}
          </button>
        </div>
      </div>
    </section>
  )
}
