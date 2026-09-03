import { Fragment, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { fetchBalanceSheetItems, type Period } from '../../../api'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { useI18n } from '../../../i18n'
import { usePeriodNav } from '../../../shared/usePeriodNav'

function itemKey(accountNumber: number, itemId: number): string {
  return `${accountNumber}:item:${itemId}`
}

function unassignedKey(accountNumber: number): string {
  return `${accountNumber}:unassigned`
}

export function BalanceSheetItemsView({
  initialStartDate,
  initialEndDate,
  periods,
  onBack,
  onOpenVoucher,
}: {
  initialStartDate: string
  initialEndDate: string
  periods: Period[]
  onBack: () => void
  onOpenVoucher: (voucherId: number, entryId: number) => void
}) {
  const { t } = useI18n()
  const nav = usePeriodNav(periods, initialStartDate, initialEndDate, 'balance-sheet-items')
  const { data, error, loading } = usePeriodQuery(
    () => fetchBalanceSheetItems(nav.start_date, nav.end_date),
    [nav.start_date, nav.end_date],
  )
  const [expandedEras, setExpandedEras] = useState<Set<string>>(() => new Set())

  const sections = useMemo(() => {
    const accounts = data?.accounts ?? []
    return {
      assets: accounts.filter((a) => a.section === 'assets'),
      liabilities: accounts.filter((a) => a.section === 'liabilities'),
    }
  }, [data])

  const expandableKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const acc of data?.accounts ?? []) {
      for (const item of acc.items) {
        if (item.movements.length > 0) keys.add(itemKey(acc.number, item.era.id))
      }
      if (acc.unassigned.movements.length > 0) keys.add(unassignedKey(acc.number))
    }
    return keys
  }, [data])

  const allExpanded =
    expandableKeys.size > 0 && [...expandableKeys].every((key) => expandedEras.has(key))

  function toggleEra(key: string) {
    setExpandedEras((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllEras() {
    setExpandedEras(allExpanded ? new Set() : new Set(expandableKeys))
  }

  function openFromRow(e: MouseEvent | KeyboardEvent, voucherId: number, entryId: number) {
    if ((e.target as HTMLElement).closest('.item-toggle')) return
    onOpenVoucher(voucherId, entryId)
  }

  return (
    <section className="report balance-sheet-items">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.reports')}
      </button>
      <h2 className="ledger-page-title">{t('balanceSheetItems.title')}</h2>

      <PeriodNav
        radioName="balance-sheet-items-nav-mode"
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

      {expandableKeys.size > 0 ? (
        <div className="balance-sheet-items-toggles" role="group" aria-label={t('table.display')}>
          <button type="button" className="allocation-toggle-btn" onClick={toggleAllEras}>
            {allExpanded ? t('balanceSheetItems.collapseAll') : t('balanceSheetItems.expandAll')}
          </button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingBalanceItems')}</p> : null}

      {!loading &&
      !error &&
      data &&
      sections.assets.length === 0 &&
      sections.liabilities.length === 0 ? (
        <p className="empty">{t('balanceSheetItems.empty')}</p>
      ) : null}

      {(['assets', 'liabilities'] as const).map((section) => {
        const title = section === 'assets' ? t('reports.assets') : t('reports.liabilities')
        const accounts = sections[section]
        if (accounts.length === 0) return null
        return (
          <section key={section} className="balance-sheet-items-section">
            <h3>{title}</h3>
            {accounts.map((acc) => (
              <article key={acc.number} className="balance-account">
                <header className="balance-account-head">
                  <h4>
                    <span className="ledger-num">{acc.number}</span> {acc.name}
                  </h4>
                  <p className="lede">
                    {t('balanceSheetItems.openingClosing', {
                      opening: formatCents(acc.opening_cents),
                      closing: formatCents(acc.closing_cents),
                    })}
                  </p>
                </header>

                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th className="item-col" aria-label={t('table.expand')} />
                      <th>{t('table.voucher')}</th>
                      <th>{t('table.date')}</th>
                      <th>{t('table.description')}</th>
                      <th className="amount">{t('table.openingShort')}</th>
                      <th className="amount">{t('table.change')}</th>
                      <th className="amount">{t('table.end')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acc.items.map((item) => {
                      const key = itemKey(acc.number, item.era.id)
                      const expanded = expandedEras.has(key)
                      const canExpand = item.movements.length > 0
                      return (
                        <Fragment key={key}>
                          <tr
                            className={`clickable item-row ${canExpand ? 'has-children' : ''} ${expanded ? 'is-expanded' : ''}`}
                            tabIndex={0}
                            onClick={(e) =>
                              openFromRow(e, item.era.voucher.id, item.era.id)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openFromRow(e, item.era.voucher.id, item.era.id)
                              }
                            }}
                          >
                            <td className="item-col">
                              {canExpand ? (
                                <button
                                  type="button"
                                  className="item-toggle"
                                  aria-expanded={expanded}
                                  aria-label={expanded ? t('balanceSheetItems.hideLines') : t('balanceSheetItems.showLines')}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleEra(key)
                                  }}
                                >
                                  {expanded ? '\u25BE' : '\u25B8'}
                                </button>
                              ) : null}
                            </td>
                            <td className="num">
                              {formatVoucherId(
                                item.era.voucher.series,
                                item.era.voucher.doc_number,
                                item.era.voucher.date || item.era.date,
                              )}
                            </td>
                            <td className="num">{item.era.entry_date}</td>
                            <td>{item.era.partner?.name || item.era.description || '-'}</td>
                            <td className={`amount ${item.before_cents < 0 ? 'neg' : ''}`}>
                              {formatCents(item.before_cents)}
                            </td>
                            <td className={`amount ${item.period_change_cents < 0 ? 'neg' : ''}`}>
                              {formatCents(item.period_change_cents)}
                            </td>
                            <td className={`amount ${item.closing_cents < 0 ? 'neg' : ''}`}>
                              {formatCents(item.closing_cents)}
                            </td>
                          </tr>
                          {expanded
                            ? item.movements.map((m) => {
                                const isBefore = m.kind === 'before'
                                const isOpening = m.kind === 'opening'
                                return (
                                <tr
                                  key={`mv-${m.id}-${m.kind ?? 'change'}`}
                                  className={`${isBefore ? 'item-movement-before' : 'clickable item-movement'} ${isOpening ? 'item-movement-opening' : ''}`}
                                  tabIndex={isBefore ? undefined : 0}
                                  onClick={
                                    isBefore ? undefined : () => onOpenVoucher(m.voucher.id, m.id)
                                  }
                                  onKeyDown={
                                    isBefore
                                      ? undefined
                                      : (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            onOpenVoucher(m.voucher.id, m.id)
                                          }
                                        }
                                  }
                                >
                                  <td className="item-col" />
                                  <td className="num">
                                    {formatVoucherId(
                                      m.voucher.series,
                                      m.voucher.doc_number,
                                      m.voucher.date || m.date,
                                    )}
                                  </td>
                                  <td className="num">{m.entry_date}</td>
                                  <td>
                                    {isBefore ? (
                                      <span className="muted">{t('balanceSheetItems.beforePeriod')}</span>
                                    ) : null}
                                    {isOpening ? (
                                      <span className="muted">{t('balanceSheetItems.openingPrefix')}</span>
                                    ) : null}
                                    {m.partner?.name || m.description || '-'}
                                  </td>
                                  <td className="amount" />
                                  <td className={`amount ${m.snt < 0 ? 'neg' : ''}`}>
                                    {formatCents(m.snt)}
                                  </td>
                                  <td className="amount" />
                                </tr>
                              )})
                            : null}
                        </Fragment>
                      )
                    })}
                    {acc.unassigned.before_cents !== 0 ||
                    acc.unassigned.period_change_cents !== 0 ||
                    acc.unassigned.closing_cents !== 0 ? (
                      (() => {
                        const key = unassignedKey(acc.number)
                        const expanded = expandedEras.has(key)
                        const canExpand = acc.unassigned.movements.length > 0
                        return (
                          <Fragment key={key}>
                            <tr
                              className={`item-row item-unassigned item-unassigned-first ${canExpand ? 'has-children' : ''} ${expanded ? 'is-expanded' : ''}`}
                            >
                              <td className="item-col">
                                {canExpand ? (
                                  <button
                                    type="button"
                                    className="item-toggle"
                                    aria-expanded={expanded}
                                    aria-label={expanded ? t('balanceSheetItems.hideLines') : t('balanceSheetItems.showLines')}
                                    onClick={() => toggleEra(key)}
                                  >
                                    {expanded ? '\u25BE' : '\u25B8'}
                                  </button>
                                ) : null}
                              </td>
                              <td colSpan={3}>{t('balanceSheetItems.unassigned')}</td>
                              <td className={`amount ${acc.unassigned.before_cents < 0 ? 'neg' : ''}`}>
                                {formatCents(acc.unassigned.before_cents)}
                              </td>
                              <td
                                className={`amount ${acc.unassigned.period_change_cents < 0 ? 'neg' : ''}`}
                              >
                                {formatCents(acc.unassigned.period_change_cents)}
                              </td>
                              <td className={`amount ${acc.unassigned.closing_cents < 0 ? 'neg' : ''}`}>
                                {formatCents(acc.unassigned.closing_cents)}
                              </td>
                            </tr>
                            {expanded
                              ? acc.unassigned.movements.map((m) => (
                                  <tr
                                    key={`un-${m.id}`}
                                    className="clickable item-movement item-unassigned"
                                    tabIndex={0}
                                    onClick={() => onOpenVoucher(m.voucher.id, m.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        onOpenVoucher(m.voucher.id, m.id)
                                      }
                                    }}
                                  >
                                    <td className="item-col" />
                                    <td className="num">
                                      {formatVoucherId(
                                        m.voucher.series,
                                        m.voucher.doc_number,
                                        m.voucher.date || m.date,
                                      )}
                                    </td>
                                    <td className="num">{m.entry_date}</td>
                                    <td>{m.partner?.name || m.description || '-'}</td>
                                    <td className="amount" />
                                    <td className={`amount ${m.snt < 0 ? 'neg' : ''}`}>
                                      {formatCents(m.snt)}
                                    </td>
                                    <td className="amount" />
                                  </tr>
                                ))
                              : null}
                          </Fragment>
                        )
                      })()
                    ) : null}
                  </tbody>
                </table>
              </article>
            ))}
          </section>
        )
      })}
    </section>
  )
}
