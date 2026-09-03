import { EuroInput } from '../../../shared/EuroInput'
import { SearchSelect, type SearchItem } from '../../../shared/SearchSelect'
import { useI18n } from '../../../i18n'

export function TransferForm({
  fromAccount,
  toAccount,
  amount,
  description,
  accountItems,
  onFromAccount,
  onToAccount,
  onAmount,
  onDescription,
}: {
  fromAccount: string
  toAccount: string
  amount: string
  description: string
  accountItems: SearchItem[]
  onFromAccount: (value: string) => void
  onToAccount: (value: string) => void
  onAmount: (value: string) => void
  onDescription: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <section className="assistant assistant-split">
      <div className="assistant-col">
        <label>
          {t('editor.fromAccount')}
          <SearchSelect
            items={accountItems}
            value={fromAccount}
            onChange={onFromAccount}
            placeholder={t('editor.searchAccount')}
          />
        </label>
      </div>
      <div className="assistant-col">
        <label>
          {t('editor.toAccount')}
          <SearchSelect
            items={accountItems}
            value={toAccount}
            onChange={onToAccount}
            placeholder={t('editor.searchAccount')}
          />
        </label>
        <label>
          {t('editor.amount')}
          <EuroInput value={amount} onChange={onAmount} />
        </label>
        <label>
          {t('editor.rowDescription')}
          <textarea rows={3} value={description} onChange={(e) => onDescription(e.target.value)} />
        </label>
      </div>
    </section>
  )
}
