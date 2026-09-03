import { useState } from 'react'
import type { PaymentMethod } from '../../../book/paymentMethods'
import { ALL_COUNTER_ACCOUNTS } from '../../../book/paymentMethods'
import { vatFromKey, vatPercentLabel } from '../../vat/ui/vatCodes'
import { VatIcon } from '../../vat/ui/VatIcon'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import { SearchSelect, type SearchItem } from '../../../shared/SearchSelect'
import { useI18n } from '../../../i18n'
import { PaymentSelect } from './PaymentSelect'
import { VatSelect } from './VatSelect'
import { EMPTY_ASSISTANT_ROW, type AssistantRow } from './assistantRow'

function VatNetInput({
  netCents,
  onNetCents,
}: {
  netCents: number
  onNetCents: (cents: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = formatEurInput(netCents, { emptyZero: true })
  return (
    <EuroInput
      value={draft ?? display}
      onChange={(next) => {
        setDraft(next)
        onNetCents(parseEurInput(next))
      }}
      onFocus={() => setDraft((prev) => prev ?? display)}
      onBlur={() => setDraft(null)}
    />
  )
}

function accountLabel(items: SearchItem[], account: string): string {
  const found = items.find((i) => i.value === account)
  if (!found) return account
  const name = found.label.replace(new RegExp(`^${account}\\s+`), '')
  return name || found.label
}

export function ExpenseIncomeForm({
  type,
  methods,
  methodId,
  onMethod,
  paymentAccount,
  onPaymentAccount,
  partner,
  onPartner,
  partnerItems,
  accountItems,
  allocationItems,
  rows,
  selected,
  onSelect,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  type: number
  methods: PaymentMethod[]
  methodId: string
  onMethod: (id: string, account: string) => void
  paymentAccount: string
  onPaymentAccount: (value: string) => void
  partner: string
  onPartner: (value: string) => void
  partnerItems: SearchItem[]
  accountItems: SearchItem[]
  allocationItems: SearchItem[]
  rows: AssistantRow[]
  selected: number
  onSelect: (index: number) => void
  onUpdateRow: (index: number, patch: Partial<AssistantRow>) => void
  onAddRow: () => void
  onRemoveRow: () => void
}) {
  const { t } = useI18n()
  const row = rows[selected] ?? rows[0] ?? EMPTY_ASSISTANT_ROW
  const vat = vatFromKey(row.vatChoice)
  const grossCents = parseEurInput(row.amount)
  const vatCents =
    vat.code && vat.percent && grossCents
      ? Math.round((grossCents * vat.percent) / (100 + vat.percent))
      : 0
  const netCents = grossCents - vatCents
  const showNet = Boolean(vat.percent)

  return (
    <section
      className={`assistant assistant-tulomeno${rows.length > 1 ? ' has-row-table' : ''}`}
    >
      <div className="assistant-col">
        <label>
          {t('editor.payment')}
          <PaymentSelect
            methods={methods}
            value={methodId}
            allLabel={t('editor.allCounterAccounts')}
            onChange={onMethod}
          />
        </label>
        <label>
          {type === 200 ? t('editor.customer') : t('editor.supplier')}
          <SearchSelect
            items={partnerItems}
            value={partner}
            allowCustom
            placeholder={t('editor.partnerPlaceholder')}
            onChange={onPartner}
          />
        </label>
        <label>
          {t('editor.counterAccount')}
          <SearchSelect
            items={accountItems}
            value={paymentAccount}
            onChange={onPaymentAccount}
            disabled={methodId !== ALL_COUNTER_ACCOUNTS && Boolean(paymentAccount)}
            placeholder={t('editor.accountPlaceholder')}
          />
        </label>
      </div>
      <div className="assistant-col">
        <label>
          {type === 100 ? t('editor.expenseAccount') : t('editor.incomeAccount')}
          <SearchSelect
            items={accountItems}
            value={row.account}
            onChange={(v) => onUpdateRow(selected, { account: v })}
            placeholder={t('editor.accountPlaceholder')}
          />
        </label>
        <div className="assistant-money-row">
          <label>
            {t('editor.amount')}
            <EuroInput
              value={row.amount}
              onChange={(amount) => onUpdateRow(selected, { amount })}
            />
          </label>
          {showNet ? (
            <label className="assistant-net">
              {t('editor.net')}
              <VatNetInput
                key={selected}
                netCents={netCents}
                onNetCents={(net) => {
                  const gross = vat.percent ? Math.round((net * (100 + vat.percent)) / 100) : net
                  onUpdateRow(selected, { amount: formatEurInput(gross, { emptyZero: true }) })
                }}
              />
            </label>
          ) : null}
          {showNet ? (
            <label className="assistant-vat-amount">
              {t('editor.vat')}
              <input
                className="amount-input"
                readOnly
                tabIndex={-1}
                placeholder="0,00"
                value={formatEurInput(vatCents, { emptyZero: true })}
              />
            </label>
          ) : null}
        </div>
        <label className="assistant-vat">
          {t('editor.vat')}
          <VatSelect
            value={row.vatChoice}
            aria-label={t('editor.vat')}
            onChange={(vatChoice) => onUpdateRow(selected, { vatChoice })}
          />
        </label>
        <label>
          {t('editor.allocation')}
          <SearchSelect
            items={allocationItems}
            value={row.allocation}
            onChange={(v) => onUpdateRow(selected, { allocation: v })}
            placeholder={t('editor.allocationGeneral')}
          />
        </label>
        <label>
          {t('editor.accrual')}
          <span className="accrual-range">
            <input
              type="date"
              value={row.accrual_starts}
              onChange={(e) => onUpdateRow(selected, { accrual_starts: e.target.value })}
            />
            <span aria-hidden>–</span>
            <input
              type="date"
              value={row.accrual_ends}
              onChange={(e) => onUpdateRow(selected, { accrual_ends: e.target.value })}
            />
          </span>
        </label>
        <label>
          {t('editor.rowDescription')}
          <input
            value={row.description}
            onChange={(e) => onUpdateRow(selected, { description: e.target.value })}
          />
        </label>
        <div className="assistant-row-actions">
          <button type="button" className="btn-secondary" onClick={onAddRow}>
            {t('editor.addLine')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={rows.length < 2}
            onClick={onRemoveRow}
          >
            {t('editor.removeLine')}
          </button>
        </div>
      </div>
      {rows.length > 1 ? (
        <div className="assistant-rows-wrap">
          <table className="assistant-rows" data-testid="assistant-rows">
            <thead>
              <tr>
                <th>{t('table.account')}</th>
                <th>{t('table.vat')}</th>
                <th className="amount">€</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => {
                const vat = vatFromKey(item.vatChoice)
                return (
                  <tr
                    key={i}
                    className={i === selected ? 'is-selected' : ''}
                    tabIndex={0}
                    onClick={() => onSelect(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(i)
                      }
                    }}
                  >
                    <td>{accountLabel(accountItems, item.account) || '—'}</td>
                    <td>
                      <span className="vat-mark">
                        <VatIcon code={vat.code} />
                        {vatPercentLabel(vat.percent)}
                      </span>
                    </td>
                    <td className="amount">
                      {formatCents(parseEurInput(item.amount), { emptyZero: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
