import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n'
import { Pill } from '../../../shared/Pill'
import { downloadFile } from '../../../shared/downloadFile'
import { omaVeroText, typedAmount, type DebtTerm, type GroupView, type RowView, type Target, type TaxReturnInputs, type TaxReturnView } from '../api'
import { AccountRows, ConfirmField, ManualFigure, PlaceSelect } from './AccountPlacement'
import { formatFigure } from './format'
import { anchorId, type Jump } from './jump'
import { calculationFileName, calculationPdf, calculationTitle } from './calculationPdf'
import type { CalculationStore, PeriodDocuments } from './TaxReturnDialog'

/** The rows a check pointed at; `n` tells one jump from the next. */
type Opened = { codes?: number[]; n: number } | null

type Actions = {
  onSaveInputs: (inputs: TaxReturnInputs) => Promise<void>
  onPlaceAccount: (account: number, target: Target | null) => Promise<void>
  onTerm: (account: number, term: DebtTerm) => Promise<void>
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** An amount that copies itself in the form a field takes, without thousands separators. */
export function CopyFigure({ cents, label }: { cents: number; label: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="tax-return-figure"
      title={done ? t('taxReturn.copied') : t('taxReturn.copyFigure')}
      aria-label={`${label}: ${formatFigure(cents)}. ${t('taxReturn.copyFigure')}`}
      onClick={() => {
        void copyText(typedAmount(cents)).then((ok) => {
          setDone(ok)
          if (ok) setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? t('taxReturn.copied') : formatFigure(cents)}
    </button>
  )
}

function Row({ row, view, actions, opened }: { row: RowView; view: TaxReturnView; actions: Actions; opened: Opened }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(() => Boolean(opened?.codes?.includes(row.code)))
  useEffect(() => {
    if (opened?.codes?.includes(row.code)) setOpen(true)
  }, [opened, row.code])
  return (
    <>
      <tr id={anchorId(`row-${row.code}`)} tabIndex={-1} className={row.state === 'zero' ? 'tax-return-zero' : undefined}>
        <td>
          <button type="button" className="btn-link tax-return-row-name" aria-expanded={open} onClick={() => setOpen(!open)}>
            <svg className="tax-return-chevron" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {row.label}
          </button>
          {row.state === 'manual' ? <Pill tone="accent">{t('taxReturn.manualTag')}</Pill> : null}
          {row.check ? <Pill tone="warn">{t('taxReturn.checkTag')}</Pill> : null}
        </td>
        <td className="amount">{row.tax_code != null ? <CopyFigure cents={row.book_cents} label={`${row.label}, ${t('taxReturn.bookColumn')}`} /> : null}</td>
        <td className="amount"><CopyFigure cents={row.tax_cents} label={row.tax_code != null ? `${row.label}, ${t('taxReturn.taxColumn')}` : row.label} /></td>
      </tr>
      {open ? (
        <tr className="tax-return-detail">
          <td colSpan={3}>
            <AccountRows row={row} overrides={view.overrides} onPlace={actions.onPlaceAccount} onTerm={actions.onTerm} />
            <ManualFigure row={row} inputs={view.inputs} onSave={actions.onSaveInputs} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function Group({ group, view, showZero, actions, opened }: { group: GroupView; view: TaxReturnView; showZero: boolean; actions: Actions; opened: Opened }) {
  const { t } = useI18n()
  const rows = showZero ? group.rows : group.rows.filter((row) => row.state !== 'zero')
  const totals = showZero ? group.totals : group.totals.filter((total) => total.cents)
  if (!rows.length && !totals.length) return null
  return (
    <table className="tax-return-table">
      <caption>{group.title}</caption>
      <thead>
        <tr>
          <th scope="col" aria-label={t('taxReturn.fieldColumn')} />
          <th scope="col" className="amount">{t('taxReturn.bookColumn')}</th>
          <th scope="col" className="amount">{t('taxReturn.taxColumn')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.code} row={row} view={view} actions={actions} opened={opened} />
        ))}
        {totals.map((total) => (
          <tr key={total.code} className="tax-return-total">
            <td>{total.label}</td>
            <td />
            <td className="amount"><CopyFigure cents={total.cents} label={total.label} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Writes the calculation as a PDF and keeps it with the period's tax return documents. */
function StoreCalculation({ view, calculation }: { view: TaxReturnView; calculation: CalculationStore }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        disabled={state === 'busy'}
        onClick={() => {
          const { today } = calculation
          const pdf = calculationPdf(t, view, today)
          const file = new File([pdf as BlobPart], calculationFileName(view, today), { type: 'application/pdf' })
          setState('busy')
          setError(null)
          calculation
            .store(file, calculationTitle(t, view, today))
            .then(() => setState('done'))
            .catch((err: unknown) => {
              setState('idle')
              setError(err instanceof Error ? err.message : String(err))
            })
        }}
      >
        {t('taxReturn.calc.store')}
      </button>
      {state === 'done' ? (
        <span className="muted tax-return-actions-note" role="status">
          {t('taxReturn.calc.stored')}
        </span>
      ) : null}
      {error ? <span className="error tax-return-actions-note">{error}</span> : null}
    </>
  )
}

/** Forms filled in on the Liitelomakkeet tab. */
const FORMS_TAB = ['62', '73', '8A', '71B']

/** The numbers to type into OmaVero, in its order and wording, each traced to its accounts. */
export function FiguresTab({
  view,
  documents,
  calculation,
  opened,
  onJump,
  onSaveInputs,
  onPlaceAccount,
  onTerm,
}: { view: TaxReturnView; documents: PeriodDocuments; calculation?: CalculationStore; opened: Opened; onJump: (jump: Jump) => void } & Actions) {
  const { t } = useI18n()
  const [showZero, setShowZero] = useState(false)
  const [copied, setCopied] = useState(false)
  const actions: Actions = { onSaveInputs, onPlaceAccount, onTerm }
  const text = () => omaVeroText(view)
  const guessed = view.groups
    .flatMap((group) => group.rows)
    .flatMap((row) => row.accounts.filter((line) => line.custom).map((line) => ({ line, code: row.code })))
  const attachments: [string, boolean][] = [
    ['statements', documents.statements],
    ['audit_report', documents.audit_report],
    ['minutes', documents.minutes],
  ]
  return (
    <>
      <p className="tax-return-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            void copyText(text()).then(setCopied)
          }}
        >
          {copied ? t('taxReturn.copied') : t('taxReturn.copyAll')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadFile(new TextEncoder().encode(text()), `6B_${view.ends.slice(0, 4)}_OmaVero.txt`, 'text/plain;charset=utf-8')}
        >
          {t('taxReturn.downloadText')}
        </button>
        {calculation ? <StoreCalculation view={view} calculation={calculation} /> : null}
        <label className="tax-return-toggle">
          <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} /> {t('taxReturn.showZero')}
        </label>
      </p>

      {view.unplaced.length ? (
        <section id={anchorId('unplaced')} tabIndex={-1} className="tax-return-unplaced">
          <h3 className="section-label">{t('taxReturn.unplaced')}</h3>
          <ul>
            {view.unplaced.map((line) => (
              <li key={line.account}>
                <span>{line.account} {line.name}</span>
                <span className="amount">{formatFigure(line.cents)}</span>
                <PlaceSelect account={line.account} current={null} onPlace={onPlaceAccount} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {guessed.length ? (
        <section id={anchorId('confirm')} tabIndex={-1} className="tax-return-unplaced">
          <h3 className="section-label">{t('taxReturn.toConfirm')}</h3>
          <ul>
            {guessed.map(({ line, code }) => (
              <li key={line.account}>
                <span>{line.account} {line.name}</span>
                <span className="amount">{formatFigure(line.cents)}</span>
                <PlaceSelect account={line.account} current={code} onPlace={onPlaceAccount} />
                <ConfirmField account={line.account} code={code} onPlace={onPlaceAccount} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="muted">{t('taxReturn.rowHint')}</p>
      {view.groups.map((group) => (
        <Group key={group.key} group={group} view={view} showZero={showZero} actions={actions} opened={opened} />
      ))}

      <section>
        <h3 className="section-label">{t('taxReturn.forms')}</h3>
        {view.forms.length ? (
          <ul className="tax-return-check-list">
            {view.forms.map((form) => (
              <li key={form.form}>
                <Pill tone={form.built ? 'ok' : 'warn'}>{t(form.built ? 'taxReturn.formBuilt' : 'taxReturn.formOpen')}</Pill>
                {FORMS_TAB.includes(form.form) ? (
                  <button type="button" className="btn-link tax-return-jump" onClick={() => onJump({ tab: 'forms', to: `form-${form.form}` })}>
                    {t(`taxReturn.form.${form.form}`, { form: form.form })}
                  </button>
                ) : (
                  <span>{t(`taxReturn.form.${form.form}`, { form: form.form })}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('taxReturn.noForms')}</p>
        )}
        <h3 className="section-label">{t('taxReturn.attachments')}</h3>
        <ul className="tax-return-check-list">
          {attachments.map(([key, present]) => (
            <li key={key}>
              <Pill tone={present ? 'ok' : 'warn'}>{t(present ? 'taxReturn.docPresent' : 'taxReturn.docMissing')}</Pill>
              <span>{t(`taxReturn.attachment.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
