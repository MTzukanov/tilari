import { useEffect, useState } from 'react'
import { fetchAccounts, saveVoucher, uploadAttachment } from '../../../api'
import type { Account, SaveVoucherInput } from '../../../book/types'
import { TYPE_ATTACHMENT_NOTE } from '../../../book/vouchers'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { formatCents, parseEurInput } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import { FilePill, Pill, type PillTone } from '../../../shared/Pill'
import { StepRail, type StepTone } from '../../../shared/StepRail'
import {
  decisionDraft,
  DISTRIBUTION_ACCOUNT,
  lastEndedBefore,
  PAYABLE_ACCOUNT,
  paymentDraft,
  RETAINED_ACCOUNT,
  voucherDateFor,
  WITHHOLDING_ACCOUNT,
  type CompanyOverview,
  type DividendMeeting,
  type DividendStepState,
  type DividendView,
  type DocumentView,
  type PeriodView,
  type RecipientView,
  type VoucherRef,
} from '../api'
import { errorText, periodShort } from './format'
import { OpenVoucher, type SlotActions } from './Slot'

const STEP_TONE: Record<DividendStepState, StepTone> = {
  done: 'ok',
  not_applicable: 'ok',
  waiting: 'warn',
  overdue: 'crit',
  missing: 'crit',
  no_minutes: 'crit',
  difference: 'crit',
  no_contract: 'crit',
}

/** The period's row that holds a meeting's minutes. */
const MINUTES_KIND: Record<DividendMeeting, string> = { agm: 'agm_minutes', extra: 'extra_agm_minutes' }

type FormProps = { overview: CompanyOverview; today: string; actions: SlotActions; onClose: () => void }

/** A day a voucher can carry: inside a fiscal year and after the lock date. */
function openDay(date: string, overview: CompanyOverview): boolean {
  const when = voucherDateFor(date, date, overview.lock_date, overview.periods)
  return when.ok && !when.doc_date
}

