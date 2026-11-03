import { useMemo, useState } from 'react'
import { useI18n } from '../../../i18n'
import { Pill } from '../../../shared/Pill'
import { downloadFile } from '../../../shared/downloadFile'
import { ANSWERS, fieldName, ilmoitinFile, type FileNotice, type FileProblem, type FileRemark, type TaxReturnView } from '../api'
import { IssueRow } from './Checks'
import { anchorId, problemJump, type Jump } from './jump'

function problemText(t: (key: string, params?: Record<string, string | number>) => string, problem: FileProblem): string {
  switch (problem.key) {
    case 'shareholder_id':
      return t('taxReturn.problem.shareholder_id', { name: problem.name })
    case 'negative':
    case 'text':
    case 'distribution':
      return t(`taxReturn.problem.${problem.key}`, { field: fieldName(problem.code) })
    case 'answer':
      return t('taxReturn.problem.answer', { answer: ANSWERS.find((a) => a.key === problem.answer)?.label ?? problem.answer })
    case 'unanswered':
      return t('taxReturn.problem.unanswered', { count: problem.count })
    case 'form62_negative':
    case 'holding_name':
    case 'holding_id':
    case 'holding_shares':
    case 'holding_unit':
    case 'holding_cost':
    case 'sale_fields':
    case 'sale_id':
    case 'sale_share':
    case 'form73_ownership':
      return t(`taxReturn.problem.${problem.key}`, { row: problem.row })
    default:
      return t(`taxReturn.problem.${problem.key}`)
  }
}

function noticeText(t: (key: string, params?: Record<string, string | number>) => string, notice: FileNotice): string {
  switch (notice.key) {
    case 'form':
      return t('taxReturn.notice.form', { form: notice.form })
    case 'spec_year':
      return t('taxReturn.notice.spec_year', { year: notice.year })
    default:
      return t('taxReturn.notice.checks')
  }
}

function remarkText(t: (key: string, params?: Record<string, string | number>) => string, remark: FileRemark): string {
  return t(`taxReturn.remark.${remark.key}`, { count: remark.count })
}

/** The Ilmoitin file. Built in this browser: the IDs typed here go only into the downloaded file. */
export function FileTab({ view, onJump }: { view: TaxReturnView; onJump: (jump: Jump) => void }) {
  const { t } = useI18n()
  const [ids, setIds] = useState<string[]>([])
  const file = useMemo(() => ilmoitinFile(view, { ids, now: new Date() }), [view, ids])
  const sendable = !file.problems.length && !file.notices.length
  return (
    <div className="tax-return-file">
      <p>{t('taxReturn.file.lead')}</p>

      <h3 className="tax-return-checks-title">
        {t(file.problems.length ? 'taxReturn.file.stopped' : sendable ? 'taxReturn.file.ready' : 'taxReturn.file.checkOnly')}
      </h3>
      {file.problems.length ? (
        <ul className="tax-return-check-list">
          {file.problems.map((problem, index) => (
            <IssueRow key={index} tone="crit" label={t('taxReturn.state.crit')} text={problemText(t, problem)} jump={problemJump(problem)} onJump={onJump} />
          ))}
        </ul>
      ) : null}
      {file.notices.length ? (
        <ul className="tax-return-check-list">
          {file.notices.map((notice, index) => (
            <li key={index}>
              <Pill tone="warn">{t('taxReturn.state.warn')}</Pill>
              <span>{noticeText(t, notice)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {file.remarks.length ? (
        <ul className="tax-return-check-list">
          {file.remarks.map((remark) => (
            <li key={remark.key}>
              <Pill tone="neutral">{t('taxReturn.remarkTag')}</Pill>
              <span>{remarkText(t, remark)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {view.inputs.shareholders.length ? (
        <fieldset id={anchorId('ids')} tabIndex={-1} className="tax-return-fieldset tax-return-ids">
          <legend>{t('taxReturn.file.ids')}</legend>
          <p className="muted">{t('taxReturn.file.idsLead')}</p>
          {view.inputs.shareholders.map((holder, index) => (
            <label key={holder.name} className={file.problems.some((p) => p.key === 'shareholder_id' && p.name === holder.name) ? 'tax-return-id-open' : undefined}>
              {t('taxReturn.file.idLabel', { name: holder.name })}
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={ids[index] ?? ''}
                onChange={(e) => {
                  const next = [...ids]
                  next[index] = e.target.value
                  setIds(next)
                }}
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <p className="tax-return-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!file.bytes}
          onClick={() => {
            const fresh = ilmoitinFile(view, { ids, now: new Date() })
            if (fresh.bytes) downloadFile(fresh.bytes, fresh.name, 'text/plain;charset=iso-8859-1')
          }}
        >
          {t('taxReturn.file.download')}
        </button>
      </p>
      <p className="muted">{t('taxReturn.file.after')}</p>
    </div>
  )
}
