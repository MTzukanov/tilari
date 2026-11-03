import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { Pill } from '../../../shared/Pill'
import { formatEurInput, parseEurInput, sanitizeEurInput } from '../../../shared/money'
import { BALANCE_GROUPS, PNL_GROUPS, SALE, type DebtTerm, type RowView, type Target, type TaxReturnInputs } from '../api'
import { formatFigure } from './format'

function isIncomeStatement(account: number): boolean {
  return String(account) >= '3'
}

/** Which field an account goes to. */
export function PlaceSelect({
  account,
  current,
  overridden,
  onPlace,
}: {
  account: number
  current: Target | null
  overridden?: boolean
  onPlace: (account: number, target: Target | null) => Promise<void>
}) {
  const { t } = useI18n()
  const income = isIncomeStatement(account)
  const groups = income ? PNL_GROUPS : BALANCE_GROUPS
  return (
    <select
      className="tax-return-place"
      aria-label={t('taxReturn.placeAccount', { account })}
      value={current == null ? '' : String(current)}
      onChange={(e) => {
        const value = e.target.value
        if (value === 'default') void onPlace(account, null)
        else if (value === SALE) void onPlace(account, SALE)
        else if (value) void onPlace(account, Number(value))
      }}
    >
      {current == null ? <option value="">{t('taxReturn.placeChoose')}</option> : null}
      {overridden ? <option value="default">{t('taxReturn.placeDefault')}</option> : null}
      {income ? <option value={SALE}>{t('taxReturn.placeSale')}</option> : null}
      {groups.map((group) => (
        <optgroup key={group.key} label={group.title}>
          {group.rows
            .filter((row) => !row.manualOnly)
            .map((row) => (
              <option key={row.code} value={row.code}>
                {row.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Keeps a guessed field. A select cannot do this: it does not fire for the value it already shows. */
export function ConfirmField({ account, code, onPlace }: { account: number; code: number; onPlace: (account: number, target: Target | null) => Promise<void> }) {
  const { t } = useI18n()
  return (
    <button type="button" className="btn-secondary tax-return-confirm" onClick={() => void onPlace(account, code)}>
      {t('taxReturn.confirmField')}
    </button>
  )
}

/** The accounts behind a figure, each of which can move to another field. */
export function AccountRows({
  row,
  overrides,
  onPlace,
  onTerm,
}: {
  row: RowView
  overrides: Record<string, Target>
  onPlace: (account: number, target: Target | null) => Promise<void>
  onTerm: (account: number, term: DebtTerm) => Promise<void>
}) {
  const { t } = useI18n()
  if (!row.accounts.length && row.prior_results_cents == null) {
    return row.state === 'zero' || row.state === 'manual' ? null : <p className="muted">{t('taxReturn.fromResult')}</p>
  }
  return (
    <ul className="tax-return-accounts">
      {row.accounts.map((line) => {
        const own = overrides[String(line.account)]
        return (
          <li key={line.account}>
            <span>{line.account} {line.name}</span>
            <span className="amount">{formatFigure(line.cents)}</span>
            {line.custom ? <ConfirmField account={line.account} code={row.code} onPlace={onPlace} /> : null}
            {line.source === 'moved' ? <Pill tone="neutral">{t('taxReturn.movedTag')}</Pill> : null}
            <PlaceSelect account={line.account} current={own ?? (line.source === 'moved' ? null : row.code)} overridden={own != null} onPlace={onPlace} />
            {line.term && line.source !== 'moved' ? (
              <select
                className="tax-return-place"
                aria-label={t('taxReturn.termAccount', { account: line.account })}
                value={line.term}
                onChange={(e) => void onTerm(line.account, e.target.value === 'long' ? 'long' : 'short')}
              >
                <option value="long">{t('taxReturn.termLong')}</option>
                <option value="short">{t('taxReturn.termShort')}</option>
              </select>
            ) : null}
          </li>
        )
      })}
      {row.prior_results_cents != null ? (
        <li>
          <span>{t('taxReturn.priorResults')}</span>
          <span className="amount">{formatFigure(row.prior_results_cents)}</span>
        </li>
      ) : null}
    </ul>
  )
}

function ManualInput({ label, code, inputs, onSave }: { label: string; code: number; inputs: TaxReturnInputs; onSave: (inputs: TaxReturnInputs) => Promise<void> }) {
  const { t } = useI18n()
  const stored = inputs.manual[code]
  const [draft, setDraft] = useState(stored != null ? formatEurInput(stored) : '')
  const save = () => {
    const manual = { ...inputs.manual }
    if (draft.trim()) manual[code] = parseEurInput(draft)
    else delete manual[code]
    void onSave({ ...inputs, manual })
  }
  return (
    <label className="tax-return-manual">
      {label}
      <input type="text" inputMode="decimal" value={draft} placeholder={t('taxReturn.manualEmpty')} onChange={(e) => setDraft(sanitizeEurInput(e.target.value))} />
      <button type="button" className="btn-secondary" onClick={save}>
        {t('common.save')}
      </button>
    </label>
  )
}

/** Where book and tax differ, or Vero wants a figure that is not in the income statement. */
export function ManualFigure({ row, inputs, onSave }: { row: RowView; inputs: TaxReturnInputs; onSave: (inputs: TaxReturnInputs) => Promise<void> }) {
  const { t } = useI18n()
  const code = row.tax_code ?? row.code
  return (
    <div className="tax-return-manuals">
      {row.tax_code != null ? <ManualInput label={t('taxReturn.manualBook')} code={row.code} inputs={inputs} onSave={onSave} /> : null}
      <ManualInput label={row.tax_code != null ? t('taxReturn.manualTax') : t('taxReturn.manualValue')} code={code} inputs={inputs} onSave={onSave} />
    </div>
  )
}