/** The chart, for account names and bank accounts; empty until it loads. */
function useAccounts(): Account[] {
  const [accounts, setAccounts] = useState<Account[]>([])
  useEffect(() => {
    let live = true
    fetchAccounts()
      .then((r) => {
        if (live) setAccounts(r.accounts)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return accounts
}

/** Saves a draft and its file, then shows the page again. A draft that saved stays even if the file fails. */
async function saveDraft(draft: SaveVoucherInput, file: File | null, actions: SlotActions): Promise<number> {
  const saved = await saveVoucher(draft)
  try {
    if (file) await uploadAttachment(saved.id, file)
  } finally {
    await actions.refresh()
  }
  return saved.id
}

/**
 * Minutes stored on a voucher of their own (type 800) that nothing else links: the decision can be booked on
 * that voucher, so the file stays in the book once. The newest, as a later meeting is the one being booked.
 */
function storedMinutes(period: PeriodView, overview: CompanyOverview, meeting: DividendMeeting): DocumentView | null {
  const docs = period.slots.find((s) => s.kind === MINUTES_KIND[meeting])?.documents ?? []
  const own = docs.filter(
    (v) =>
      v.state === 'ok' &&
      v.type === TYPE_ATTACHMENT_NOTE &&
      v.voucher_date != null &&
      openDay(v.voucher_date, overview) &&
      overview.documents.filter((d) => d.voucher_id === v.voucher_id).length === 1,
  )
  return own.at(-1) ?? null
}

/** A draft's lines, as the voucher will show them. */
function LinePreview({ lines, names, accounts }: { lines: SaveVoucherInput['entries']; names: Map<number, string>; accounts: Account[] }) {
  const { t } = useI18n()
  const accountName = (n: number) => accounts.find((a) => a.number === n)?.name ?? ''
  return (
    <div className="dividend-scroll">
      <table className="ledger-table dense">
        <thead>
          <tr>
            <th>{t('company.dividend.form.account')}</th>
            <th>{t('company.dividend.form.partner')}</th>
            <th className="num">{t('company.dividend.form.debit')}</th>
            <th className="num">{t('company.dividend.form.credit')}</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((line, i) => (
            <tr key={i}>
              <td>
                {line.account} {accountName(Number(line.account))}
              </td>
              <td>{typeof line.partner === 'object' && line.partner?.id ? (names.get(line.partner.id) ?? '') : ''}</td>
              <td className="num">{formatCents(line.debit_cents ?? 0, { emptyZero: true })}</td>
              <td className="num">{formatCents(line.credit_cents ?? 0, { emptyZero: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The decision as a draft, with the meeting's minutes on it: the same file then fills the meeting's row in the
 * period's documents, so it is stored once. Minutes already stored on their own voucher become the decision's.
 */
function DecisionForm({ period, overview, today, actions, onClose }: FormProps & { period: PeriodView }) {
  const { t } = useI18n()
  const accounts = useAccounts()
  const decided = period.dividends.length > 0 || period.dividend_drafts.length > 0
  const titleFor = (m: DividendMeeting) => t(`company.dividend.decision.defaultTitle.${m}`, { period: periodShort(period) })
  const [meeting, setMeeting] = useState<DividendMeeting>(decided ? 'extra' : 'agm')
  const minutes = storedMinutes(period, overview, meeting)
  const [date, setDate] = useState(minutes?.date ?? today)
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState(titleFor(meeting))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cents = parseEurInput(amount)
  const dayOpen = Boolean(date) && openDay(date, overview)
  const distributes = date ? lastEndedBefore(overview.periods, date) : null
  const draft = decisionDraft({ date, amount_snt: cents, title: title.trim() })
  const ready = dayOpen && cents > 0 && title.trim() !== ''
  const rowName = t(`company.kind.${MINUTES_KIND[meeting]}`)

  function pickMeeting(next: DividendMeeting) {
    setMeeting(next)
    setDate(storedMinutes(period, overview, next)?.date ?? today)
    setTitle(titleFor(next))
  }

  async function create() {
    if (minutes) {
      // The voucher keeps its file and its link, and gains the decision's lines.
      await saveVoucher(draft, minutes.voucher_id)
      await actions.refresh()
      return
    }
    const saved = await saveVoucher(draft)
    try {
      if (file) {
        const attached = await uploadAttachment(saved.id, file)
        await actions.apply({ add: [{ kind: MINUTES_KIND[meeting], period_ends: period.ends, voucher_id: saved.id, attachment_id: attached.id }] })
      }
    } finally {
      await actions.refresh()
    }
  }

  return (
    <div className="company-panel">
      <div className="property-form-grid">
        <label>
          {t('company.dividend.decision.meeting')}
          <select value={meeting} onChange={(e) => pickMeeting(e.target.value as DividendMeeting)}>
            <option value="agm">{t('company.dividend.meeting.agm')}</option>
            <option value="extra">{t('company.dividend.meeting.extra')}</option>
          </select>
        </label>
        <label>
          {t('company.dividend.decision.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('company.dividend.decision.amount')}
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {t('company.upload.titleField')}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {minutes ? null : (
          <label>
            {t('company.dividend.decision.minutes')}
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
      {minutes ? (
        <p className="muted">
          {t('company.dividend.decision.minutesStored', { row: rowName })}{' '}
          {minutes.files.map((f) => (
            <FilePill key={f.id} id={f.id} name={f.name} />
          ))}
        </p>
      ) : (
        <p className="muted">{t('company.dividend.decision.minutesNote', { row: rowName })}</p>
      )}
      {date && !dayOpen ? <p className="error">{t('company.dividend.form.dayClosed')}</p> : null}
      {dayOpen && distributes !== period.ends ? <p className="company-note">{t('company.dividend.decision.otherPeriod')}</p> : null}
      {decided && meeting === 'agm' ? <p className="company-note">{t('company.dividend.decision.another')}</p> : null}
      {cents > 0 ? <LinePreview lines={draft.entries} names={new Map()} accounts={accounts} /> : null}
      <p className="muted">
        {t('company.dividend.decision.accounts', { retained: RETAINED_ACCOUNT, distribution: DISTRIBUTION_ACCOUNT })} {t('company.dividend.form.draftNote')}
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="company-panel-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !ready}
          onClick={() => {
            setBusy(true)
            setError(null)
            create()
              .then(onClose)
              .catch((err) => setError(errorText(t, err)))
              .finally(() => setBusy(false))
          }}
        >
          {t('company.dividend.form.create')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
          {t('company.upload.cancel')}
        </button>
      </div>
    </div>
  )
}

function PaymentForm({ dividend, overview, today, actions, onClose }: FormProps & { dividend: DividendView }) {
  const { t } = useI18n()
  const accounts = useAccounts()
  const [date, setDate] = useState(today)
  const [title, setTitle] = useState(t('company.dividend.payment.defaultTitle'))
  const [account, setAccount] = useState(PAYABLE_ACCOUNT)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const banks = accounts.filter((a) => a.type === 'ARP')
  const payable = accounts.find((a) => a.number === PAYABLE_ACCOUNT)?.name ?? t('company.dividend.payment.payableName')
  const dayOpen = Boolean(date) && openDay(date, overview)
  const draft = paymentDraft({ date, title: title.trim(), withholding: t('company.dividend.payment.withholdingLine'), recipients: dividend.open_recipients, account })
  const names = new Map(dividend.open_recipients.map((r) => [r.partner_id, r.name]))
  const debt = account === PAYABLE_ACCOUNT
  const ready = dayOpen && title.trim() !== '' && dividend.open_recipients.length > 0 && !dividend.split_problem

  return (
    <div className="company-panel">
      <div className="property-form-grid">
        <label>
          {t('company.dividend.payment.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('company.dividend.payment.paidAs')}
          <select value={account} onChange={(e) => setAccount(Number(e.target.value))}>
            <option value={PAYABLE_ACCOUNT}>{t('company.dividend.payment.asDebt', { account: PAYABLE_ACCOUNT, name: payable })}</option>
            {banks.map((b) => (
              <option key={b.number} value={b.number}>
                {t('company.dividend.payment.fromBank', { account: b.number, name: b.name })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('company.upload.titleField')}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {debt ? (
          <label>
            {t('company.dividend.payment.contract')}
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : null}
      </div>
      {date && !dayOpen ? <p className="error">{t('company.dividend.form.dayClosed')}</p> : null}
      {dividend.payment_drafts.length ? <p className="company-note">{t('company.dividend.payment.draftExists')}</p> : null}
      <LinePreview lines={draft.entries} names={names} accounts={accounts} />
      <p className="muted">
        {t('company.dividend.payment.accounts', { distribution: DISTRIBUTION_ACCOUNT, withholding: WITHHOLDING_ACCOUNT })} {t('company.dividend.form.draftNote')}
      </p>
      {debt && !file ? <p className="muted">{t('company.dividend.payment.contractNote')}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="company-panel-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !ready}
          onClick={() => {
            setBusy(true)
            setError(null)
            saveDraft(draft, debt ? file : null, actions)
              .then(onClose)
              .catch((err) => setError(errorText(t, err)))
              .finally(() => setBusy(false))
          }}
        >
          {t('company.dividend.form.create')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
          {t('company.upload.cancel')}
        </button>
      </div>
    </div>
  )
}

/** Opens the shareholders on the company's own card, where a split problem is put right. */
function ToShareholders({ text, actions }: { text: string; actions: SlotActions }) {
  if (!actions.onOpenShareholders) return <span className="muted">{text}</span>
  return (
    <button type="button" className="btn-link" onClick={actions.onOpenShareholders}>
      {text}
    </button>
  )
}

/** Who gets what, from the shareholders kept on the company's own card. */
function Recipients({ dividend: d, actions }: { dividend: DividendView; actions: SlotActions }) {
  const { t } = useI18n()
  const rate = (r: RecipientView) =>
    r.rate_bp == null ? t('company.shareholders.rateMissing') : r.over_limit_snt ? t('company.dividend.recipients.overLimit', { rate: formatBp(r.rate_bp) }) : formatBp(r.rate_bp)
  const sum = (pick: (r: RecipientView) => number) => d.recipients.reduce((s, r) => s + pick(r), 0)
  return (
    <details className="dividend-recipients">
      <summary>{t('company.dividend.recipients.title', { n: d.recipients.length })}</summary>
      {d.split_problem && d.split_problem !== 'rate_missing' ? (
        <p className="muted">
          {t(`company.dividend.recipients.problem.${d.split_problem}`)} <ToShareholders text={t('company.dividend.recipients.toShareholders')} actions={actions} />
        </p>
      ) : (
        <div className="dividend-scroll">
          <table className="ledger-table zebra dense">
            <thead>
              <tr>
                <th>{t('company.shareholders.name')}</th>
                <th className="num">{t('company.shareholders.shares')}</th>
                <th className="num">{t('company.dividend.recipients.gross')}</th>
                <th className="num">{t('company.dividend.recipients.rate')}</th>
                <th className="num">{t('company.dividend.recipients.withholding')}</th>
                <th className="num">{t('company.dividend.recipients.net')}</th>
              </tr>
            </thead>
            <tbody>
              {d.recipients.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td className="num">{r.shares}</td>
                  <td className="num">{formatCents(r.gross_snt)}</td>
                  <td className="num">{rate(r)}</td>
                  <td className="num">{formatCents(r.withholding_snt)}</td>
                  <td className="num">{formatCents(r.net_snt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t('company.dividend.recipients.total')}</td>
                <td className="num">{formatCents(sum((r) => r.gross_snt))}</td>
                <td />
                <td className="num">{formatCents(sum((r) => r.withholding_snt))}</td>
                <td className="num">{formatCents(sum((r) => r.net_snt))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {d.split_problem === 'rate_missing' ? (
        <p className="error">
          {t('company.dividend.recipients.problem.rate_missing')} <ToShareholders text={t('company.dividend.recipients.toShareholders')} actions={actions} />
        </p>
      ) : null}
    </details>
  )
}

/** Drafts on Osingonjako, each to open and post in the voucher editor. */
function DraftLines({ drafts, label, actions }: { drafts: VoucherRef[]; label: string; actions: SlotActions }) {
  const { t } = useI18n()
  if (!drafts.length) return null
  return (
    <DocLines>
      {drafts.map((v) => (
        <DocLine key={v.voucher_id} voucher={<OpenVoucher voucher={v} actions={actions} />} title={v.title || label} mark={<Pill tone="warn">{t('company.dividend.draft')}</Pill>}>
          {v.files.map((f) => (
            <FilePill key={f.id} id={f.id} name={f.name} />
          ))}
        </DocLine>
      ))}
    </DocLines>
  )
}

/** The order a dividend goes in, step by step, and where each one is done. */
function HowItGoes() {
  const { t } = useI18n()
  const steps = ['meeting', 'decision', 'post', 'pay', 'withhold', 'report'] as const
  return (
    <details className="dividend-howto">
      <summary>{t('company.dividend.howto.title')}</summary>
      <ol>
        {steps.map((s) => (
          <li key={s}>{t(`company.dividend.howto.${s}`)}</li>
        ))}
      </ol>
      <p className="muted">{t('company.dividend.howto.extra')}</p>
    </details>
  )
}

/** Dividends from the period's profit: one card each, read from the ledger, and drafts for the next step. */
export function DividendSection({ period, overview, today, actions }: { period: PeriodView; overview: CompanyOverview; today: string; actions: SlotActions }) {
  const { t } = useI18n()
  const [deciding, setDeciding] = useState(false)
  const canDecide = period.decide_here && !overview.read_only
  if (!period.dividends.length && !period.dividend_drafts.length && !canDecide) return null
  return (
    <>
      <h3 className="section-label">{t('company.dividend.title')}</h3>
      <HowItGoes />
      {period.dividends.map((d) => (
        <DividendCard key={`${d.decided_on}-${d.vouchers[0]?.voucher_id ?? ''}`} dividend={d} overview={overview} today={today} actions={actions} />
      ))}
      <DraftLines drafts={period.dividend_drafts} label={t('company.dividend.voucher.decision')} actions={actions} />
      {period.dividend_drafts.length ? <p className="muted dividend-draft-note">{t('company.dividend.draftNote')}</p> : null}
      {canDecide && !deciding ? (
        <p>
          <button type="button" className="btn-secondary" onClick={() => setDeciding(true)}>
            {t('company.dividend.decision.open')}
          </button>
        </p>
      ) : null}
      {deciding ? <DecisionForm period={period} overview={overview} today={today} actions={actions} onClose={() => setDeciding(false)} /> : null}
    </>
  )
}

function DividendCard({ dividend: d, overview, today, actions }: { dividend: DividendView; overview: CompanyOverview; today: string; actions: SlotActions }) {
  const { t } = useI18n()
  const [paying, setPaying] = useState(false)
  const tones = d.steps.map((s) => STEP_TONE[s.state])
  // The card's state is the last step reached in order, red when any step has a problem.
  const reached = d.steps.findIndex((s) => STEP_TONE[s.state] !== 'ok')
  const status = reached < 0 ? t('company.dividend.state.done') : t(`company.dividend.step.${d.steps[Math.max(reached - 1, 0)].key}`)
  const statusTone: PillTone = tones.includes('crit') ? 'crit' : reached < 0 ? 'ok' : 'neutral'
  const unpaid = d.amount_snt - d.paid_snt
  const unremitted = d.withheld_snt - d.remitted_snt
  const withholdingLate = d.steps.some((s) => s.key === 'withheld' && s.state === 'overdue')

  return (
    <section className="dividend-card">
      <div className="dividend-head">
        <div>
          <strong className="dividend-name">{t(`company.dividend.name.${d.meeting}`)}</strong> <Pill tone={statusTone}>{status}</Pill>
          <div className="muted">{t(`company.dividend.decided.${d.meeting}`, { date: formatDate(d.decided_on) })}</div>
        </div>
        <span className="dividend-amount num-text">{formatCents(d.amount_snt)}</span>
      </div>

      <StepRail
        steps={d.steps.map((s) => ({
          label: t(`company.dividend.step.${s.key}`),
          state: t(`company.dividend.state.${s.state}`),
          tone: STEP_TONE[s.state],
          date: s.date ? formatDate(s.date) : undefined,
        }))}
      />

      <ul className="dividend-alerts">
        {d.paid_snt > d.amount_snt ? (
          <li className="dividend-alert dividend-alert-crit">{t('company.dividend.alert.difference', { paid: formatCents(d.paid_snt), decided: formatCents(d.amount_snt) })}</li>
        ) : null}
        {d.no_contract.length ? <li className="dividend-alert dividend-alert-crit">{t('company.dividend.alert.noContract')}</li> : null}
        {d.steps[0].state === 'no_minutes' ? (
          <li className="dividend-alert dividend-alert-crit">{t('company.dividend.alert.noMinutes', { row: t(`company.kind.${MINUTES_KIND[d.meeting]}`) })}</li>
        ) : null}
        {unpaid > 0 ? <li className="dividend-alert dividend-alert-warn">{t('company.dividend.alert.unpaid', { amount: formatCents(unpaid) })}</li> : null}
        {d.withheld_snt > 0 && unremitted > 0 ? (
          <li className={`dividend-alert dividend-alert-${withholdingLate ? 'crit' : 'warn'}`}>
            {t('company.dividend.alert.withholdingOpen', { amount: formatCents(unremitted), date: formatDate(d.withholding_due) })}
          </li>
        ) : null}
      </ul>

      <DocLines>
        {d.vouchers.map((v) => (
          <DocLine
            key={`${v.role}-${v.voucher_id}`}
            voucher={<OpenVoucher voucher={v} actions={actions} />}
            title={`${t(`company.dividend.voucher.${v.role}`)} · ${formatCents(v.amount_snt)}`}
            mark={v.role === 'payment' && d.no_contract.includes(v.voucher_id) ? <Pill tone="crit">{t('company.dividend.state.no_contract')}</Pill> : null}
          >
            {v.files.map((f) => (
              <FilePill key={f.id} id={f.id} name={f.name} />
            ))}
          </DocLine>
        ))}
      </DocLines>
      <DraftLines drafts={d.payment_drafts} label={t('company.dividend.voucher.payment')} actions={actions} />

      <Recipients dividend={d} actions={actions} />

      {unpaid > 0 && !overview.read_only && !paying ? (
        <p className="dividend-actions">
          <button type="button" className="btn-secondary" onClick={() => setPaying(true)} disabled={Boolean(d.split_problem)}>
            {t('company.dividend.payment.open')}
          </button>
          {d.split_problem ? (
            <>
              {' '}
              <ToShareholders text={t(`company.dividend.payment.needs.${d.split_problem}`)} actions={actions} />
            </>
          ) : null}
        </p>
      ) : null}
      {paying ? <PaymentForm dividend={d} overview={overview} today={today} actions={actions} onClose={() => setPaying(false)} /> : null}
    </section>
  )
}
